import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';
import { requireSopPassed } from '@/lib/sop-quiz';
import { applySessionHoursForStudent } from '@/lib/apply-session-hours';
import { computeTutorLoggedHours } from '@/lib/hours-policy';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

const AMENDABLE_STATES = ['attended', 'student_no_show', 'tutor_no_show', 'cancelled'];
const VALID_ACTIONS = ['attended', 'student_no_show', 'tutor_no_show', 'cancelled'];

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

  // Fetch session (NOT using validateSessionForAttestation — amend works on already-attested)
  const { data: session, error: fetchErr } = await supabase
    .from('sessions')
    .select('id, tutor_id, student_id, attestation_state, scheduled_at, duration_minutes, attestation_lock_at')
    .eq('id', sessionId)
    .single();

  if (fetchErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.tutor_id !== payload.tutorId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (session.attestation_state === 'pending') {
    return NextResponse.json({ error: 'Session has not been attested yet' }, { status: 409 });
  }
  if (session.attestation_state === 'expired') {
    return NextResponse.json({ error: 'Session is expired' }, { status: 409 });
  }
  if (!AMENDABLE_STATES.includes(session.attestation_state)) {
    return NextResponse.json({ error: `Cannot amend session in state '${session.attestation_state}'` }, { status: 409 });
  }

  // Lock check
  if (!session.attestation_lock_at || new Date(session.attestation_lock_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Amendment window expired - request admin edit' }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Invalid action. Must be: attended, student_no_show, tutor_no_show, or cancelled' }, { status: 400 });
  }

  const scheduled = session.duration_minutes ?? 60;

  // Action-specific validation
  if (action === 'attended' && typeof body.minutes === 'number') {
    if (body.minutes < 15 || body.minutes > scheduled * 2) {
      return NextResponse.json({ error: `Invalid minutes: must be between 15 and ${scheduled * 2}` }, { status: 400 });
    }
  }

  if (action === 'tutor_no_show') {
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3) {
      return NextResponse.json({ error: 'Reason required (min 3 characters)' }, { status: 400 });
    }
  }

  // Compute new values
  let newState: string;
  let newMinutes: number;
  let newHours: number;
  let tutorNoShowReason: string | null = null;

  switch (action) {
    case 'attended':
      newState = 'attended';
      newMinutes = typeof body.minutes === 'number' ? body.minutes : scheduled;
      newHours = computeTutorLoggedHours(newMinutes);
      break;
    case 'student_no_show':
      newState = 'student_no_show';
      newMinutes = 0;
      newHours = 0;
      break;
    case 'tutor_no_show':
      newState = 'tutor_no_show';
      newMinutes = 0;
      newHours = 0;
      tutorNoShowReason = (body.reason as string).trim();
      break;
    case 'cancelled':
      newState = 'cancelled';
      newMinutes = 0;
      newHours = 0;
      break;
    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  // Update session — do NOT update attestation_lock_at (keep original window)
  const { error: updateErr } = await supabase
    .from('sessions')
    .update({
      attestation_state: newState,
      attested_minutes: newMinutes,
      attested_at: new Date().toISOString(),
      tutor_no_show_reason: tutorNoShowReason,
    })
    .eq('id', sessionId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const hoursResult = await applySessionHoursForStudent(supabase, {
    sessionId,
    studentId: session.student_id,
    newHoursAttributed: newHours,
    newHoursSource: 'tutor_attested',
    finalize: true,
    context: {
      source: 'tutor_attested',
      actor: `tutor:${payload.tutorId}`,
      reason: `Amended to ${action}`,
    },
  });

  if (!hoursResult.success) {
    console.error(`[attestation/amend] Hours apply failed for session ${sessionId}: ${hoursResult.error}`);
  }

  return NextResponse.json({
    ok: true,
    session_id: sessionId,
    attestation_state: newState,
    attested_minutes: newMinutes,
  });
}
