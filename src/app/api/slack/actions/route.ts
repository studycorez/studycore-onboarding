import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';
import { createZoomMeeting } from '@/lib/zoom';
import {
  sendBookingConfirmationToStudent,
  sendBookingConfirmationToTutor,
  sendSessionProposalDenied,
  getStudentEmails,
} from '@/lib/email';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function verifySlackSignature(req: NextRequest, rawBody: string): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return false;

  const timestamp = req.headers.get('x-slack-request-timestamp');
  const slackSig = req.headers.get('x-slack-signature');
  if (!timestamp || !slackSig) return false;

  // Reject requests older than 5 minutes (replay attack prevention)
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false;

  const baseStr = `v0:${timestamp}:${rawBody}`;
  const computed = `v0=${createHmac('sha256', signingSecret).update(baseStr).digest('hex')}`;
  return computed === slackSig;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifySlackSignature(req, rawBody)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get('payload');
  if (!payloadStr) return NextResponse.json({ error: 'No payload' }, { status: 400 });

  let payload: any;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const action = payload.actions?.[0];
  if (!action) return NextResponse.json({ error: 'No action' }, { status: 400 });

  const { action_id, value: sessionId } = action;
  const responseUrl = payload.response_url as string | undefined;
  const userName = payload.user?.name ?? 'admin';

  const { data: session } = await supabase
    .from('sessions')
    .select('*, tutor:tutors(id, name, email, zoom_user_id, hourly_rate, timezone), student:students(id, name, email, parent_email, target_score)')
    .eq('id', sessionId)
    .single();

  if (!session) {
    await updateSlackMessage(responseUrl, '⚠️ Session not found. It may have already been handled.');
    return NextResponse.json({ ok: true });
  }

  if (session.status !== 'pending_approval') {
    await updateSlackMessage(responseUrl, `⚠️ Session already handled (status: ${session.status}).`);
    return NextResponse.json({ ok: true });
  }

  const tutor = Array.isArray(session.tutor) ? session.tutor[0] : session.tutor;
  const student = Array.isArray(session.student) ? session.student[0] : session.student;

  if (action_id === 'approve_session') {
    // Create Zoom meeting
    const meeting = await createZoomMeeting({
      topic: `StudyCore SAT Session — ${student.name} with ${tutor.name}`,
      startTime: session.scheduled_at,
      durationMinutes: session.duration_minutes,
      zoomUserId: tutor.zoom_user_id ?? undefined,
    }).catch(() => null);

    // Update session to scheduled
    await getDb().from('sessions').update({
      status: 'scheduled',
      zoom_meeting_id: meeting?.id?.toString() ?? null,
      zoom_join_url: meeting?.join_url ?? null,
      zoom_host_url: meeting?.start_url ?? null,
    }).eq('id', sessionId);

    // Send confirmation emails
    const studentEmails = await getStudentEmails(student.id, student.email).catch(() => [student.email]);
    const tz = tutor.timezone ?? 'America/New_York';

    await Promise.allSettled([
      sendBookingConfirmationToStudent({
        studentEmail: student.email,
        parentEmail: student.parent_email,
        additionalEmails: studentEmails.slice(1),
        studentName: student.name,
        tutorName: tutor.name,
        scheduledAt: session.scheduled_at,
        durationMinutes: session.duration_minutes,
        zoomJoinUrl: meeting?.join_url ?? null,
        targetScore: student.target_score,
        timezone: tz,
      }),
      sendBookingConfirmationToTutor({
        tutorEmail: tutor.email,
        tutorName: tutor.name,
        studentName: student.name,
        scheduledAt: session.scheduled_at,
        durationMinutes: session.duration_minutes,
        zoomHostUrl: meeting?.start_url ?? null,
        zoomJoinUrl: meeting?.join_url ?? null,
        targetScore: student.target_score,
        timezone: tz,
      }),
    ]);

    await updateSlackMessage(responseUrl, `✅ *Approved by ${userName}.* Session scheduled for ${student.name} with ${tutor.name}.`);
  } else if (action_id === 'deny_session') {
    await getDb().from('sessions').update({ status: 'cancelled' }).eq('id', sessionId);

    await sendSessionProposalDenied({
      tutorEmail: tutor.email,
      tutorName: tutor.name,
      studentName: student.name,
      scheduledAt: session.scheduled_at,
      timezone: tutor.timezone ?? 'America/New_York',
    }).catch(() => {});

    await updateSlackMessage(responseUrl, `❌ *Denied by ${userName}.* Session for ${student.name} with ${tutor.name} was not approved.`);
  }

  return NextResponse.json({ ok: true });
}

async function updateSlackMessage(responseUrl: string | undefined, text: string) {
  if (!responseUrl) return;
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, replace_original: true }),
  }).catch(() => {});
}
