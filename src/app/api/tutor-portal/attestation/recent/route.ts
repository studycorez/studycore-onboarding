import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();
  const now = Date.now();

  const { data, error } = await supabase
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, attestation_state, attested_minutes, attested_at, attestation_lock_at, tutor_no_show_reason, student:students(id, name)')
    .eq('tutor_id', payload.tutorId)
    .eq('attested_by', payload.tutorId)
    .gt('attestation_lock_at', new Date().toISOString())
    .in('attestation_state', ['attended', 'student_no_show', 'tutor_no_show', 'cancelled'])
    .order('attested_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sessions = (data ?? []).map((s: any) => {
    const lockMs = new Date(s.attestation_lock_at).getTime();
    const minutesUntilLock = Math.max(0, Math.round((lockMs - now) / 60000));
    return {
      id: s.id,
      scheduled_at: s.scheduled_at,
      duration_minutes: s.duration_minutes,
      student: s.student,
      attestation_state: s.attestation_state,
      attested_minutes: s.attested_minutes,
      attested_at: s.attested_at,
      attestation_lock_at: s.attestation_lock_at,
      tutor_no_show_reason: s.tutor_no_show_reason,
      minutes_until_lock: minutesUntilLock,
    };
  });

  return NextResponse.json({ sessions });
}
