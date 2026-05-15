import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function POST(req: NextRequest) {
  const supabase = makeSupabase();

  const { recording_id, tutor_id, student_id, duration_minutes, notes, started_at } =
    await req.json();

  if (!recording_id || !tutor_id || !student_id || !duration_minutes || !started_at) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Validate tutor (must exist and not be archived)
  const { data: tutor } = await supabase
    .from('tutors')
    .select('id, archived_at')
    .eq('id', tutor_id)
    .maybeSingle();

  if (!tutor) return NextResponse.json({ error: 'Tutor not found' }, { status: 404 });
  if (tutor.archived_at) return NextResponse.json({ error: 'Tutor is archived' }, { status: 400 });

  // Validate student (must exist and be active)
  const { data: student } = await supabase
    .from('students')
    .select('id, status')
    .eq('id', student_id)
    .maybeSingle();

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  if (student.status !== 'active') {
    return NextResponse.json({ error: 'Student is not active' }, { status: 400 });
  }

  // Insert the backfilled session
  const sessionNotes = ('BACKFILLED FROM FATHOM RECORDING. ' + (notes ?? '')).trim();

  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .insert({
      student_id,
      tutor_id,
      scheduled_at: started_at,
      duration_minutes: Number(duration_minutes),
      status: 'completed',
      zoom_meeting_id: null,
      session_notes: sessionNotes,
      payment_status: 'pending',
    })
    .select('id')
    .single();

  if (sessionErr) {
    return NextResponse.json(
      { error: `Failed to create session: ${sessionErr.message}` },
      { status: 500 },
    );
  }

  // Mark the recording as resolved, linking to the new session
  const { error: resolveErr } = await supabase
    .from('fathom_unmatched_recordings')
    .update({ resolved: true, resolved_session_id: session.id })
    .eq('id', recording_id);

  if (resolveErr) {
    return NextResponse.json(
      { error: `Session created (${session.id}) but recording resolve failed: ${resolveErr.message}` },
      { status: 500 },
    );
  }

  // Recompute used_hours for the student
  const { data: completedSessions } = await supabase
    .from('sessions')
    .select('duration_minutes')
    .eq('student_id', student_id)
    .in('status', ['completed', 'no_show_student']);

  const totalMinutes = (completedSessions ?? []).reduce(
    (sum, s) => sum + (s.duration_minutes ?? 0),
    0,
  );
  const newUsedHours = Math.round((totalMinutes / 60) * 2) / 2;

  await supabase.from('students').update({ used_hours: newUsedHours }).eq('id', student_id);

  return NextResponse.json({ ok: true, session_id: session.id });
}
