import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateZoomMeeting } from '@/lib/zoom';
import { sendRescheduleApproved, sendRescheduleDenied } from '@/lib/email';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

// POST /api/admin/reschedule-requests/[id]
// body: { action: 'approve' | 'deny' }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { action } = await req.json();
  if (action !== 'approve' && action !== 'deny') {
    return NextResponse.json({ error: 'action must be approve or deny' }, { status: 400 });
  }

  const supabase = makeSupabase();

  const { data: rr } = await supabase
    .from('reschedule_requests')
    .select('*, student:students(id, name, email, parent_email, timezone), tutor:tutors(id, name, email)')
    .eq('id', params.id)
    .eq('status', 'pending')
    .single();

  if (!rr) return NextResponse.json({ error: 'Request not found or already resolved' }, { status: 404 });

  const student = rr.student as any;
  const tutor   = rr.tutor   as any;
  const tz      = student?.timezone ?? 'America/New_York';
  const toEmails = Array.from(new Set([student?.email, student?.parent_email].filter(Boolean))) as string[];

  if (action === 'approve') {
    // Fetch the session for zoom_meeting_id and zoom_join_url
    const { data: session } = await supabase
      .from('sessions')
      .select('id, zoom_meeting_id, zoom_join_url, duration_minutes')
      .eq('id', rr.session_id)
      .single();

    // Update the session time
    const isTutorRequest = rr.requested_by === 'tutor';

    const { error: sessErr } = await supabase
      .from('sessions')
      .update({
        scheduled_at:      rr.requested_time,
        rescheduled_from:  rr.original_time,
        reschedule_reason: isTutorRequest ? 'Tutor reschedule request' : 'Parent/student portal request',
        reschedule_count:  1,
        reminder_24h_sent: false,
        reminder_1h_sent:  false,
      })
      .eq('id', rr.session_id);

    if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 });

    // Mark request approved
    await supabase
      .from('reschedule_requests')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', params.id);

    // Best-effort Zoom update
    if (session?.zoom_meeting_id) {
      updateZoomMeeting(session.zoom_meeting_id, {
        startTime: rr.requested_time,
        durationMinutes: session.duration_minutes,
      }).catch(err => console.error('zoom update failed:', err));
    }

    // Send approval emails — always notify parent/student; skip tutor if they initiated the request
    const emailPromises: Promise<unknown>[] = [
      sendRescheduleApproved({
        toEmails,
        studentName: student.name,
        tutorName: tutor.name,
        originalTime: rr.original_time,
        newTime: rr.requested_time,
        zoomJoinUrl: session?.zoom_join_url,
        timezone: tz,
      }),
    ];
    if (!isTutorRequest) {
      emailPromises.push(
        sendRescheduleApproved({
          toEmails: [tutor.email],
          studentName: student.name,
          tutorName: tutor.name,
          originalTime: rr.original_time,
          newTime: rr.requested_time,
          zoomJoinUrl: session?.zoom_join_url,
          timezone: tz,
        }),
      );
    }
    Promise.allSettled(emailPromises).catch(() => {});

    return NextResponse.json({ ok: true, action: 'approved' });
  }

  // deny
  await supabase.from('reschedule_requests').update({ status: 'denied' }).eq('id', params.id);

  sendRescheduleDenied({
    toEmails,
    studentName: student.name,
    tutorName: tutor.name,
    originalTime: rr.original_time,
    requestedTime: rr.requested_time,
    timezone: tz,
  }).catch(() => {});

  return NextResponse.json({ ok: true, action: 'denied' });
}
