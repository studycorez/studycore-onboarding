/**
 * Standalone auto-match runner.
 * Fetches Zoom meetings from the last 6 months, skips ones already matched
 * (have a zoom_meeting_id on a session), then tries to create sessions for
 * the rest using name-extraction + matching cascade.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/run-auto-match.ts           # dry run
 *   npx ts-node --project tsconfig.json scripts/run-auto-match.ts --write   # insert sessions
 *
 * Prerequisite — run this in the Supabase SQL editor before using null-tutor fallback:
 *   ALTER TABLE sessions ALTER COLUMN tutor_id DROP NOT NULL;
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DRY_RUN = !process.argv.includes('--write');

interface Student { id: string; name: string; email: string }
interface Tutor   { id: string; name: string }

// ── Zoom auth ─────────────────────────────────────────────────────────────────

async function getZoomToken(): Promise<string> {
  const creds = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    { method: 'POST', headers: { Authorization: `Basic ${creds}` } }
  );
  if (!res.ok) throw new Error(`Zoom token error: ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

async function getZoomUserId(token: string): Promise<string> {
  const res = await fetch('https://api.zoom.us/v2/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Could not fetch Zoom user: ${await res.text()}`);
  const data = await res.json();
  return data.id as string;
}

async function fetchAllMeetings(token: string): Promise<any[]> {
  const meetings: any[] = [];
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const slices: { from: string; to: string }[] = [];
  const cursor = new Date(sixMonthsAgo);
  while (cursor < now) {
    const sliceFrom = cursor.toISOString().slice(0, 10);
    cursor.setMonth(cursor.getMonth() + 1);
    const sliceTo = (cursor < now ? cursor : now).toISOString().slice(0, 10);
    slices.push({ from: sliceFrom, to: sliceTo });
  }

  const userId = await getZoomUserId(token);

  for (const { from, to } of slices) {
    let nextPageToken = '';
    do {
      const url = new URL(`https://api.zoom.us/v2/report/users/${userId}/meetings`);
      url.searchParams.set('from', from);
      url.searchParams.set('to', to);
      url.searchParams.set('page_size', '300');
      if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.error(`Reports API error ${res.status} for ${from}→${to}:`, await res.text());
        break;
      }
      const data = await res.json();
      meetings.push(...(data.meetings ?? []));
      nextPageToken = data.next_page_token ?? '';
    } while (nextPageToken);
  }

  return meetings;
}

async function fetchParticipantEmails(token: string, meetingId: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://api.zoom.us/v2/report/meetings/${meetingId}/participants?page_size=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.participants ?? [])
      .map((p: any) => (p.user_email ?? p.email ?? '').toLowerCase().trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ── Name matching helpers ─────────────────────────────────────────────────────

const SKIP_FIRST_WORDS = new Set(['studycore', 'study', 'interview', 'zoom', 'sat']);

function normName(s: string): string {
  return s
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractStudentName(topic: string): string {
  const t = topic
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g, "'")
    .trim();

  const firstWord = t.split(/\s+/)[0] ?? '';
  const name = firstWord.replace(/'s$/i, '');

  if (!name || SKIP_FIRST_WORDS.has(name.toLowerCase())) return '';
  return name;
}

function matchStudentByName(extracted: string, students: Student[]): Student | null {
  const n = normName(extracted);
  if (!n) return null;

  const exact = students.find(s => normName(s.name) === n);
  if (exact) return exact;

  const contains = students.find(s => {
    const sn = normName(s.name);
    const snTokens = sn.split(' ');
    return snTokens.includes(n) || n.includes(sn);
  });
  if (contains) return contains;

  const parts = n.split(' ');
  const first = parts[0];
  const partialLast = parts.slice(1).join(' ');
  if (partialLast) {
    const partialMatch = students.find(s => {
      const sp = normName(s.name).split(' ');
      const sFirst = sp[0];
      const sLast = sp.slice(1).join(' ');
      return sFirst === first && sLast.startsWith(partialLast);
    });
    if (partialMatch) return partialMatch;
  }

  const firstOnly = students.filter(s => normName(s.name).split(' ')[0] === first);
  if (firstOnly.length === 1) return firstOnly[0];

  return null;
}

function matchStudentByEmail(emails: string[], students: Student[]): Student | null {
  for (const email of emails) {
    const match = students.find(s => s.email.toLowerCase() === email);
    if (match) return match;
  }
  return null;
}

// ── Tutor extraction from topic ───────────────────────────────────────────────
// Topics like "Pierre - David Zhu" or "Shaan & David" or "Session with Pierre"
// The tutor name appears after delimiters: " - ", " & ", " with ".

function extractTutorCandidateFromTopic(topic: string): string {
  const t = topic
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g, "'")
    .trim();

  // After " - " or " – "
  const dashMatch = t.match(/\s[–-]\s(.+)$/i);
  if (dashMatch) return dashMatch[1].trim();

  // After " & "
  const ampMatch = t.match(/\s&\s(.+)$/i);
  if (ampMatch) return ampMatch[1].trim();

  // After " with "
  const withMatch = t.match(/\bwith\s(.+)$/i);
  if (withMatch) return withMatch[1].trim();

  return '';
}

function matchTutorByName(candidate: string, tutors: Tutor[]): Tutor | null {
  const n = normName(candidate);
  if (!n) return null;

  // Exact full name
  const exact = tutors.find(t => normName(t.name) === n);
  if (exact) return exact;

  // First name only if unambiguous
  const firstOnly = tutors.filter(t => normName(t.name).split(' ')[0] === n.split(' ')[0]);
  if (firstOnly.length === 1) return firstOnly[0];

  // Substring: candidate appears as a token in tutor name
  const tokens = n.split(' ');
  const contains = tutors.find(t => {
    const tn = normName(t.name);
    return tokens.every(tok => tn.split(' ').includes(tok));
  });
  if (contains) return contains;

  return null;
}

// ── Tutor resolution (4-step cascade) ────────────────────────────────────────

async function resolveTutorId(
  studentId: string,
  topic: string,
  tutors: Tutor[],
): Promise<string | null> {
  // 1. Most recent signed contract
  const { data: signed } = await supabase
    .from('contracts')
    .select('tutor_id')
    .eq('student_id', studentId)
    .eq('status', 'signed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (signed?.tutor_id) return signed.tutor_id;

  // 2. Most recent session (any tutor previously assigned)
  const { data: session } = await supabase
    .from('sessions')
    .select('tutor_id')
    .eq('student_id', studentId)
    .not('tutor_id', 'is', null)
    .order('scheduled_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (session?.tutor_id) return session.tutor_id;

  // 3. Any contract (pending/voided) — last resort DB lookup
  const { data: anyContract } = await supabase
    .from('contracts')
    .select('tutor_id')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (anyContract?.tutor_id) return anyContract.tutor_id;

  // 4. Extract tutor name from the meeting topic
  const candidate = extractTutorCandidateFromTopic(topic);
  if (candidate) {
    const tutor = matchTutorByName(candidate, tutors);
    if (tutor) return tutor.id;
  }

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log('  StudyCore — Auto-Match Zoom Meetings');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (pass --write to insert sessions)' : '⚠️  WRITE MODE'}`);
  console.log(`${'═'.repeat(70)}\n`);

  const token = await getZoomToken();
  console.log('  ✓ Zoom token acquired');

  const allMeetings = await fetchAllMeetings(token);
  console.log(`  ✓ Fetched ${allMeetings.length} meetings from Zoom`);

  // Load all matched meeting IDs from DB
  const { data: matchedRows } = await supabase
    .from('sessions')
    .select('zoom_meeting_id')
    .not('zoom_meeting_id', 'is', null);
  const matchedIds = new Set((matchedRows ?? []).map(r => String(r.zoom_meeting_id)));

  // Load students
  const { data: students } = await supabase.from('students').select('id, name, email');
  const studentList: Student[] = students ?? [];

  // Load tutors
  const { data: tutors } = await supabase.from('tutors').select('id, name');
  const tutorList: Tutor[] = tutors ?? [];

  console.log(`  ✓ Loaded ${studentList.length} students, ${tutorList.length} tutors\n`);

  // Filter to unmatched meetings with duration >= 5
  const unmatched = allMeetings.filter(m =>
    !matchedIds.has(String(m.id)) && (m.duration ?? 0) >= 5
  );
  const skipped_short = allMeetings.filter(m =>
    !matchedIds.has(String(m.id)) && (m.duration ?? 0) < 5
  ).length;

  console.log(`  Already matched  : ${matchedIds.size}`);
  console.log(`  Skipped (< 5min) : ${skipped_short}`);
  console.log(`  Eligible         : ${unmatched.length}\n`);

  let matchedByName = 0;
  let matchedByEmail = 0;
  let skipped_no_student = 0;
  let insertedNullTutor = 0;
  let insertFailed = 0;

  for (const meeting of unmatched) {
    const meetingId = String(meeting.id);
    const topic: string = meeting.topic ?? '';
    const startTime: string = meeting.start_time ?? '';
    const duration: number = meeting.duration ?? 0;

    // ── 1. Match student ───────────────────────────────────────────────────
    const extracted = extractStudentName(topic);
    let student = extracted ? matchStudentByName(extracted, studentList) : null;
    let matchMethod = 'name';

    if (!student) {
      const emails = await fetchParticipantEmails(token, meetingId);
      if (emails.length > 0) {
        student = matchStudentByEmail(emails, studentList);
        matchMethod = 'email';
      }
    }

    if (!student) {
      skipped_no_student++;
      continue;
    }

    // ── 2. Resolve tutor (4-step cascade) ─────────────────────────────────
    const tutorId = await resolveTutorId(student.id, topic, tutorList);

    if (DRY_RUN) {
      const tutorLabel = tutorId ?? 'NULL (no tutor found)';
      console.log(`  [DRY] ${matchMethod === 'name' ? '📛' : '📧'} "${topic}" → ${student.name} | tutor: ${tutorLabel}`);
      if (tutorId) {
        matchMethod === 'name' ? matchedByName++ : matchedByEmail++;
      } else {
        insertedNullTutor++;
      }
      continue;
    }

    // ── 3. Insert session ──────────────────────────────────────────────────
    const { error } = await supabase.from('sessions').insert({
      student_id: student.id,
      tutor_id: tutorId,       // null if not found (requires schema migration)
      scheduled_at: startTime,
      duration_minutes: duration || null,
      zoom_meeting_id: meetingId,
      zoom_join_url: null,
      status: 'completed',
      payment_status: 'pending',
    });

    if (error) {
      if (error.code === '23502') {
        // NOT NULL constraint — schema migration not yet applied
        console.error(`  ✗ NULL tutor rejected for "${topic}" — run: ALTER TABLE sessions ALTER COLUMN tutor_id DROP NOT NULL;`);
      } else {
        console.error(`  ✗ insert failed for ${meetingId}: ${error.message}`);
      }
      insertFailed++;
    } else {
      if (tutorId) {
        matchMethod === 'name' ? matchedByName++ : matchedByEmail++;
      } else {
        insertedNullTutor++;
      }
    }
  }

  const totalInserted = matchedByName + matchedByEmail + insertedNullTutor;

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  Matched by name         : ${matchedByName}`);
  console.log(`  Matched by email        : ${matchedByEmail}`);
  console.log(`  Inserted (null tutor)   : ${insertedNullTutor}`);
  console.log(`  Total sessions inserted : ${totalInserted}`);
  console.log(`  No student found        : ${skipped_no_student}`);
  if (!DRY_RUN) console.log(`  Insert failures         : ${insertFailed}`);
  console.log(`  Remaining unmatched     : ${unmatched.length - totalInserted - (DRY_RUN ? 0 : insertFailed)}`);
  if (DRY_RUN) console.log('\n  Re-run with --write to insert sessions.');
  console.log(`${'═'.repeat(70)}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
