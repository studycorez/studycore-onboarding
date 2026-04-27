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

async function lookupZoomUserId(emailOrId: string, token: string): Promise<string | null> {
  const res = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(emailOrId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.id as string) ?? null;
}

async function fetchPreviousMeetings(zoomUserId: string, token: string): Promise<any[]> {
  const meetings: any[] = [];
  let nextPageToken = '';

  do {
    const url = new URL(`https://api.zoom.us/v2/users/${zoomUserId}/meetings`);
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

export interface TutorSyncResult {
  tutorId: string;
  tutorName: string;
  zoomUserId: string | null;
  meetingsFound: number;
  matched: number;
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

    const { data: tutors } = await supabase
      .from('tutors')
      .select('id, name, email, zoom_user_id');

    const results: TutorSyncResult[] = [];

    for (const tutor of tutors ?? []) {
      let zoomUserId: string | null = tutor.zoom_user_id ?? null;

      // Resolve zoom_user_id via email if missing
      if (!zoomUserId && tutor.email) {
        zoomUserId = await lookupZoomUserId(tutor.email, token);
        if (zoomUserId) {
          await supabase.from('tutors').update({ zoom_user_id: zoomUserId }).eq('id', tutor.id);
        }
      }

      if (!zoomUserId) {
        results.push({ tutorId: tutor.id, tutorName: tutor.name, zoomUserId: null, meetingsFound: 0, matched: 0, unmatched: [] });
        continue;
      }

      const meetings = await fetchPreviousMeetings(zoomUserId, token);
      let matchedCount = 0;
      const unmatched: UnmatchedMeeting[] = [];

      for (const meeting of meetings) {
        const meetingId = String(meeting.id);

        const { data: session } = await supabase
          .from('sessions')
          .select('id, status')
          .eq('zoom_meeting_id', meetingId)
          .maybeSingle();

        if (session) {
          const updates: Record<string, unknown> = {};
          if (meeting.duration) updates.duration_minutes = meeting.duration;
          if (session.status !== 'completed') updates.status = 'completed';
          if (Object.keys(updates).length > 0) {
            await supabase.from('sessions').update(updates).eq('id', session.id);
          }
          matchedCount++;
        } else {
          unmatched.push({
            meetingId,
            topic: meeting.topic ?? '(no topic)',
            startTime: meeting.start_time ?? '',
            duration: meeting.duration ?? 0,
          });
        }
      }

      results.push({
        tutorId: tutor.id,
        tutorName: tutor.name,
        zoomUserId,
        meetingsFound: meetings.length,
        matched: matchedCount,
        unmatched,
      });
    }

    return NextResponse.json({ ok: true, results });
  } catch (err: any) {
    console.error('zoom-sync error:', err);
    return NextResponse.json({ error: err.message ?? 'Sync failed' }, { status: 500 });
  }
}
