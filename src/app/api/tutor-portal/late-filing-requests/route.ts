import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';
import { postToSlack } from '@/lib/slack';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { session_id, reason } = body;
  if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  if (!reason?.trim()) return NextResponse.json({ error: 'reason required' }, { status: 400 });

  const supabase = makeSupabase();

  // Ownership + status check
  const { data: session } = await supabase
    .from('sessions')
    .select('id, tutor_id, status, scheduled_at, student:students(name)')
    .eq('id', session_id)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.tutor_id !== payload.tutorId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (session.status !== 'completed') return NextResponse.json({ error: 'Session is not completed' }, { status: 422 });

  const requestedAt = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from('sessions')
    .update({
      late_filing_requested_at: requestedAt,
      late_filing_reason:       reason.trim(),
    })
    .eq('id', session_id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Slack notification (best-effort)
  const studentName = (Array.isArray(session.student) ? session.student[0]?.name : (session.student as any)?.name) ?? 'Unknown student';
  const sessionDate = format(new Date(session.scheduled_at), 'MMM d, yyyy');
  await postToSlack(
    `🕒 Late filing request from *${payload.tutorName}*: Session on ${sessionDate} with ${studentName}. Reason: "${reason.trim()}"`
  ).catch(() => {});

  return NextResponse.json({ ok: true, requested_at: requestedAt });
}
