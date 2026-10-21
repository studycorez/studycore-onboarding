import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getCurrentSopVersion } from '@/lib/sop-quiz';

export const dynamic = 'force-dynamic';

function makeServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeServiceSupabase();

  const version = await getCurrentSopVersion(supabase);
  if (!version) {
    return NextResponse.json({ error: 'No SOP version configured', tutors: [] }, { status: 200 });
  }

  // Get all active tutors
  const { data: tutors, error: tutorErr } = await supabase
    .from('tutors')
    .select('id, name, email')
    .is('archived_at', null)
    .order('name');

  if (tutorErr) {
    return NextResponse.json({ error: tutorErr.message }, { status: 500 });
  }

  // Get all acks for current version
  const { data: acks, error: ackErr } = await supabase
    .from('tutor_sop_acknowledgments')
    .select('tutor_id, attempts_used, last_attempt_at, last_attempt_score, passed_at, locked_until')
    .eq('version_id', version.id);

  if (ackErr) {
    return NextResponse.json({ error: ackErr.message }, { status: 500 });
  }

  const ackMap = new Map((acks ?? []).map(a => [a.tutor_id, a]));
  const now = new Date();

  const result = (tutors ?? []).map(t => {
    const ack = ackMap.get(t.id);
    const attemptsUsed = ack?.attempts_used ?? 0;
    const passedAt = ack?.passed_at ?? null;
    const lockedUntil = ack?.locked_until ?? null;
    const isLocked = lockedUntil != null && new Date(lockedUntil) > now;

    let status: 'not_started' | 'in_progress' | 'passed' | 'locked';
    if (passedAt != null) {
      status = 'passed';
    } else if (isLocked) {
      status = 'locked';
    } else if (attemptsUsed > 0) {
      status = 'in_progress';
    } else {
      status = 'not_started';
    }

    return {
      tutor_id: t.id,
      tutor_name: t.name,
      tutor_email: t.email,
      status,
      attempts_used: attemptsUsed,
      attempts_remaining: Math.max(0, 3 - attemptsUsed),
      passed_at: passedAt,
      last_attempt_at: ack?.last_attempt_at ?? null,
      last_attempt_score: ack?.last_attempt_score ?? null,
      is_locked: isLocked,
      locked_until: lockedUntil,
    };
  });

  return NextResponse.json({
    version: {
      id: version.id,
      version_number: version.version_number,
    },
    tutors: result,
  });
}
