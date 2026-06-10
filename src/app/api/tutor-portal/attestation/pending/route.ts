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
    .select('id, scheduled_at, duration_minutes, attestation_state, student:students(id, name)')
    .eq('tutor_id', payload.tutorId)
    .eq('attestation_state', 'pending')
    .order('scheduled_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sessions = (data ?? []).map((s: any) => {
    const endMs = new Date(s.scheduled_at).getTime() + ((s.duration_minutes ?? 60) * 60 * 1000);
    const ageHours = Math.max(0, Math.round((now - endMs) / (60 * 60 * 1000)));
    return {
      id: s.id,
      scheduled_at: s.scheduled_at,
      duration_minutes: s.duration_minutes,
      student: s.student,
      attestation_state: s.attestation_state,
      age_hours: ageHours,
    };
  });

  return NextResponse.json({ sessions });
}
