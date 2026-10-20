import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface UnmatchedMeeting {
  meetingId: string;
  topic: string;
  startTime: string;
  duration: number;
}

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

// ── Name matching helpers ─────────────────────────────────────────────────────

function normName(s: string): string {
  return s
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Topics without a student name — skip these entirely
const SKIP_FIRST_WORDS = new Set(['studycore', 'study', 'interview', 'zoom', 'sat', 'act']);

function extractStudentName(topic: string): string {
  // Normalize apostrophe variants to plain '
  let t = topic
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g, "'")
    .trim();

  // Take everything before the first possessive 's — handles multi-word names:
  // "Zara Ali's Study Core's Zoom Meeting" → "Zara Ali"
  // "Kathryn's Study Core's Zoom Meeting" → "Kathryn"
  // "Adam Hamid's StudyCore SAT Session"  → "Adam Hamid"
  t = t.replace(/'s\b.*/i, '').trim();

  // Strip from delimiter onwards: &, -, –, "with"
  t = t.replace(/\s*(&|–|-)\s.*/i, '').trim();
  t = t.replace(/\bwith\b.*/i, '').trim();

  // Strip trailing noise words
  t = t.replace(/\b(sat|act|prep|session|tutoring|class|review|practice|test|math|reading|writing|studycore|study|zoom|core)\b.*/i, '').trim();

  // Skip topics that start with a known non-name word
  const firstWord = t.split(/\s+/)[0] ?? '';
  if (!firstWord || SKIP_FIRST_WORDS.has(firstWord.toLowerCase())) return '';

  return t;
}

function matchStudentByName(extracted: string, students: Student[]): Student | null {
  const n = normName(extracted);
  if (!n) return null;

  // 1. Exact full name
  const exact = students.find(s => normName(s.name) === n);
  if (exact) return exact;

  // 2. n matches a complete word token in student name (e.g. "Sara" in "Sara Kalangi")
  //    OR student name is fully contained in n (e.g. "Chisom" in "Chisom Ezeanyika")
  //    Use word-boundary check to avoid "sara" matching "saisaran"
  const contains = students.find(s => {
    const sn = normName(s.name);
    const snTokens = sn.split(' ');
    return snTokens.includes(n) || n.includes(sn);
  });
  if (contains) return contains;

  // 3. First name + partial last name
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

  // 4. First name only — only if unambiguous
  const firstOnly = students.filter(s => normName(s.name).split(' ')[0] === first);
  if (firstOnly.length === 1) return firstOnly[0];

  return null;
}

function matchStudentByEmail(participantEmails: string[], students: Student[]): Student | null {
  for (const email of participantEmails) {
    const match = students.find(s => s.email.toLowerCase() === email);
    if (match) return match;
  }
  return null;
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

// ── Tutor extraction from topic ───────────────────────────────────────────────

function extractTutorCandidateFromTopic(topic: string): string {
  const t = topic
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g, "'")
    .trim();

  const dashMatch = t.match(/\s[–-]\s(.+)$/i);
  if (dashMatch) return dashMatch[1].trim();

  const ampMatch = t.match(/\s&\s(.+)$/i);
  if (ampMatch) return ampMatch[1].trim();

  const withMatch = t.match(/\bwith\s(.+)$/i);
  if (withMatch) return withMatch[1].trim();

  return '';
}

function matchTutorByName(candidate: string, tutors: { id: string; name: string }[]): string | null {
  const n = normName(candidate);
  if (!n) return null;

  const exact = tutors.find(t => normName(t.name) === n);
  if (exact) return exact.id;

  const firstOnly = tutors.filter(t => normName(t.name).split(' ')[0] === n.split(' ')[0]);
  if (firstOnly.length === 1) return firstOnly[0].id;

  const tokens = n.split(' ');
  const contains = tutors.find(t => {
    const tn = normName(t.name);
    return tokens.every(tok => tn.split(' ').includes(tok));
  });
  if (contains) return contains.id;

  return null;
}

// Tutor resolution: 4-step cascade
async function resolveTutorId(
  studentId: string,
  topic: string,
  tutors: { id: string; name: string }[],
): Promise<string | null> {
  // 1. Most recent signed contract
  const { data: signed } = await getDb()
    .from('contracts')
    .select('tutor_id')
    .eq('student_id', studentId)
    .eq('status', 'signed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (signed?.tutor_id) return signed.tutor_id;

  // 2. Most recent session (any previously assigned tutor)
  const { data: session } = await getDb()
    .from('sessions')
    .select('tutor_id')
    .eq('student_id', studentId)
    .not('tutor_id', 'is', null)
    .order('scheduled_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (session?.tutor_id) return session.tutor_id;

  // 3. Any contract (pending/voided)
  const { data: anyContract } = await getDb()
    .from('contracts')
    .select('tutor_id')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (anyContract?.tutor_id) return anyContract.tutor_id;

  // 4. Extract tutor name from meeting topic
  const candidate = extractTutorCandidateFromTopic(topic);
  if (candidate) return matchTutorByName(candidate, tutors);

  return null;
}

export async function POST(req: NextRequest) {
  if (process.env.IMPORT_LOCKED === 'true') {
    return NextResponse.json(
      { error: 'Zoom import locked: duplicate-session investigation in progress. Contact an admin to re-enable.' },
      { status: 503 },
    );
  }

  try {
    const body = await req.json();
    const meetings: UnmatchedMeeting[] = body.meetings ?? [];

    const skipped_short = meetings.filter(m => m.duration < 5).length;
    const eligible = meetings.filter(m => m.duration >= 5);

    if (eligible.length === 0) {
      return NextResponse.json({ matched: 0, skipped_no_student: 0, skipped_short, matchedMeetingIds: [] });
    }

    // Load students and tutors once
    const { data: students } = await getDb().from('students').select('id, name, email').is('merged_into_id', null);
    const studentList: Student[] = students ?? [];

    // Show archived tutors here — name-matching fallback for historical Zoom recordings; archived tutors must be resolvable
    const { data: tutors } = await getDb().from('tutors').select('id, name');
    const tutorList: { id: string; name: string }[] = tutors ?? [];

    // Get Zoom token for participant email fallback
    let zoomToken: string | null = null;
    try { zoomToken = await getZoomToken(); } catch { /* best-effort */ }

    let matched = 0;
    let matchedNullTutor = 0;
    let skipped_no_student = 0;
    let skipped_existing = 0;
    const matchedMeetingIds: string[] = [];

    for (const meeting of eligible) {
      // ── 1. Match by name extracted from topic ─────────────────────────────
      const extracted = extractStudentName(meeting.topic);
      let student = extracted ? matchStudentByName(extracted, studentList) : null;

      // ── 2. Fallback: match by participant email ───────────────────────────
      if (!student && zoomToken) {
        const emails = await fetchParticipantEmails(zoomToken, meeting.meetingId);
        if (emails.length > 0) {
          student = matchStudentByEmail(emails, studentList);
        }
      }

      if (!student) {
        skipped_no_student++;
        continue;
      }

      // ── 3. Resolve tutor (4-step cascade incl. topic extraction) ─────────
      const tutorId = await resolveTutorId(student.id, meeting.topic, tutorList);

      // ── 4. Skip if a session with this zoom_meeting_id on this date already exists ─
      // Scoped to calendar date so recurring meetings (shared zoom_meeting_id, different
      // dates) are correctly allowed per occurrence.
      const occurrenceDate = meeting.startTime.slice(0, 10); // "YYYY-MM-DD"
      const { data: existingSession } = await getDb()
        .from('sessions')
        .select('id')
        .eq('zoom_meeting_id', meeting.meetingId)
        .gte('scheduled_at', `${occurrenceDate}T00:00:00.000Z`)
        .lte('scheduled_at', `${occurrenceDate}T23:59:59.999Z`)
        .maybeSingle();
      if (existingSession) {
        console.log(`[auto-match] skipping meeting ${meeting.meetingId} (${occurrenceDate}) — session already exists`);
        skipped_existing++;
        continue;
      }

      // ── 5. Create session ─────────────────────────────────────────────────
      const { error: insertErr } = await getDb().from('sessions').insert({
        student_id: student.id,
        tutor_id: tutorId,
        scheduled_at: meeting.startTime,
        duration_minutes: meeting.duration || null,
        zoom_meeting_id: meeting.meetingId,
        zoom_join_url: null,
        status: 'completed',
        payment_status: 'pending',
      });

      if (insertErr) {
        console.error(`[auto-match] insert failed for meeting ${meeting.meetingId}:`, insertErr.message);
        skipped_no_student++;
        continue;
      }

      if (tutorId) {
        matched++;
      } else {
        matchedNullTutor++;
      }
      matchedMeetingIds.push(meeting.meetingId);
    }

    return NextResponse.json({ matched, matchedNullTutor, skipped_no_student, skipped_existing, skipped_short, matchedMeetingIds });
  } catch (err: any) {
    console.error('[auto-match] error:', err);
    return NextResponse.json({ error: err.message ?? 'Auto-match failed' }, { status: 500 });
  }
}
