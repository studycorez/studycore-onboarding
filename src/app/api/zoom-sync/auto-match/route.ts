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

async function getZoomToken(): Promise<string> {
  const creds = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    { method: 'POST', headers: { Authorization: `Basic ${creds}` } },
  );
  if (!res.ok) throw new Error(`Zoom token error: ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

async function getMeetingParticipantEmails(meetingId: string, token: string): Promise<string[]> {
  const emails: string[] = [];
  let nextPageToken = '';

  do {
    const url = new URL(`https://api.zoom.us/v2/report/meetings/${meetingId}/participants`);
    url.searchParams.set('page_size', '300');
    if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.error(`[auto-match] participants error for ${meetingId}: ${res.status} ${await res.text()}`);
      break;
    }

    const data = await res.json();
    for (const p of data.participants ?? []) {
      if (p.user_email) emails.push((p.user_email as string).toLowerCase());
    }
    nextPageToken = data.next_page_token ?? '';
  } while (nextPageToken);

  return emails;
}

function extractFirstName(topic: string): string | null {
  const match = topic.match(/^([A-Za-z]+)[\u2019\u0027\u2018\u02BC]/);
  return match ? match[1] : null;
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

    // Log raw topics to diagnose apostrophe encoding
    const sample = eligible.slice(0, 5);
    console.log('[auto-match] sample topics:');
    for (const m of sample) {
      const chars = Array.from(m.topic).map(c => `${c}(U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`).join(' ');
      console.log(`  "${m.topic}" → ${chars}`);
    }

    const zoomToken = await getZoomToken();

    let matched = 0;
    let skipped_no_student = 0;
    const matchedMeetingIds: string[] = [];

    for (const meeting of eligible) {
      // ── a. Student: name match from topic ────────────────────────────────
      let studentId: string | null = null;
      const firstName = extractFirstName(meeting.topic);
      if (firstName) {
        const { data: studentHits } = await supabase
          .from('students')
          .select('id')
          .ilike('name', `${firstName}%`);
        if (studentHits?.length === 1) studentId = studentHits[0].id;
      }

      if (!studentId) {
        skipped_no_student++;
        continue;
      }

      // ── b. Tutor: email match from Zoom participants ──────────────────────
      let tutorId: string | null = null;
      const participantEmails = await getMeetingParticipantEmails(meeting.meetingId, zoomToken);
      if (participantEmails.length > 0) {
        const { data: tutorHits } = await supabase
          .from('tutors')
          .select('id')
          .in('email', participantEmails);
        if (tutorHits?.length === 1) tutorId = tutorHits[0].id;
      }

      // ── Create session ────────────────────────────────────────────────────
      const { error: insertErr } = await supabase.from('sessions').insert({
        student_id: studentId,
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
