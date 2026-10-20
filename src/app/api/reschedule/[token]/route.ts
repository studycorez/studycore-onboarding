import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateZoomMeeting } from '@/lib/zoom';
import { updateGoogleCalendarEvent } from '@/lib/google-calendar';
import { sendRescheduleNotification } from '@/lib/email';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const { data: session } = await getDb()
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, status, reschedule_token_expires_at, student:students(name), tutor:tutors(name)')
    .eq('reschedule_token', params.token)
    .single();

  if (!session) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (session.status !== 'scheduled') {
    return NextResponse.json({ error: 'This session cannot be rescheduled' }, { status: 400 });
  }
  if (session.reschedule_token_expires_at && new Date(session.reschedule_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Reschedule link has expired' }, { status: 410 });
  }

  return NextResponse.json({
    id:             session.id,
    scheduled_at:   session.scheduled_at,
    duration_minutes: session.duration_minutes,
    student_name:   (session.student as any)?.name,
    tutor_name:     (session.tutor as any)?.name,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const { newScheduledAt, reason } = await req.json();
  if (!newScheduledAt || !reason) {
    return NextResponse.json({ error: 'newScheduledAt and reason are required' }, { status: 400 });
  }

  const { data: session } = await getDb()
    .from('sessions')
    .select('*, tutor:tutors(name, email), student:students(name, parent_email)')
    .eq('reschedule_token', params.token)
    .single();

  if (!session) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (session.status !== 'scheduled') {
    return NextResponse.json({ error: 'This session cannot be rescheduled' }, { status: 400 });
  }
  if (session.reschedule_token_expires_at && new Date(session.reschedule_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Reschedule link has expired' }, { status: 410 });
  }

  const oldScheduledAt = session.scheduled_at;

  await getDb().from('sessions').update({
    scheduled_at:               newScheduledAt,
    rescheduled_from:           oldScheduledAt,
    reschedule_reason:          reason,
    reschedule_count:           (session.reschedule_count ?? 0) + 1,
    reminder_24h_sent:          false,
    reminder_1h_sent:           false,
    reschedule_token:            null,   // invalidate after use
    reschedule_token_expires_at: null,
  }).eq('id', session.id);

  // Best-effort integrations
  if (session.zoom_meeting_id) {
    updateZoomMeeting(session.zoom_meeting_id, {
      startTime: newScheduledAt,
      durationMinutes: session.duration_minutes,
    }).catch(() => {});
  }
  updateGoogleCalendarEvent(session.id).catch(() => {});

  const tutor   = (session.tutor as any);
  const student = (session.student as any);
  if (tutor && student) {
    sendRescheduleNotification({
      tutorEmail:   tutor.email,
      tutorName:    tutor.name,
      studentName:  student.name,
      parentEmail:  student.parent_email,
      originalTime: oldScheduledAt,
      newTime:      newScheduledAt,
      reason,
      notes:        'Requested via self-reschedule link',
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
