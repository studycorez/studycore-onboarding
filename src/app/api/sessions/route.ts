import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createZoomMeeting } from '@/lib/zoom';
import { syncSessionToGoogleCalendar } from '@/lib/google-calendar';
import {
  sendBookingConfirmationToStudent,
  sendBookingConfirmationToTutor,
  getStudentEmails,
} from '@/lib/email';
import { awardBadge, awardXP } from '@/lib/xp';

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
    .select('id, permanent_zoom_link, permanent_zoom_meeting_id, permanent_zoom_host_url')
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

  // Use permanent Zoom link if available; otherwise create a per-session meeting
  let zoomMeetingId: string | null = null;
  let zoomJoinUrl: string | null = null;
  let zoomHostUrl: string | null = null;
  let usesPermanentLink = false;

  if (contract.permanent_zoom_link) {
    zoomJoinUrl = contract.permanent_zoom_link;
    zoomMeetingId = contract.permanent_zoom_meeting_id?.toString() ?? null;
    zoomHostUrl = contract.permanent_zoom_host_url ?? null;
    usesPermanentLink = true;
  } else if (create_zoom) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[session/create] scheduled_at (UTC):', scheduled_at);
      console.log('[session/create] Zoom start_time will be:', new Date(scheduled_at).toISOString());
    }
    const meeting = await createZoomMeeting({
      topic: `StudyCore SAT Session — ${student.name} with ${tutor.name}`,
      startTime: scheduled_at,
      durationMinutes: duration_minutes,
      zoomUserId: tutor.zoom_user_id ?? undefined,
    });
    if (process.env.NODE_ENV === 'development' && meeting) {
      console.log('[session/create] Zoom meeting id:', meeting.id, '— join:', meeting.join_url);
    }
    zoomMeetingId = meeting?.id?.toString() ?? null;
    zoomJoinUrl = meeting?.join_url ?? null;
    zoomHostUrl = meeting?.start_url ?? null;
  }

  // Insert session
  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      tutor_id,
      student_id,
      scheduled_at,
      duration_minutes,
      payment_amount: (tutor.hourly_rate * duration_minutes) / 60,
      zoom_meeting_id: zoomMeetingId,
      zoom_join_url:   zoomJoinUrl,
      zoom_host_url:   zoomHostUrl,
      uses_permanent_link: usesPermanentLink,
      status: 'scheduled',
      payment_status: 'pending',
    })
    .select()
    .single();

  if (error || !session) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  // Sync to Google Calendar (non-blocking, best-effort)
  if (tutor.google_calendar_connected) {
    syncSessionToGoogleCalendar(session.id).catch(err =>
      console.error('syncSessionToGoogleCalendar failed:', err)
    );
  }

  // Send emails (non-blocking)
  getStudentEmails(student.id, student.email).then(allEmails =>
  Promise.allSettled([
    sendBookingConfirmationToStudent({
      studentEmail:     student.email,
      parentEmail:      student.parent_email,
      additionalEmails: allEmails.slice(1),
      studentName:  student.name,
      tutorName:    tutor.name,
      scheduledAt:  scheduled_at,
      durationMinutes: duration_minutes,
      zoomJoinUrl:  zoomJoinUrl ?? undefined,
      targetScore:  student.target_score,
      timezone:     student.timezone ?? undefined,
    }),
    sendBookingConfirmationToTutor({
      tutorEmail:   tutor.email,
      tutorName:    tutor.name,
      studentName:  student.name,
      scheduledAt:  scheduled_at,
      durationMinutes: duration_minutes,
      zoomHostUrl:  zoomHostUrl ?? undefined,
      zoomJoinUrl:  zoomJoinUrl ?? undefined,
      targetScore:  student.target_score,
      studentNotes: student.notes,
      timezone:     student.timezone ?? undefined,
    }),
  ])).catch(console.error);

  // Check first session badge (non-blocking)
  ;(async () => {
    try {
      const { count } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', student_id);
      if (count === 1) await awardBadge(supabase as any, student_id, 'first_session');
    } catch (e) { console.error(e); }
  })();

  return NextResponse.json(session, { status: 201 });
}
