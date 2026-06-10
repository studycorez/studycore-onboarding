/**
 * Apply Session Hours — Per-session delta-based hours attribution.
 *
 * Instead of recomputing a student's total used_hours from scratch,
 * this module computes the delta between a session's old and new
 * hours_attributed value and applies that delta to the student's
 * used_hours via the audit-logged mutation helper.
 *
 * Design guarantees:
 *   - Historical sessions are never touched (only sessions passed in)
 *   - Finalized sessions are protected from automated overwrites
 *   - Idempotent: same value twice → delta=0 → no-op
 *   - Every mutation is audit-logged
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { applyUsedHoursMutation, type UsedHoursMutation, type MutationResult } from './used-hours-audit';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SessionHoursWrite {
  sessionId: string;
  studentId: string;
  newHoursAttributed: number;
  newHoursSource: 'scheduled' | 'actual' | 'tutor_logged';
  finalize: boolean;
  context: {
    source: UsedHoursMutation['source'];
    reason?: string;
    actor?: string;
  };
}

// ── Core function ────────────────────────────────────────────────────────────

export async function applySessionHoursForStudent(
  supabase: SupabaseClient,
  params: SessionHoursWrite,
): Promise<MutationResult> {
  const { sessionId, studentId, newHoursAttributed, newHoursSource, finalize, context } = params;

  // (a) Fetch session's current hours_attributed and finalized state
  const { data: session, error: fetchErr } = await supabase
    .from('sessions')
    .select('hours_attributed, hours_finalized')
    .eq('id', sessionId)
    .single();

  if (fetchErr || !session) {
    return {
      success: false,
      before: 0,
      after: 0,
      auditLogId: null,
      error: `session_fetch_failed: ${fetchErr?.message ?? 'not found'}`,
    };
  }

  // (b) Guard: finalized sessions cannot be changed by automated paths
  if (session.hours_finalized === true && !finalize) {
    return {
      success: false,
      before: 0,
      after: 0,
      auditLogId: null,
      error: 'session_already_finalized',
    };
  }

  // (c) Compute delta between old and new attribution
  const currentAttributed = session.hours_attributed ?? 0;
  const delta = parseFloat((newHoursAttributed - currentAttributed).toFixed(2));

  // (d) Update the session row (never un-finalize)
  const { error: updateErr } = await supabase
    .from('sessions')
    .update({
      hours_attributed: newHoursAttributed,
      hours_source: newHoursSource,
      hours_finalized: finalize || session.hours_finalized,
    })
    .eq('id', sessionId);

  if (updateErr) {
    return {
      success: false,
      before: 0,
      after: 0,
      auditLogId: null,
      error: `session_update_failed: ${updateErr.message}`,
    };
  }

  // (e) No meaningful delta — session updated but student total unchanged
  if (Math.abs(delta) < 0.01) {
    return {
      success: true,
      before: 0,
      after: 0,
      auditLogId: null,
      warning: 'no_change',
    };
  }

  // (f) Apply delta to student's used_hours via audit-logged mutation
  return applyUsedHoursMutation(supabase, {
    student_id: studentId,
    session_id: sessionId,
    delta,
    source: context.source,
    reason: context.reason,
    actor: context.actor,
  });
}
