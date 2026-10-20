import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function auth(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return token ? verifyTutorJWT(token) : null;
}

export async function GET(req: NextRequest) {
  const payload = await auth(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('reschedule_requests')
    .select('*, student:students(id, name)')
    .eq('tutor_id', payload.tutorId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const payload = await auth(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { session_id, reason, proposed_at } = body;

  if (!session_id || !proposed_at) {
    return NextResponse.json({ error: 'session_id and proposed_at are required' }, { status: 400 });
  }

  if (new Date(proposed_at) <= new Date()) {
    return NextResponse.json({ error: 'Proposed time must be in the future' }, { status: 400 });
  }

  // Verify session ownership and status
  const { data: session } = await supabase
    .from('sessions')
    .select('id, tutor_id, student_id, scheduled_at, status')
    .eq('id', session_id)
    .single();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.tutor_id !== payload.tutorId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  if (session.status !== 'scheduled') {
    return NextResponse.json({ error: 'Only scheduled sessions can be rescheduled' }, { status: 400 });
  }

  // Check no pending request already exists
  const { data: existing } = await supabase
    .from('reschedule_requests')
    .select('id')
    .eq('session_id', session_id)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'A pending reschedule request already exists for this session' },
      { status: 409 },
    );
  }

  const { error: insertErr } = await getDb().from('reschedule_requests').insert({
    session_id,
    tutor_id: payload.tutorId,
    student_id: session.student_id,
    original_time: session.scheduled_at,
    requested_time: proposed_at,
    note: reason || null,
    status: 'pending',
    requested_by: 'tutor',
  });

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
