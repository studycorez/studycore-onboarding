/**
 * Standalone auto-match runner.
 * Fetches Zoom meetings from the last 6 months, skips ones already matched
 * (have a zoom_meeting_id on a session), then tries to create sessions for
 * the rest using the same name-extraction + matching cascade as the API route.
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/run-auto-match.ts
 *   --write   actually insert sessions (default: dry run)
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

// ── Name matching ─────────────────────────────────────────────────────────────

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

async function resolveTutorId(studentId: string): Promise<string | null> {
  const { data: contract } = await supabase
    .from('contracts')
    .select('tutor_id')
    .eq('student_id', studentId)
    .eq('status', 'signed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (contract?.tutor_id) return contract.tutor_id;

  const { data: session } = await supabase
    .from('sessions')
    .select('tutor_id')
    .eq('student_id', studentId)
    .order('scheduled_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return session?.tutor_id ?? null;
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
  console.log(`  ✓ Loaded ${studentList.length} students\n`);

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
  let skipped_no_tutor = 0;
  let insertFailed = 0;

  for (const meeting of unmatched) {
    const meetingId = String(meeting.id);
    const topic: string = meeting.topic ?? '';
    const startTime: string = meeting.start_time ?? '';
    const duration: number = meeting.duration ?? 0;

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

    const tutorId = await resolveTutorId(student.id);
    if (!tutorId) {
      skipped_no_tutor++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY] ${matchMethod === 'name' ? '📛' : '📧'} "${topic}" → ${student.name} (tutor ${tutorId})`);
      matchMethod === 'name' ? matchedByName++ : matchedByEmail++;
      continue;
    }

    const { error } = await supabase.from('sessions').insert({
      student_id: student.id,
      tutor_id: tutorId,
      scheduled_at: startTime,
      duration_minutes: duration || null,
      zoom_meeting_id: meetingId,
      zoom_join_url: null,
      status: 'completed',
      payment_status: 'pending',
    });

    if (error) {
      console.error(`  ✗ insert failed for ${meetingId}: ${error.message}`);
      insertFailed++;
    } else {
      matchMethod === 'name' ? matchedByName++ : matchedByEmail++;
    }
  }

  const totalMatched = matchedByName + matchedByEmail;

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  Matched by name   : ${matchedByName}`);
  console.log(`  Matched by email  : ${matchedByEmail}`);
  console.log(`  Total matched     : ${totalMatched}`);
  console.log(`  No student found  : ${skipped_no_student}`);
  console.log(`  No tutor found    : ${skipped_no_tutor}`);
  if (!DRY_RUN) console.log(`  Insert failures   : ${insertFailed}`);
  console.log(`  Remaining unmatched: ${unmatched.length - totalMatched - skipped_no_tutor - insertFailed}`);
  if (DRY_RUN) console.log('\n  Re-run with --write to insert sessions.');
  console.log(`${'═'.repeat(70)}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
