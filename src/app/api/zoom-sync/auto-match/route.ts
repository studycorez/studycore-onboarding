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

function extractFirstName(topic: string): string | null {
  const match = topic.match(/^([A-Za-z]+)[\u2019\u0027\u2018\u02BC]/);
  return match ? match[1] : null;
}

async function resolveStudentId(firstName: string): Promise<string | null> {
  const { data } = await supabase
    .from('students')
    .select('id')
    .ilike('name', `${firstName}%`);
  return data?.length === 1 ? data[0].id : null;
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

    // Log raw topics to diagnose apostrophe encoding
    const sample = eligible.slice(0, 5);
    console.log('[auto-match] sample topics:');
    for (const m of sample) {
      const chars = Array.from(m.topic).map(c => `${c}(U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`).join(' ');
      console.log(`  "${m.topic}" → ${chars}`);
    }

    if (eligible.length === 0) {
      return NextResponse.json({ matched: 0, skipped_no_student: 0, skipped_short, matchedMeetingIds: [] });
    }

    let matched = 0;
    let skipped_no_student = 0;
    const matchedMeetingIds: string[] = [];

    for (const meeting of eligible) {
      // ── Student: first name from topic ───────────────────────────────────
      const firstName = extractFirstName(meeting.topic);
      if (!firstName) {
        skipped_no_student++;
        continue;
      }

      const studentId = await resolveStudentId(firstName);
      if (!studentId) {
        skipped_no_student++;
        continue;
      }

      // ── Tutor: most recent signed contract, then most recent session ──────
      const tutorId = await resolveTutorId(studentId);
      if (!tutorId) {
        console.warn(`[auto-match] no tutor found for student ${studentId}, skipping meeting ${meeting.meetingId}`);
        skipped_no_student++;
        continue;
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
