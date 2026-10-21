import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyParentJWT, PARENT_COOKIE_NAME } from '@/lib/parent-auth';
import { postToSlack } from '@/lib/slack';
import { sendRescheduleRequestToAdmin, sendRescheduleRequestConfirmation } from '@/lib/email';
import { getAvailableSlots } from '@/lib/reschedule-slots';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

// GET /api/parent-portal/reschedule-request?session_id=X
// Returns available tutor slots for the next 14 days
export async function GET(req: NextRequest) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) return NextResponse.json({ error: 'session_id required' }, { status: 400 });

  const supabase = makeSupabase();

  // Verify session belongs to this parent's students
  const { data: session } = await supabase
    .from('sessions')
    .select('id, tutor_id, scheduled_at, duration_minutes, student:students(id, parent_email)')
    .eq('id', sessionId)
    .eq('status', 'scheduled')
    .single();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  const student = session.student as any;
  if (!student || student.parent_email?.toLowerCase() !== payload.parentEmail.toLowerCase()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  return NextResponse.json({ slots: await getAvailableSlots(supabase, session) });
}

// POST /api/parent-portal/reschedule-request
export async function POST(req: NextRequest) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { session_id, requested_time, note } = await req.json();
  if (!session_id || !requested_time) {
    return NextResponse.json({ error: 'session_id and requested_time required' }, { status: 400 });
  }

  const supabase = makeSupabase();

  const { data: session } = await supabase
    .from('sessions')
    .select('id, tutor_id, student_id, scheduled_at, duration_minutes, zoom_join_url, student:students(id, name, email, parent_email, timezone), tutor:tutors(id, name, email)')
    .eq('id', session_id)
    .eq('status', 'scheduled')
    .single();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  const student = session.student as any;
  if (!student || student.parent_email?.toLowerCase() !== payload.parentEmail.toLowerCase()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Check session is >24h away
  if (new Date(session.scheduled_at).getTime() - Date.now() < 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: 'Session is within 24 hours and cannot be rescheduled' }, { status: 400 });
  }

  const tutor = session.tutor as any;

  const { data: request, error } = await supabase
    .from('reschedule_requests')
    .insert({
      session_id,
      student_id: session.student_id,
      tutor_id: session.tutor_id,
      requested_by: 'parent',
      original_time: session.scheduled_at,
      requested_time,
      note: note || null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.studycore.net';

  // Notify admin via Slack + email (non-blocking)
  Promise.allSettled([
    postToSlack(
      `📅 *Reschedule Request* from parent\n• Student: ${student.name}\n• Tutor: ${tutor.name}\n• Original: ${new Date(session.scheduled_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}\n• Requested: ${new Date(requested_time).toLocaleString('en-US', { timeZone: 'America/New_York' })}\n${note ? `• Note: ${note}\n` : ''}• Review: ${appUrl}/admin/reschedule-requests`
    ),
    sendRescheduleRequestToAdmin({
      studentName: student.name,
      tutorName: tutor.name,
      requestedBy: 'parent',
      originalTime: session.scheduled_at,
      requestedTime: requested_time,
      note,
      requestId: request!.id,
      appUrl,
    }),
    sendRescheduleRequestConfirmation({
      toEmails: Array.from(new Set([student.email, student.parent_email].filter(Boolean))),
      studentName: student.name,
      tutorName: tutor.name,
      originalTime: session.scheduled_at,
      requestedTime: requested_time,
      timezone: student.timezone ?? undefined,
    }),
  ]).catch(() => {});

  return NextResponse.json({ ok: true });
}
