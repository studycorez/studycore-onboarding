import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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

async function fetchPreviousMeetings(token: string): Promise<any[]> {
  const meetings: any[] = [];
  let nextPageToken = '';

  do {
    const url = new URL('https://api.zoom.us/v2/users/me/meetings');
    url.searchParams.set('type', 'previous_meetings');
    url.searchParams.set('page_size', '300');
    if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;
    const data = await res.json();
    meetings.push(...(data.meetings ?? []));
    nextPageToken = data.next_page_token ?? '';
  } while (nextPageToken);

  return meetings;
}

export interface SyncResult {
  meetingsFound: number;
  matchedById: number;
  matchedByName: number;
  unmatched: UnmatchedMeeting[];
}

export interface UnmatchedMeeting {
  meetingId: string;
  topic: string;
  startTime: string;
  duration: number;
}

export async function POST(_req: NextRequest) {
  try {
    const token = await getZoomToken();
    const meetings = await fetchPreviousMeetings(token);

    // Pre-load all students for name matching
    const { data: students } = await supabase
      .from('students')
      .select('id, name');

    const studentList: { id: string; name: string }[] = students ?? [];

    let matchedById = 0;
    let matchedByName = 0;
    const unmatched: UnmatchedMeeting[] = [];

    for (const meeting of meetings) {
      const meetingId = String(meeting.id);
      const topic: string = meeting.topic ?? '';
      const startTime: string = meeting.start_time ?? '';
      const duration: number = meeting.duration ?? 0;

      // ── 1. Try match by zoom_meeting_id ───────────────────────────────────
      const { data: sessionById } = await supabase
        .from('sessions')
        .select('id, status')
        .eq('zoom_meeting_id', meetingId)
        .maybeSingle();

      if (sessionById) {
        const updates: Record<string, unknown> = {};
        if (duration) updates.duration_minutes = duration;
        if (sessionById.status !== 'completed') updates.status = 'completed';
        if (Object.keys(updates).length > 0) {
          await supabase.from('sessions').update(updates).eq('id', sessionById.id);
        }
        matchedById++;
        continue;
      }

      // ── 2. Try match by student name in topic ─────────────────────────────
      const topicLower = topic.toLowerCase();
      const matchedStudent = studentList.find(s =>
        s.name && topicLower.includes(s.name.toLowerCase())
      );

      if (matchedStudent && startTime) {
        // Find sessions for this student closest in time to the meeting start
        const { data: candidateSessions } = await supabase
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

          // Only auto-match if within 4 hours of scheduled time
          const diffHours = Math.abs(new Date(closest.scheduled_at).getTime() - meetingMs) / 3600000;
          if (diffHours <= 4) {
            const updates: Record<string, unknown> = {
              zoom_meeting_id: meetingId,
              status: 'completed',
            };
            if (duration) updates.duration_minutes = duration;
            await supabase.from('sessions').update(updates).eq('id', closest.id);
            matchedByName++;
            continue;
          }
        }
      }

      // ── 3. No match ───────────────────────────────────────────────────────
      unmatched.push({ meetingId, topic: topic || '(no topic)', startTime, duration });
    }

    const result: SyncResult = {
      meetingsFound: meetings.length,
      matchedById,
      matchedByName,
      unmatched,
    };

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('zoom-sync error:', err);
    return NextResponse.json({ error: err.message ?? 'Sync failed' }, { status: 500 });
  }
}
