import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';
import { formatDt } from '@/lib/email';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: self } = await supabase.from('tutors').select('archived_at').eq('id', payload.tutorId).single();
  if (self?.archived_at !== null) {
    return NextResponse.json({ error: 'Account inactive. Contact your administrator.' }, { status: 403 });
  }

  const { student_id, scheduled_at, duration_minutes, notes } = await req.json();
  if (!student_id || !scheduled_at || !duration_minutes) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const [{ data: tutor }, { data: student }] = await Promise.all([
    supabase.from('tutors').select('id, name, email, hourly_rate, timezone').eq('id', payload.tutorId).single(),
    supabase.from('students').select('id, name').eq('id', student_id).single(),
  ]);

  if (!tutor || !student) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Insert session as pending_approval
  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      tutor_id: payload.tutorId,
      student_id,
      scheduled_at,
      duration_minutes,
      payment_amount: tutor.hourly_rate ? (tutor.hourly_rate * duration_minutes) / 60 : null,
      status: 'pending_approval',
      payment_status: 'pending',
      session_notes: notes || null,
    })
    .select('id')
    .single();

  if (error || !session) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create session' }, { status: 500 });
  }

  // Post Slack Block Kit message
  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  if (slackUrl) {
    const tz = tutor.timezone ?? 'America/New_York';
    const timeDisplay = formatDt(scheduled_at, tz);
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `🗓️ *Session Proposal — Needs Approval*`,
            `*Tutor:* ${tutor.name}`,
            `*Student:* ${student.name}`,
            `*Time:* ${timeDisplay}`,
            `*Duration:* ${duration_minutes} min`,
            notes ? `*Notes:* ${notes}` : null,
          ].filter(Boolean).join('\n'),
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Approve' },
            style: 'primary',
            action_id: 'approve_session',
            value: session.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '❌ Deny' },
            style: 'danger',
            action_id: 'deny_session',
            value: session.id,
          },
        ],
      },
    ];

    await fetch(slackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, session_id: session.id });
}
