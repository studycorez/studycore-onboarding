import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateZoomMeeting } from '@/lib/zoom';
import { updateGoogleCalendarEvent } from '@/lib/google-calendar';
import { sendRescheduleNotification } from '@/lib/email';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { newScheduledAt, reason, notes } = await req.json();
    if (!newScheduledAt || !reason) {
      return NextResponse.json({ error: 'newScheduledAt and reason are required' }, { status: 400 });
    }

    // Fetch existing session with joins
    const { data: session, error: fetchErr } = await supabase
      .from('sessions')
      .select('*, tutor:tutors(name, email), student:students(name, parent_email)')
      .eq('id', params.id)
      .single();

    if (fetchErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const oldScheduledAt: string = session.scheduled_at;
    const tutor  = session.tutor  as { name: string; email: string } | null;
    const student = session.student as { name: string; parent_email: string | null } | null;

    // Update session
    const { error: updateErr } = await supabase
      .from('sessions')
      .update({
        scheduled_at:      newScheduledAt,
        rescheduled_from:  oldScheduledAt,
        reschedule_reason: reason,
        reschedule_count:  (session.reschedule_count ?? 0) + 1,
        reminder_24h_sent: false,
        reminder_1h_sent:  false,
      })
      .eq('id', params.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Update Zoom meeting time (non-blocking, best-effort)
    if (session.zoom_meeting_id) {
      updateZoomMeeting(session.zoom_meeting_id, {
        startTime:       newScheduledAt,
        durationMinutes: session.duration_minutes,
      }).catch(err => console.error('updateZoomMeeting failed:', err));
    }

    // Update Google Calendar event (non-blocking, best-effort)
    updateGoogleCalendarEvent(params.id).catch(err =>
      console.error('updateGoogleCalendarEvent failed:', err)
    );

    // Send reschedule notification emails (non-blocking)
    if (tutor && student) {
      sendRescheduleNotification({
        tutorEmail:   tutor.email,
        tutorName:    tutor.name,
        studentName:  student.name,
        parentEmail:  student.parent_email,
        originalTime: oldScheduledAt,
        newTime:      newScheduledAt,
        reason,
        notes: notes || null,
      }).catch(err => console.error('sendRescheduleNotification failed:', err));
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('reschedule error:', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
