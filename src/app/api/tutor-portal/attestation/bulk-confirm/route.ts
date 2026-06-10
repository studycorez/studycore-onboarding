import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';
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

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sessionIds: unknown = body.session_ids;

  if (!Array.isArray(sessionIds) || sessionIds.length === 0 || sessionIds.length > 50) {
    return NextResponse.json({ error: 'session_ids must be an array of 1-50 IDs' }, { status: 400 });
  }

  const ids = sessionIds.map(String);
  const supabase = makeSupabase();
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  // Fetch all sessions in one query
  const { data: sessions, error: fetchErr } = await supabase
    .from('sessions')
    .select('id, tutor_id, student_id, attestation_state, scheduled_at, duration_minutes')
    .in('id', ids);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const sessionMap = new Map((sessions ?? []).map(s => [s.id, s]));

  // Atomic validation — collect ALL failures before any writes
  const failures: {
    not_found: string[];
    wrong_tutor: string[];
    not_pending: string[];
    too_old: string[];
  } = { not_found: [], wrong_tutor: [], not_pending: [], too_old: [] };

  for (const id of ids) {
    const s = sessionMap.get(id);
    if (!s) {
      failures.not_found.push(id);
      continue;
    }
    if (s.tutor_id !== payload.tutorId) {
      failures.wrong_tutor.push(id);
      continue;
    }
    if (s.attestation_state !== 'pending') {
      failures.not_pending.push(id);
      continue;
    }
    if (new Date(s.scheduled_at).getTime() < sevenDaysAgo) {
      failures.too_old.push(id);
      continue;
    }
  }

  const hasFailures = failures.not_found.length + failures.wrong_tutor.length +
    failures.not_pending.length + failures.too_old.length > 0;

  if (hasFailures) {
    return NextResponse.json({ error: 'Bulk validation failed', failures }, { status: 422 });
  }

  // All valid — write each session
  const results: Array<{ session_id: string; success: boolean; error?: string }> = [];
  const lockAt = new Date(now + 60 * 60 * 1000).toISOString();
  const attestedAt = new Date().toISOString();

  for (const id of ids) {
    const s = sessionMap.get(id)!;
    const attestedMinutes = s.duration_minutes ?? 60;
    const hours = computeTutorLoggedHours(attestedMinutes);

    const { error: updateErr } = await supabase
      .from('sessions')
      .update({
        attestation_state: 'attended',
        attested_minutes: attestedMinutes,
        attested_at: attestedAt,
        attested_by: payload.tutorId,
        attestation_lock_at: lockAt,
      })
      .eq('id', id);

    if (updateErr) {
      results.push({ session_id: id, success: false, error: updateErr.message });
      continue;
    }

    const hoursResult = await applySessionHoursForStudent(supabase, {
      sessionId: id,
      studentId: s.student_id,
      newHoursAttributed: hours,
      newHoursSource: 'tutor_attested',
      finalize: true,
      context: {
        source: 'tutor_attested',
        actor: `tutor:${payload.tutorId}`,
        reason: 'Bulk confirm at scheduled duration',
      },
    });

    if (!hoursResult.success) {
      console.error(`[bulk-confirm] Hours apply failed for session ${id}: ${hoursResult.error}`);
    }

    results.push({ session_id: id, success: true });
  }

  const confirmedCount = results.filter(r => r.success).length;

  return NextResponse.json({
    ok: true,
    confirmed_count: confirmedCount,
    results,
  });
}
