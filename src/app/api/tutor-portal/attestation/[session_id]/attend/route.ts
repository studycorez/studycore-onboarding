import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';
import { requireSopPassed } from '@/lib/sop-quiz';
import { validateSessionForAttestation } from '@/lib/attestation-validator';
import { applySessionHoursForStudent } from '@/lib/apply-session-hours';
import { computeTutorLoggedHours } from '@/lib/hours-policy';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { session_id: string } },
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();

  // SOP quiz gate
  const sopGate = await requireSopPassed(payload.tutorId, supabase);
  if (!sopGate.ok) {
    return NextResponse.json(sopGate.response, { status: 403 });
  }
  const sessionId = params.session_id;

  const result = await validateSessionForAttestation(supabase, sessionId, payload.tutorId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { session } = result;

  // Parse optional minutes from body
  const body = await req.json().catch(() => ({}));
  const scheduled = session.duration_minutes ?? 60;
  let attestedMinutes = scheduled;

  if (typeof body.minutes === 'number') {
    if (body.minutes < 15 || body.minutes > scheduled * 2) {
      return NextResponse.json({ error: 'Invalid minutes: must be between 15 and ' + (scheduled * 2) }, { status: 400 });
    }
    attestedMinutes = body.minutes;
  }

  const hours = computeTutorLoggedHours(attestedMinutes);
  const lockAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { error: updateErr } = await supabase
    .from('sessions')
    .update({
      attestation_state: 'attended',
      attested_minutes: attestedMinutes,
      attested_at: new Date().toISOString(),
      attested_by: payload.tutorId,
      attestation_lock_at: lockAt,
    })
    .eq('id', sessionId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const hoursResult = await applySessionHoursForStudent(supabase, {
    sessionId,
    studentId: session.student_id,
    newHoursAttributed: hours,
    newHoursSource: 'tutor_attested',
    finalize: true,
    context: {
      source: 'tutor_attested',
      actor: `tutor:${payload.tutorId}`,
      reason: `Tutor attested ${attestedMinutes}min`,
    },
  });

  if (!hoursResult.success) {
    console.error(`[attestation/attend] Hours apply failed for session ${sessionId}: ${hoursResult.error}`);
  }

  return NextResponse.json({
    ok: true,
    session_id: sessionId,
    attested_minutes: attestedMinutes,
    hours,
    attestation_lock_at: lockAt,
  });
}
