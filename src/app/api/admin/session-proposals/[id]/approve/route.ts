import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { applySessionHoursForStudent } from '@/lib/apply-session-hours';
import { computeTutorLoggedHours } from '@/lib/hours-policy';

export const dynamic = 'force-dynamic';

function makeServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeServiceSupabase();
  const proposalId = params.id;

  // 1. Fetch proposal
  const { data: proposal, error: fetchErr } = await supabase
    .from('session_proposals')
    .select('id, tutor_id, student_id, scheduled_at, duration_minutes, what_covered, tutor_notes, status')
    .eq('id', proposalId)
    .single();

  if (fetchErr || !proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  if (proposal.status !== 'pending') {
    return NextResponse.json({ error: `Proposal is already ${proposal.status}` }, { status: 409 });
  }

  // 2. Parse body
  const body = await req.json().catch(() => ({}));
  const adminNotes = typeof body.admin_notes === 'string' ? body.admin_notes.trim() : null;

  // 3. Update proposal FIRST with race guard (claim it before creating session)
  const { data: claimed, error: claimErr } = await supabase
    .from('session_proposals')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      admin_notes: adminNotes,
    })
    .eq('id', proposalId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (claimErr) {
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }

  if (!claimed) {
    return NextResponse.json({ error: 'Proposal was already processed by another admin' }, { status: 409 });
  }

  // 4. Create real sessions row
  const sessionNotes = [
    proposal.what_covered ? `Covered: ${proposal.what_covered}` : null,
    proposal.tutor_notes ? `Tutor notes: ${proposal.tutor_notes}` : null,
  ].filter(Boolean).join('. ') || null;

  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .insert({
      tutor_id: proposal.tutor_id,
      student_id: proposal.student_id,
      scheduled_at: proposal.scheduled_at,
      duration_minutes: proposal.duration_minutes,
      status: 'completed',
      session_notes: sessionNotes,
      payment_status: 'pending',
      zoom_meeting_id: null,
    })
    .select('id')
    .single();

  if (sessionErr || !session) {
    // CRITICAL: proposal is approved but no session. Roll back proposal.
    console.error(`[approve-proposal] Session insert failed for proposal ${proposalId}. Rolling back proposal status.`, sessionErr);
    await supabase
      .from('session_proposals')
      .update({ status: 'pending', reviewed_at: null, reviewed_by: null, admin_notes: null })
      .eq('id', proposalId);
    return NextResponse.json({ error: `Failed to create session: ${sessionErr?.message}. Proposal reverted to pending.` }, { status: 500 });
  }

  // 5. Apply hours
  const hours = computeTutorLoggedHours(proposal.duration_minutes);

  const hoursResult = await applySessionHoursForStudent(supabase, {
    sessionId: session.id,
    studentId: proposal.student_id,
    newHoursAttributed: hours,
    newHoursSource: 'tutor_logged',
    finalize: true,
    context: {
      source: 'admin_manual',
      actor: `admin:${user.email ?? user.id}`,
      reason: 'Approved backlog proposal',
    },
  });

  if (!hoursResult.success) {
    // CRITICAL: proposal approved, session exists, but hours not applied.
    // Do NOT roll back — session is real. Surface the error to admin.
    console.error(
      `[approve-proposal] HOURS APPLY FAILED. proposal=${proposalId} session=${session.id} ` +
      `student=${proposal.student_id} hours=${hours} error=${hoursResult.error}`,
    );
    return NextResponse.json({
      error: `Session created (${session.id}) but hours apply failed: ${hoursResult.error}. Admin must manually verify used_hours for this student.`,
      sessionId: session.id,
    }, { status: 500 });
  }

  // 6. Link session to proposal (best-effort)
  const { error: linkErr } = await supabase
    .from('session_proposals')
    .update({ created_session_id: session.id })
    .eq('id', proposalId);

  if (linkErr) {
    console.error(`[approve-proposal] Failed to link session ${session.id} to proposal ${proposalId}:`, linkErr.message);
  }

  return NextResponse.json({ ok: true, sessionId: session.id });
}
