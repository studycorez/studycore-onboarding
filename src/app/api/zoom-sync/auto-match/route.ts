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

function extractStudentName(topic: string): string {
  let t = topic
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g, "'")
    .trim();

  // Strip possessive suffix and everything after
  t = t.replace(/'s\b.*/i, '').trim();

  // Strip from delimiter onwards: &, -, –, "with"
  t = t.replace(/\s*(&|–|-)\s.*/i, '').trim();
  t = t.replace(/\bwith\b.*/i, '').trim();

  // Strip trailing common noise words
  t = t.replace(/\b(sat|prep|session|tutoring|class|review|practice|test|math|reading|writing)\b.*/i, '').trim();

  return t;
}

function matchStudentByName(extracted: string, students: Student[]): Student | null {
  const n = normName(extracted);
  if (!n) return null;

  // 1. Exact full name
  const exact = students.find(s => normName(s.name) === n);
  if (exact) return exact;

  // 2. Substring either way
  const contains = students.find(s => {
    const sn = normName(s.name);
    return sn.includes(n) || n.includes(sn);
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

// tutor_id is NOT NULL on sessions — look up the student's most recently
// signed contract, then fall back to their most recent past session.
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const meetings: UnmatchedMeeting[] = body.meetings ?? [];

    const skipped_short = meetings.filter(m => m.duration < 10).length;
    const eligible = meetings.filter(m => m.duration >= 10);

    if (eligible.length === 0) {
      return NextResponse.json({ matched: 0, skipped_no_student: 0, skipped_short, matchedMeetingIds: [] });
    }

    // Load students once
    const { data: students } = await supabase
      .from('students')
      .select('id, name, email');
    const studentList: Student[] = students ?? [];

    // Get Zoom token for participant email fallback
    let zoomToken: string | null = null;
    try { zoomToken = await getZoomToken(); } catch { /* best-effort */ }

    let matched = 0;
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

      // ── 3. Resolve tutor ──────────────────────────────────────────────────
      const tutorId = await resolveTutorId(student.id);
      if (!tutorId) {
        console.warn(`[auto-match] no tutor found for student ${student.id}, skipping meeting ${meeting.meetingId}`);
        skipped_no_student++;
        continue;
      }

      // ── 4. Create session ─────────────────────────────────────────────────
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

      matched++;
      matchedMeetingIds.push(meeting.meetingId);
    }

    return NextResponse.json({ matched, skipped_no_student, skipped_short, matchedMeetingIds });
  } catch (err: any) {
    console.error('[auto-match] error:', err);
    return NextResponse.json({ error: err.message ?? 'Auto-match failed' }, { status: 500 });
  }
}
