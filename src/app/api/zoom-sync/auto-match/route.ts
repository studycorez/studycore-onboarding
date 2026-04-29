import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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
const SKIP_FIRST_WORDS = new Set(['studycore', 'study', 'interview', 'zoom', 'sat']);

function extractStudentName(topic: string): string {
  // Normalize apostrophe variants to plain '
  const t = topic
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g, "'")
    .trim();

  // Take the first word of the topic as the name candidate
  const firstWord = t.split(/\s+/)[0] ?? '';

  // Strip possessive 's from the end: "Eli's" → "Eli"
  const name = firstWord.replace(/'s$/i, '');

  // Skip topics that start with a known non-name word
  if (!name || SKIP_FIRST_WORDS.has(name.toLowerCase())) return '';

  return name;
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
  const { data: signed } = await supabase
    .from('contracts')
    .select('tutor_id')
    .eq('student_id', studentId)
    .eq('status', 'signed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (signed?.tutor_id) return signed.tutor_id;

  // 2. Most recent session (any previously assigned tutor)
  const { data: session } = await supabase
    .from('sessions')
    .select('tutor_id')
    .eq('student_id', studentId)
    .not('tutor_id', 'is', null)
    .order('scheduled_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (session?.tutor_id) return session.tutor_id;

  // 3. Any contract (pending/voided)
  const { data: anyContract } = await supabase
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
  try {
    const body = await req.json();
    const meetings: UnmatchedMeeting[] = body.meetings ?? [];

    const skipped_short = meetings.filter(m => m.duration < 5).length;
    const eligible = meetings.filter(m => m.duration >= 5);

    if (eligible.length === 0) {
      return NextResponse.json({ matched: 0, skipped_no_student: 0, skipped_short, matchedMeetingIds: [] });
    }

    // Load students and tutors once
    const { data: students } = await supabase.from('students').select('id, name, email');
    const studentList: Student[] = students ?? [];

    const { data: tutors } = await supabase.from('tutors').select('id, name');
    const tutorList: { id: string; name: string }[] = tutors ?? [];

    // Get Zoom token for participant email fallback
    let zoomToken: string | null = null;
    try { zoomToken = await getZoomToken(); } catch { /* best-effort */ }

    let matched = 0;
    let matchedNullTutor = 0;
    let skipped_no_student = 0;
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

      // ── 4. Create session (null tutor allowed if schema migration applied) ─
      const { error: insertErr } = await supabase.from('sessions').insert({
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

    return NextResponse.json({ matched, matchedNullTutor, skipped_no_student, skipped_short, matchedMeetingIds });
  } catch (err: any) {
    console.error('[auto-match] error:', err);
    return NextResponse.json({ error: err.message ?? 'Auto-match failed' }, { status: 500 });
  }
}
