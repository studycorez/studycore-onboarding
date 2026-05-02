import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createZoomMeeting } from '@/lib/zoom';
import { syncSessionToGoogleCalendar } from '@/lib/google-calendar';
import {
  sendBookingConfirmationToStudent,
  sendBookingConfirmationToTutor,
} from '@/lib/email';

export async function POST(req: NextRequest) {
  const body = await req.json();
  // scheduled_ats: pre-computed ISO strings from the client (local-timezone-aware)
  const { student_id, tutor_id, scheduled_ats, duration_minutes } = body as {
    student_id: string;
    tutor_id: string;
    scheduled_ats: string[];
    duration_minutes: number;
  };

  if (!student_id || !tutor_id || !scheduled_ats?.length || !duration_minutes) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const [{ data: tutor }, { data: student }] = await Promise.all([
    supabase.from('tutors').select('*').eq('id', tutor_id).single(),
    supabase.from('students').select('*').eq('id', student_id).single(),
  ]);

  if (!tutor || !student) {
    return NextResponse.json({ error: 'Tutor or student not found' }, { status: 404 });
  }

  const { data: contract } = await supabase
    .from('contracts')
    .select('id')
    .eq('tutor_id', tutor_id)
    .eq('student_id', student_id)
    .eq('status', 'signed')
    .maybeSingle();

  if (!contract) {
    return NextResponse.json(
      { error: 'A signed contract is required before booking sessions.' },
      { status: 403 },
    );
  }

  // Load the tutor's existing scheduled sessions in the date range to detect conflicts
  const sorted = [...scheduled_ats].sort();
  const { data: existing } = await supabase
    .from('sessions')
    .select('scheduled_at, duration_minutes')
    .eq('tutor_id', tutor_id)
    .eq('status', 'scheduled')
    .gte('scheduled_at', sorted[0])
    .lte('scheduled_at', sorted[sorted.length - 1]);

  // Working copy we append to as we book (so intra-batch conflicts are caught too)
  const occupiedSlots: { start: number; end: number }[] = (existing ?? []).map(s => ({
    start: new Date(s.scheduled_at).getTime(),
    end:   new Date(s.scheduled_at).getTime() + (s.duration_minutes || 60) * 60_000,
  }));

  function conflicts(iso: string): boolean {
    const start = new Date(iso).getTime();
    const end   = start + duration_minutes * 60_000;
    return occupiedSlots.some(slot => start < slot.end && end > slot.start);
  }

  const booked: object[] = [];
  const skipped: { date: string; reason: string }[] = [];

  for (const scheduledAt of scheduled_ats) {
    if (conflicts(scheduledAt)) {
      skipped.push({ date: scheduledAt, reason: 'Conflict with existing session' });
      continue;
    }

    const meeting = await createZoomMeeting({
      topic: `StudyCore SAT Session — ${student.name} with ${tutor.name}`,
      startTime: scheduledAt,
      durationMinutes: duration_minutes,
      zoomUserId: tutor.zoom_user_id ?? undefined,
    });

    const { data: session, error } = await supabase
      .from('sessions')
      .insert({
        tutor_id,
        student_id,
        scheduled_at: scheduledAt,
        duration_minutes,
        payment_amount: (tutor.hourly_rate * duration_minutes) / 60,
        zoom_meeting_id: meeting?.id?.toString() ?? null,
        zoom_join_url:   meeting?.join_url ?? null,
        zoom_host_url:   meeting?.start_url ?? null,
        status: 'scheduled',
        payment_status: 'pending',
      })
      .select()
      .single();

    if (error || !session) {
      skipped.push({ date: scheduledAt, reason: error?.message ?? 'Insert failed' });
      continue;
    }

    // Register as occupied so later slots in this batch see it
    const start = new Date(scheduledAt).getTime();
    occupiedSlots.push({ start, end: start + duration_minutes * 60_000 });

    if (tutor.google_calendar_connected) {
      syncSessionToGoogleCalendar(session.id).catch(console.error);
    }

    Promise.allSettled([
      sendBookingConfirmationToStudent({
        studentEmail:    student.email,
        parentEmail:     student.parent_email,
        studentName:     student.name,
        tutorName:       tutor.name,
        scheduledAt,
        durationMinutes: duration_minutes,
        zoomJoinUrl:     meeting?.join_url,
        targetScore:     student.target_score,
        timezone:        student.timezone ?? undefined,
      }),
      sendBookingConfirmationToTutor({
        tutorEmail:      tutor.email,
        tutorName:       tutor.name,
        studentName:     student.name,
        scheduledAt,
        durationMinutes: duration_minutes,
        zoomHostUrl:     meeting?.start_url,
        zoomJoinUrl:     meeting?.join_url,
        targetScore:     student.target_score,
        studentNotes:    student.notes,
        timezone:        student.timezone ?? undefined,
      }),
    ]).catch(console.error);

    booked.push(session);
  }

  return NextResponse.json({ booked, skipped });
}
