import axios, { AxiosInstance } from 'axios';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env.local') });

// ── Credentials ───────────────────────────────────────────────────────────────
const GHL_API_KEY   = 'pit-3fd6e351-6df8-4149-b80e-8b605cceaab1';
const LOCATION_ID   = '67091iYHBXVeSyRGbCoq';
const BASE_URL      = 'https://services.leadconnectorhq.com';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing Supabase env vars in .env.local');
  process.exit(1);
}

// ── Clients ───────────────────────────────────────────────────────────────────
const ghl: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${GHL_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  },
  timeout: 30_000,
});

const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Report state ──────────────────────────────────────────────────────────────
const report = {
  contactsImported: 0,
  contactsSkipped: 0,
  conversationsScanned: 0,
  sessionsInserted: 0,
  sessionsSkipped: 0,
  flagged: [] as string[],
};

const extractedData: Record<string, unknown>[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────
function flag(msg: string) {
  report.flagged.push(msg);
  console.warn('  ⚑ ', msg);
}

function parseScore(val: unknown): number | null {
  const n = parseInt(String(val ?? ''), 10);
  return !isNaN(n) && n >= 400 && n <= 1600 ? n : null;
}

function parseGrade(val: unknown): number | null {
  const n = parseInt(String(val ?? ''), 10);
  return !isNaN(n) && n >= 1 && n <= 12 ? n : null;
}

/** Resolve a GHL custom field value by label or key substring (case-insensitive). */
function cfValue(
  customFields: Array<{ id: string; value: unknown; fieldKey?: string }>,
  ...labels: string[]
): string | null {
  for (const cf of customFields ?? []) {
    const key = String(cf.fieldKey ?? cf.id ?? '').toLowerCase();
    if (labels.some(l => key.includes(l.toLowerCase()))) {
      return cf.value != null ? String(cf.value).trim() || null : null;
    }
  }
  return null;
}

// ── 1. CONTACTS → students ────────────────────────────────────────────────────
async function importContacts() {
  console.log('\n── Contacts ─────────────────────────────────────────────────');

  let page = 1;
  // GHL v2 contacts pagination: meta.startAfterId + meta.startAfter (numeric timestamp)
  let cursorId: string | null = null;
  let cursorTs: number | null = null;
  const seenIds = new Set<string>(); // guard against infinite loop

  while (true) {
    const params: Record<string, string | number> = {
      locationId: LOCATION_ID,
      limit: 100,
    };
    if (cursorId) params.startAfterId = cursorId;
    if (cursorTs) params.startAfter   = cursorTs;

    let contacts: any[] = [];
    let meta: any = {};
    try {
      const res = await ghl.get('/contacts/', { params });
      contacts = res.data?.contacts ?? [];
      meta     = res.data?.meta ?? {};
    } catch (err: any) {
      console.error('  GHL contacts error:', err.response?.data ?? err.message);
      break;
    }

    if (contacts.length === 0) break;

    // Duplicate-page guard
    const firstId = contacts[0]?.id;
    if (firstId && seenIds.has(firstId)) {
      console.log('  Pagination loop detected — stopping.');
      break;
    }
    contacts.forEach((c: any) => seenIds.add(c.id));

    console.log(`  Page ${page}: ${contacts.length} contacts`);

    for (const c of contacts) {
      const cfs: any[] = c.customField ?? c.customFields ?? [];

      const name  = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || null;
      const email = c.email?.trim() || null;
      const phone = c.phone?.trim() || null;

      if (!name) {
        flag(`Contact id=${c.id} has no name — skipped`);
        report.contactsSkipped++;
        continue;
      }

      // Contacts without email get a synthetic placeholder so they can be stored
      // and manually resolved later (flagged below if synthetic)
      const resolvedEmail = email ?? `noemail-${c.id}@ghl.import`;
      if (!email) flag(`Contact "${name}" (id=${c.id}) has no email — stored with placeholder`);

      const parentName  = cfValue(cfs, 'parent_name',  'parent name',  'guardian');
      const parentEmail = cfValue(cfs, 'parent_email', 'parent email', 'guardian_email');
      const gradeRaw    = cfValue(cfs, 'grade', 'year');
      const currentRaw  = cfValue(cfs, 'current_score', 'current score', 'sat_score', 'baseline');
      const targetRaw   = cfValue(cfs, 'target_score',  'target score',  'goal_score', 'goal');

      const record = {
        name:          name,
        email:         resolvedEmail,
        phone:         phone,
        parent_name:   parentName,
        parent_email:  parentEmail,
        grade:         parseGrade(gradeRaw),
        current_score: parseScore(currentRaw),
        target_score:  parseScore(targetRaw),
      };

      const { error } = await supabase
        .from('students')
        .upsert(record, { onConflict: 'email', ignoreDuplicates: false });

      if (error) {
        flag(`Failed to upsert contact "${name}": ${error.message}`);
        report.contactsSkipped++;
      } else {
        report.contactsImported++;
      }
    }

    // Advance cursor from meta (v2 canonical pagination)
    cursorId = meta.startAfterId ?? null;
    cursorTs = meta.startAfter   ?? null;
    if (contacts.length < 100 || (!cursorId && !cursorTs)) break;
    page++;
  }

  console.log(`  ✅ Imported ${report.contactsImported} students (${report.contactsSkipped} skipped)`);
}

// ── 2. CONVERSATIONS → ghl-extracted-data.json ───────────────────────────────
async function scanConversations() {
  console.log('\n── Conversations ────────────────────────────────────────────');

  // Fetch tutor names from DB for pattern matching
  const { data: tutors } = await supabase.from('tutors').select('id, name');
  const tutorNames: string[] = (tutors ?? []).map((t: any) => t.name as string);
  const tutorNameRegex = new RegExp(
    tutorNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
    'i'
  );

  const scoreRegex   = /\b(1[0-5]\d{2}|[4-9]\d{2})\b/g;
  const dateRegex    = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+ \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?)\b/gi;
  const timeRegex    = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/gi;

  let page = 1;
  let startAfterDate: string | null = null;
  const seenConvIds = new Set<string>();

  while (true) {
    const params: Record<string, string | number> = {
      locationId: LOCATION_ID,
      limit: 100,
    };
    if (startAfterDate) params.startAfterDate = startAfterDate;

    let conversations: any[] = [];
    let meta: any = {};
    try {
      const res = await ghl.get('/conversations/search', { params });
      conversations = res.data?.conversations ?? [];
      meta          = res.data?.meta ?? {};
    } catch (err: any) {
      console.error('  GHL conversations error:', err.response?.data ?? err.message);
      break;
    }

    if (conversations.length === 0) break;

    const firstConvId = conversations[0]?.id;
    if (firstConvId && seenConvIds.has(firstConvId)) {
      console.log('  Pagination loop detected — stopping.');
      break;
    }
    conversations.forEach((c: any) => seenConvIds.add(c.id));

    console.log(`  Page ${page}: ${conversations.length} conversations`);
    report.conversationsScanned += conversations.length;

    for (const conv of conversations) {
      let messages: any[] = [];
      try {
        const msgRes = await ghl.get(`/conversations/${conv.id}/messages`);
        // v2 may nest as { messages: { messages: [...] } } or { messages: [...] }
        const raw = msgRes.data?.messages;
        if (Array.isArray(raw)) messages = raw;
        else if (raw && Array.isArray(raw.messages)) messages = raw.messages;
        else messages = [];
      } catch {
        messages = [];
      }

      const fullText = messages.map((m: any) => m.body ?? m.text ?? m.message ?? '').join(' ');
      const contactName = [conv.contactName, conv.fullName].find(Boolean) ?? null;

      const scores: number[] = [];
      let sm: RegExpExecArray | null;
      scoreRegex.lastIndex = 0;
      while ((sm = scoreRegex.exec(fullText)) !== null) scores.push(parseInt(sm[1]));

      const dates: string[] = [];
      let dm: RegExpExecArray | null;
      dateRegex.lastIndex = 0;
      while ((dm = dateRegex.exec(fullText)) !== null) dates.push(dm[1]);

      const times: string[] = [];
      let tm: RegExpExecArray | null;
      timeRegex.lastIndex = 0;
      while ((tm = timeRegex.exec(fullText)) !== null) times.push(tm[1]);
      const tutorHits = tutorNames.filter(n =>
        new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(fullText)
      );

      if (scores.length > 0 || tutorHits.length > 0 || dates.length > 0) {
        extractedData.push({
          conversationId: conv.id,
          contactName,
          contactEmail: conv.email ?? null,
          contactPhone: conv.phone ?? null,
          tutorsFound: tutorHits,
          datesFound: dates.slice(0, 5),
          timesFound: times.slice(0, 5),
          scoresFound: scores,
          messageCount: messages.length,
          lastMessageDate: conv.lastMessageDate ?? null,
        });
      }
    }

    // Advance cursor: prefer meta.lastId/startAfter, fall back to last item's date
    const nextCursor = meta.startAfterDate ?? meta.nextPageUrl ?? null;
    const lastDate   = conversations[conversations.length - 1]?.lastMessageDate ?? null;
    startAfterDate   = nextCursor ?? lastDate;
    if (conversations.length < 100 || !startAfterDate) break;
    page++;
  }

  console.log(`  ✅ Scanned ${report.conversationsScanned} conversations, ${extractedData.length} with relevant data`);

  writeFileSync(
    resolve(process.cwd(), 'ghl-extracted-data.json'),
    JSON.stringify(extractedData, null, 2)
  );
  console.log('  📄 Wrote ghl-extracted-data.json');
}

// ── 3. APPOINTMENTS → sessions ───────────────────────────────────────────────
async function importAppointments() {
  console.log('\n── Appointments ─────────────────────────────────────────────');

  // Load current tutors and students for name matching
  const { data: tutors  } = await supabase.from('tutors').select('id, name');
  const { data: students } = await supabase.from('students').select('id, name, email');

  function findTutor(name: string | null): string | null {
    if (!name || !tutors) return null;
    const lower = name.toLowerCase();
    const match = (tutors as any[]).find((t: any) =>
      t.name.toLowerCase().includes(lower) || lower.includes(t.name.toLowerCase().split(' ')[0])
    );
    return match?.id ?? null;
  }

  function findStudent(name: string | null, email: string | null): string | null {
    if (!students) return null;
    if (email) {
      const byEmail = (students as any[]).find((s: any) => s.email?.toLowerCase() === email.toLowerCase());
      if (byEmail) return byEmail.id;
    }
    if (name) {
      const lower = name.toLowerCase();
      const byName = (students as any[]).find((s: any) => s.name.toLowerCase().includes(lower) || lower.includes(s.name.toLowerCase().split(' ')[0]));
      if (byName) return byName.id;
    }
    return null;
  }

  let page = 1;
  let startAfter: string | null = null;

  while (true) {
    const params: Record<string, string | number> = {
      locationId: LOCATION_ID,
      limit: 100,
    };
    if (startAfter) params.startAfter = startAfter;

    // v2 API uses /calendars/events for appointments
    let appointments: any[] = [];
    const now = new Date();
    const rangeStart = new Date(now.getFullYear() - 2, 0, 1).toISOString();
    const rangeEnd   = new Date(now.getFullYear() + 1, 11, 31).toISOString();
    try {
      const res = await ghl.get('/calendars/events', {
        params: { locationId: LOCATION_ID, startTime: rangeStart, endTime: rangeEnd, limit: 100 },
      });
      appointments = res.data?.events ?? res.data?.appointments ?? [];
    } catch (err: any) {
      // Fallback: try /appointments/ (some sub-accounts still support it)
      if (err.response?.status === 404 || err.response?.status === 422) {
        try {
          const res2 = await ghl.get('/appointments/', { params });
          appointments = res2.data?.appointments ?? res2.data?.events ?? [];
        } catch (err2: any) {
          console.error('  Both appointment endpoints failed:', err2.response?.data ?? err2.message);
          break;
        }
      } else {
        console.error('  GHL appointments error:', err.response?.data ?? err.message);
        break;
      }
    }

    if (appointments.length === 0) break;
    console.log(`  Page ${page}: ${appointments.length} appointments`);

    for (const appt of appointments) {
      const scheduledAt = appt.startTime ?? appt.startDate ?? appt.date ?? null;
      if (!scheduledAt) {
        flag(`Appointment id=${appt.id} has no start time — skipped`);
        report.sessionsSkipped++;
        continue;
      }

      // Try to resolve tutor and student
      const assignedUser  = appt.assignedUserId ?? appt.userId ?? null;
      const tutorName     = appt.calendarName ?? appt.assignedUserName ?? null;
      const contactName   = appt.contactName ?? appt.title ?? null;
      const contactEmail  = appt.email ?? null;

      const tutorId   = findTutor(tutorName);
      const studentId = findStudent(contactName, contactEmail);

      if (!tutorId) {
        flag(`Appointment ${appt.id} (${scheduledAt}): could not match tutor "${tutorName ?? assignedUser}" — skipped`);
        report.sessionsSkipped++;
        continue;
      }
      if (!studentId) {
        flag(`Appointment ${appt.id} (${scheduledAt}): could not match student "${contactName ?? contactEmail}" — skipped`);
        report.sessionsSkipped++;
        continue;
      }

      const durationMinutes = appt.duration
        ? parseInt(appt.duration)
        : appt.endTime
          ? Math.round((new Date(appt.endTime).getTime() - new Date(scheduledAt).getTime()) / 60_000)
          : 60;

      const statusMap: Record<string, string> = {
        booked: 'scheduled', confirmed: 'scheduled', attended: 'completed',
        cancelled: 'cancelled', noshow: 'no_show', 'no-show': 'no_show',
      };
      const ghlStatus = (appt.appointmentStatus ?? appt.status ?? 'booked').toLowerCase();
      const status    = statusMap[ghlStatus] ?? 'scheduled';

      const { error } = await supabase.from('sessions').insert({
        tutor_id:         tutorId,
        student_id:       studentId,
        scheduled_at:     new Date(scheduledAt).toISOString(),
        duration_minutes: Math.max(15, Math.min(480, durationMinutes || 60)),
        status,
        payment_status:   'pending',
      });

      if (error) {
        flag(`Failed to insert session for appt ${appt.id}: ${error.message}`);
        report.sessionsSkipped++;
      } else {
        report.sessionsInserted++;
      }
    }

    startAfter = appointments[appointments.length - 1]?.id ?? null;
    if (appointments.length < 100) break;
    page++;
  }

  console.log(`  ✅ Inserted ${report.sessionsInserted} sessions (${report.sessionsSkipped} skipped)`);
}

// ── 4. Report ─────────────────────────────────────────────────────────────────
function writeReport() {
  const lines = [
    '═══════════════════════════════════════════════════════════',
    '  StudyCore — GHL Import Report',
    `  Generated: ${new Date().toISOString()}`,
    '═══════════════════════════════════════════════════════════',
    '',
    '  CONTACTS',
    `    Imported into students table : ${report.contactsImported}`,
    `    Skipped (no name/email/error): ${report.contactsSkipped}`,
    '',
    '  CONVERSATIONS',
    `    Total scanned                : ${report.conversationsScanned}`,
    `    With extractable data        : ${extractedData.length}`,
    `    Saved to ghl-extracted-data.json for review`,
    '',
    '  SESSIONS',
    `    Inserted from appointments   : ${report.sessionsInserted}`,
    `    Skipped (no match/error)     : ${report.sessionsSkipped}`,
    '',
    `  FLAGGED FOR MANUAL REVIEW (${report.flagged.length})`,
    ...report.flagged.map((f, i) => `    ${i + 1}. ${f}`),
    '',
    '═══════════════════════════════════════════════════════════',
  ];

  const content = lines.join('\n');
  writeFileSync(resolve(process.cwd(), 'import-report.txt'), content);
  console.log('\n' + content);
  console.log('\n📄 Wrote import-report.txt');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀  GHL → StudyCore import starting...');
  console.log(`    Location: ${LOCATION_ID}`);
  console.log(`    Supabase: ${SUPABASE_URL}`);

  await importContacts();
  await scanConversations();
  await importAppointments();
  writeReport();

  console.log('\n✅  Import complete.\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
