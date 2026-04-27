import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createZoomMeeting } from '@/lib/zoom';
import {
  sendBookingConfirmationToStudent,
  sendBookingConfirmationToTutor,
} from '@/lib/email';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tutor_id, student_id, scheduled_at, duration_minutes, create_zoom = true } = body;

  if (!tutor_id || !student_id || !scheduled_at || !duration_minutes) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch tutor and student
  const [{ data: tutor }, { data: student }] = await Promise.all([
    supabase.from('tutors').select('*').eq('id', tutor_id).single(),
    supabase.from('students').select('*').eq('id', student_id).single(),
  ]);

  if (!tutor || !student) {
    return NextResponse.json({ error: 'Tutor or student not found' }, { status: 404 });
  }

  // Require a signed contract between this tutor and student
  const { data: contract } = await supabase
    .from('contracts')
    .select('id')
    .eq('tutor_id', tutor_id)
    .eq('student_id', student_id)
    .eq('status', 'signed')
    .maybeSingle();

  if (!contract) {
    return NextResponse.json(
      { error: 'A signed contract is required before booking sessions for this tutor-student pair.' },
      { status: 403 },
    );
  }

  // Create Zoom meeting (optional)
  const meeting = create_zoom ? await createZoomMeeting({
    topic: `StudyCore SAT Session — ${student.name} with ${tutor.name}`,
    startTime: scheduled_at,
    durationMinutes: duration_minutes,
    zoomUserId: tutor.zoom_user_id ?? undefined,
  }) : null;

  // Insert session
  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      tutor_id,
      student_id,
      scheduled_at,
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
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  // Send emails (non-blocking)
  Promise.allSettled([
    sendBookingConfirmationToStudent({
      studentEmail: student.email,
      parentEmail:  student.parent_email,
      studentName:  student.name,
      tutorName:    tutor.name,
      scheduledAt:  scheduled_at,
      durationMinutes: duration_minutes,
      zoomJoinUrl:  meeting?.join_url,
      targetScore:  student.target_score,
    }),
    sendBookingConfirmationToTutor({
      tutorEmail:   tutor.email,
      tutorName:    tutor.name,
      studentName:  student.name,
      scheduledAt:  scheduled_at,
      durationMinutes: duration_minutes,
      zoomHostUrl:  meeting?.start_url,
      zoomJoinUrl:  meeting?.join_url,
      targetScore:  student.target_score,
      studentNotes: student.notes,
    }),
  ]).catch(console.error);

  return NextResponse.json(session, { status: 201 });
}
