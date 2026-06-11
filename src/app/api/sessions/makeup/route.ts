import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createZoomMeeting } from '@/lib/zoom';
import { syncSessionToGoogleCalendar } from '@/lib/google-calendar';
import {
  sendBookingConfirmationToStudent,
  sendBookingConfirmationToTutor,
  getStudentEmails,
} from '@/lib/email';
import { postToSlack } from '@/lib/slack';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    student_id,
    tutor_id,
    scheduled_at,
    duration_minutes,
    session_type = 'Makeup Session',
    note_to_tutor = '',
  } = body;

  if (!student_id || !tutor_id || !scheduled_at || !duration_minutes) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch tutor and student — Show archived tutors here: fetches by specific ID; UI dropdowns already filter to active tutors
  const [{ data: tutor }, { data: student }] = await Promise.all([
    supabase.from('tutors').select('*').eq('id', tutor_id).single(),
    supabase.from('students').select('*').eq('id', student_id).single(),
  ]);

  if (!tutor || !student) {
    return NextResponse.json({ error: 'Tutor or student not found' }, { status: 404 });
  }

  // Conflict check — does the tutor have an overlapping scheduled session?
  const sessionStart = new Date(scheduled_at).getTime();
  const sessionEnd   = sessionStart + duration_minutes * 60_000;

  const { data: tutorSessions } = await supabase
    .from('sessions')
    .select('scheduled_at, duration_minutes')
    .eq('tutor_id', tutor_id)
    .eq('status', 'scheduled');

  const conflict = (tutorSessions ?? []).some(s => {
    const sStart = new Date(s.scheduled_at as string).getTime();
    const sEnd   = sStart + ((s.duration_minutes as number) ?? 60) * 60_000;
    return sessionStart < sEnd && sessionEnd > sStart;
  });

  if (conflict) {
    return NextResponse.json(
      { error: `Conflict — ${tutor.name} already has a session at this time. Choose a different time.` },
      { status: 409 },
    );
  }

  // Create Zoom meeting
  let zoomCreated = false;
  const meeting = await createZoomMeeting({
    topic: `StudyCore: ${student.name} with ${tutor.name} (${session_type})`,
    startTime: scheduled_at,
    durationMinutes: duration_minutes,
    zoomUserId: tutor.zoom_user_id ?? undefined,
  });
  if (meeting) zoomCreated = true;

  // Build session notes
  const sessionNotes = [
    `Type: ${session_type}`,
    note_to_tutor ? `Note: ${note_to_tutor}` : null,
  ].filter(Boolean).join(' | ');

  // Insert session
  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      tutor_id,
      student_id,
      scheduled_at,
      duration_minutes,
      payment_amount: ((tutor.hourly_rate ?? 0) * duration_minutes) / 60,
      zoom_meeting_id: meeting?.id?.toString() ?? null,
      zoom_join_url:   meeting?.join_url ?? null,
      zoom_host_url:   meeting?.start_url ?? null,
      status: 'scheduled',
      payment_status: 'pending',
      session_notes: sessionNotes || null,
    })
    .select()
    .single();

  if (error || !session) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  // Sync to Google Calendar (non-blocking)
  if (tutor.google_calendar_connected) {
    syncSessionToGoogleCalendar(session.id).catch(err =>
      console.error('syncSessionToGoogleCalendar failed:', err)
    );
  }

  // Format date/time for emails
  const sessionDate = new Date(scheduled_at).toLocaleString('en-US', {
    timeZone: student.timezone ?? 'America/New_York',
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const sessionTime = new Date(scheduled_at).toLocaleString('en-US', {
    timeZone: student.timezone ?? 'America/New_York',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

  // Send emails (non-blocking)
  getStudentEmails(student.id, student.email).then(allEmails =>
    Promise.allSettled([
      // Confirmation to student + all emails on file
      sendBookingConfirmationToStudent({
        studentEmail:     student.email,
        parentEmail:      student.parent_email,
        additionalEmails: allEmails.slice(1),
        studentName:      student.name,
        tutorName:        tutor.name,
        scheduledAt:      scheduled_at,
        durationMinutes:  duration_minutes,
        zoomJoinUrl:      meeting?.join_url,
        targetScore:      student.target_score,
        timezone:         student.timezone ?? undefined,
      }),
      // Tutor notification with note
      sendBookingConfirmationToTutor({
        tutorEmail:      tutor.email,
        tutorName:       tutor.name,
        studentName:     student.name,
        scheduledAt:     scheduled_at,
        durationMinutes: duration_minutes,
        zoomHostUrl:     meeting?.start_url,
        zoomJoinUrl:     meeting?.join_url,
        targetScore:     student.target_score,
        studentNotes: [
          `Session type: ${session_type}`,
          note_to_tutor
            ? `Note from admin: ${note_to_tutor}`
            : null,
        ].filter(Boolean).join('\n'),
        timezone:        student.timezone ?? undefined,
      }),
    ])
  ).catch(console.error);

  // Slack alert (non-blocking)
  postToSlack(
    `📅 Makeup session booked — ${student.name} with ${tutor.name} on ${sessionDate} at ${sessionTime} (${duration_minutes} min)`
  ).catch(console.error);

  return NextResponse.json({ session, zoomCreated }, { status: 201 });
}
