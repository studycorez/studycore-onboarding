import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }

  const supabase = makeSupabase();

  const { data: session, error } = await supabase
    .from('sessions')
    .select('id, tutor_id, student_id, scheduled_at, duration_minutes, status, tutor:tutors(id, name), student:students(id, name)')
    .eq('id', sessionId)
    .maybeSingle();

  if (error || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // Check if report already submitted
  const { data: existing } = await supabase
    .from('session_reports')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();

  const tutor   = (session as any).tutor   as { id: string; name: string } | null;
  const student = (session as any).student as { id: string; name: string } | null;

  // Late filing: more than 48 hours after scheduled_at
  const scheduledMs = new Date(session.scheduled_at).getTime();
  const isLateFiling = Date.now() - scheduledMs > 24 * 60 * 60 * 1000;

  return NextResponse.json({
    session_id:       session.id,
    tutor_id:         session.tutor_id,
    tutor_name:       tutor?.name ?? '—',
    student_id:       student?.id ?? null,
    student_name:     student?.name ?? null,
    scheduled_at:     session.scheduled_at,
    duration_minutes: session.duration_minutes,
    status:           session.status,
    already_submitted: !!existing,
    is_late_filing:   isLateFiling,
  });
}
