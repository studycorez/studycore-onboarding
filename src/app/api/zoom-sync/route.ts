import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { applySessionHoursForStudent } from '@/lib/apply-session-hours';
import { computeSessionHours } from '@/lib/hours-policy';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

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

async function fetchPreviousMeetings(token: string): Promise<any[]> {
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

// Fetch participant emails for a single meeting (best-effort, returns [] on failure)
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

// Normalize: lowercase, collapse whitespace, unify all apostrophe variants
function normName(s: string): string {
  return s
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Extract the student-name portion from a Zoom topic.
// Handles formats like:
//   "Mya's SAT Prep"  →  "Mya"
//   "Pierre DeFelice's session"  →  "Pierre DeFelice"
//   "Mya & Akshya"  →  "Mya"
//   "Pierre - David Zhu"  →  "Pierre"
//   "Student with Tutor"  →  "Student"
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

interface Student { id: string; name: string; email: string }

// Cascade: full name → contains → first+partial-last → first-only (unique)
function matchStudentByName(extracted: string, students: Student[]): Student | null {
  const n = normName(extracted);
  if (!n) return null;

  // 1. Exact full name
  const exact = students.find(s => normName(s.name) === n);
  if (exact) return exact;

  // 2. n matches a complete word token in student name (e.g. "Sara" in "Sara Kalangi")
  //    OR student name is fully contained in n (e.g. "Chisom" in "Chisom Ezeanyika")
  //    Word-boundary check prevents "sara" matching "saisaran"
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

export interface SyncResult {
  meetingsFound: number;
  matchedById: number;
  matchedByName: number;
  matchedByEmail: number;
  unmatched: UnmatchedMeeting[];
  report: SyncReport;
}

export interface UnmatchedMeeting {
  meetingId: string;
  topic: string;
  startTime: string;
  duration: number;
}

export interface SyncReport {
  noZoomSessions: { name: string; email: string }[];
  staleStudents: { name: string; email: string; lastSessionAt: string }[];
}

export async function POST(_req: NextRequest) {
  try {
    const token = await getZoomToken();
    const meetings = await fetchPreviousMeetings(token);

    // Load all active students (with email for participant matching)
    const { data: students } = await getDb()
      .from('students')
      .select('id, name, email');
    const studentList: Student[] = students ?? [];

    let matchedById = 0;
    let matchedByName = 0;
    let matchedByEmail = 0;
    const unmatched: UnmatchedMeeting[] = [];

    for (const meeting of meetings) {
      const meetingId = String(meeting.id);
      const topic: string = meeting.topic ?? '';
      const startTime: string = meeting.start_time ?? '';
      const duration: number = meeting.duration ?? 0;

      // ── 1. Match by zoom_meeting_id (already linked) ──────────────────────
      const { data: sessionById } = await getDb()
        .from('sessions')
        .select('id, status, student_id')
        .eq('zoom_meeting_id', meetingId)
        .maybeSingle();

      if (sessionById) {
        const updates: Record<string, unknown> = {};
        if (duration) updates.duration_minutes = duration;
        if (sessionById.status !== 'completed') updates.status = 'completed';
        if (Object.keys(updates).length > 0) {
          await getDb().from('sessions').update(updates).eq('id', sessionById.id);
          // Attribute hours using new policy (scheduled placeholder until actual runtime wired)
          const sessionScheduledMin1 = duration ?? 60;
          const policyResult1 = computeSessionHours({
            studentRuntimeMin: sessionScheduledMin1,
            tutorRuntimeMin: sessionScheduledMin1,
            scheduledDurationMin: sessionScheduledMin1,
          });
          await applySessionHoursForStudent(getDb(), {
            sessionId: sessionById.id,
            studentId: sessionById.student_id,
            newHoursAttributed: policyResult1.hours,
            newHoursSource: 'scheduled',
            finalize: false,
            context: {
              source: 'session_completion',
              actor: 'zoom-sync',
              reason: 'Match strategy: by-id',
            },
          });
        }
        matchedById++;
        continue;
      }

      // ── 2. Match by student name extracted from topic ─────────────────────
      const extracted = extractStudentName(topic);
      const matchedStudent = extracted ? matchStudentByName(extracted, studentList) : null;

      if (matchedStudent && startTime) {
        const { data: candidateSessions } = await getDb()
          .from('sessions')
          .select('id, scheduled_at, status')
          .eq('student_id', matchedStudent.id)
          .is('zoom_meeting_id', null);

        if (candidateSessions && candidateSessions.length > 0) {
          const meetingMs = new Date(startTime).getTime();
          const closest = candidateSessions.reduce((best, s) => {
            const diff = Math.abs(new Date(s.scheduled_at).getTime() - meetingMs);
            const bestDiff = Math.abs(new Date(best.scheduled_at).getTime() - meetingMs);
            return diff < bestDiff ? s : best;
          });

          const diffHours = Math.abs(new Date(closest.scheduled_at).getTime() - meetingMs) / 3600000;
          if (diffHours <= 4) {
            const updates: Record<string, unknown> = {
              zoom_meeting_id: meetingId,
              status: 'completed',
            };
            if (duration) updates.duration_minutes = duration;
            await getDb().from('sessions').update(updates).eq('id', closest.id);
            // Attribute hours using new policy (scheduled placeholder until actual runtime wired)
            const sessionScheduledMin2 = duration ?? 60;
            const policyResult2 = computeSessionHours({
              studentRuntimeMin: sessionScheduledMin2,
              tutorRuntimeMin: sessionScheduledMin2,
              scheduledDurationMin: sessionScheduledMin2,
            });
            await applySessionHoursForStudent(getDb(), {
              sessionId: closest.id,
              studentId: matchedStudent.id,
              newHoursAttributed: policyResult2.hours,
              newHoursSource: 'scheduled',
              finalize: false,
              context: {
                source: 'session_completion',
                actor: 'zoom-sync',
                reason: 'Match strategy: by-name',
              },
            });
            matchedByName++;
            continue;
          }
        }
      }

      // ── 3. Match by participant email (best-effort) ───────────────────────
      const participantEmails = await fetchParticipantEmails(token, meetingId);
      const emailMatch = participantEmails.length > 0
        ? matchStudentByEmail(participantEmails, studentList)
        : null;

      if (emailMatch && startTime) {
        const { data: candidateSessions } = await getDb()
          .from('sessions')
          .select('id, scheduled_at, status')
          .eq('student_id', emailMatch.id)
          .is('zoom_meeting_id', null);

        if (candidateSessions && candidateSessions.length > 0) {
          const meetingMs = new Date(startTime).getTime();
          const closest = candidateSessions.reduce((best, s) => {
            const diff = Math.abs(new Date(s.scheduled_at).getTime() - meetingMs);
            const bestDiff = Math.abs(new Date(best.scheduled_at).getTime() - meetingMs);
            return diff < bestDiff ? s : best;
          });

          const diffHours = Math.abs(new Date(closest.scheduled_at).getTime() - meetingMs) / 3600000;
          if (diffHours <= 4) {
            const updates: Record<string, unknown> = {
              zoom_meeting_id: meetingId,
              status: 'completed',
            };
            if (duration) updates.duration_minutes = duration;
            await getDb().from('sessions').update(updates).eq('id', closest.id);
            // Attribute hours using new policy (scheduled placeholder until actual runtime wired)
            const sessionScheduledMin3 = duration ?? 60;
            const policyResult3 = computeSessionHours({
              studentRuntimeMin: sessionScheduledMin3,
              tutorRuntimeMin: sessionScheduledMin3,
              scheduledDurationMin: sessionScheduledMin3,
            });
            await applySessionHoursForStudent(getDb(), {
              sessionId: closest.id,
              studentId: emailMatch.id,
              newHoursAttributed: policyResult3.hours,
              newHoursSource: 'scheduled',
              finalize: false,
              context: {
                source: 'session_completion',
                actor: 'zoom-sync',
                reason: 'Match strategy: by-email',
              },
            });
            matchedByEmail++;
            continue;
          }
        }
      }

      // ── 4. No match ───────────────────────────────────────────────────────
      unmatched.push({ meetingId, topic: topic || '(no topic)', startTime, duration });
    }

    // ── Post-sync report ──────────────────────────────────────────────────────
    const threeWeeksAgo = new Date();
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

    const { data: activeStudents } = await getDb()
      .from('students')
      .select('id, name, email')
      .eq('status', 'active');

    const noZoomSessions: { name: string; email: string }[] = [];
    const staleStudents: { name: string; email: string; lastSessionAt: string }[] = [];

    for (const student of activeStudents ?? []) {
      const { data: zoomSess } = await getDb()
        .from('sessions')
        .select('scheduled_at')
        .eq('student_id', student.id)
        .not('zoom_meeting_id', 'is', null)
        .order('scheduled_at', { ascending: false })
        .limit(1);

      if (!zoomSess || zoomSess.length === 0) {
        noZoomSessions.push({ name: student.name, email: student.email });
      } else {
        const lastAt = new Date(zoomSess[0].scheduled_at);
        if (lastAt < threeWeeksAgo) {
          staleStudents.push({ name: student.name, email: student.email, lastSessionAt: zoomSess[0].scheduled_at });
        }
      }
    }

    const report: SyncReport = { noZoomSessions, staleStudents };

    const result: SyncResult = {
      meetingsFound: meetings.length,
      matchedById,
      matchedByName,
      matchedByEmail,
      unmatched,
      report,
    };

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('zoom-sync error:', err);
    return NextResponse.json({ error: err.message ?? 'Sync failed' }, { status: 500 });
  }
}
