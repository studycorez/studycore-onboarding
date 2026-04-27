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

// "Medha's SAT Session" → "Medha"
// "Eli's StudyCore SAT Session" → "Eli"
// Handles both straight (') and curly (') apostrophes
function extractFirstName(topic: string): string | null {
  const match = topic.match(/([A-Za-z]+)['\u2019]s\b/i);
  return match ? match[1] : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const meetings: UnmatchedMeeting[] = body.meetings ?? [];

    if (meetings.length === 0) {
      return NextResponse.json({ matched: 0, skipped_ambiguous: 0, skipped_no_match: 0, matchedMeetingIds: [] });
    }

    const { data: students } = await supabase.from('students').select('id, name');
    const studentList: { id: string; name: string }[] = students ?? [];

    let matched = 0;
    let skipped_ambiguous = 0;
    let skipped_no_match = 0;
    const matchedMeetingIds: string[] = [];

    for (const meeting of meetings) {
      const firstName = extractFirstName(meeting.topic);

      if (!firstName) {
        skipped_no_match++;
        continue;
      }

      const hits = studentList.filter(s => {
        const studentFirst = s.name.trim().split(/\s+/)[0];
        return studentFirst.toLowerCase() === firstName.toLowerCase();
      });

      if (hits.length === 0) {
        skipped_no_match++;
        continue;
      }

      if (hits.length > 1) {
        skipped_ambiguous++;
        continue;
      }

      // Exactly one match — create session record
      const { error: insertErr } = await supabase.from('sessions').insert({
        student_id: hits[0].id,
        tutor_id: null,
        scheduled_at: meeting.startTime,
        duration_minutes: meeting.duration || null,
        zoom_meeting_id: meeting.meetingId,
        zoom_join_url: null,
        status: 'completed',
        payment_status: 'pending',
      });

      if (insertErr) {
        console.error(`[auto-match] insert failed for meeting ${meeting.meetingId}:`, insertErr.message);
        skipped_no_match++;
        continue;
      }

      matched++;
      matchedMeetingIds.push(meeting.meetingId);
    }

    return NextResponse.json({ matched, skipped_ambiguous, skipped_no_match, matchedMeetingIds });
  } catch (err: any) {
    console.error('[auto-match] error:', err);
    return NextResponse.json({ error: err.message ?? 'Auto-match failed' }, { status: 500 });
  }
}
