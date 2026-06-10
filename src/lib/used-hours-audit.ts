/**
 * Used Hours Audit — Single mutation point for students.used_hours.
 *
 * Every write site (zoom-sync, session-log, fathom backfill, admin manual,
 * cron fallback) calls applyUsedHoursMutation() instead of writing to
 * students.used_hours directly. This guarantees an audit log entry for
 * every mutation.
 *
 * Known limitation: Supabase JS client has no cross-table transaction
 * primitive. The used_hours update and audit log insert happen sequentially.
 * If the audit insert fails after used_hours was already updated, we log
 * the error and return success with a warning — the audit gap is surfaced
 * but we don't roll back the hours update.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface UsedHoursMutation {
  student_id: string;
  session_id: string | null;
  delta: number;
  source: 'session_completion' | 'zoom_sync_overwrite' | 'tutor_log' | 'admin_manual' | 'cron_fallback' | 'tutor_attested';
  reason?: string;
  actor?: string;
}

export interface MutationResult {
  success: boolean;
  before: number;
  after: number;
  auditLogId: string | null;
  warning?: string;
  error?: string;
}

// ── Core mutation ────────────────────────────────────────────────────────────

export async function applyUsedHoursMutation(
  supabase: SupabaseClient,
  mutation: UsedHoursMutation,
): Promise<MutationResult> {
  const { student_id, session_id, delta, source, reason, actor } = mutation;

  // (a) Fetch current used_hours
  const { data: student, error: fetchErr } = await supabase
    .from('students')
    .select('used_hours')
    .eq('id', student_id)
    .single();

  if (fetchErr || !student) {
    return {
      success: false,
      before: 0,
      after: 0,
      auditLogId: null,
      error: `student_fetch_failed: ${fetchErr?.message ?? 'not found'}`,
    };
  }

  const before = student.used_hours ?? 0;

  // (c) Skip no-op mutations
  if (Math.abs(delta) < 0.01) {
    console.warn(`[used-hours-audit] skipping no-op mutation for student=${student_id} delta=${delta}`);
    return {
      success: true,
      before,
      after: before,
      auditLogId: null,
      warning: 'skipped_noop',
    };
  }

  // (b) Compute new value
  const after = parseFloat((before + delta).toFixed(2));

  // (d) Refuse negative result
  if (after < 0) {
    return {
      success: false,
      before,
      after: before,
      auditLogId: null,
      error: `would_go_negative: before=${before} delta=${delta} would_be=${after}`,
    };
  }

  // (e) Update students.used_hours
  const { error: updateErr } = await supabase
    .from('students')
    .update({ used_hours: after })
    .eq('id', student_id);

  if (updateErr) {
    return {
      success: false,
      before,
      after: before,
      auditLogId: null,
      error: `update_failed: ${updateErr.message}`,
    };
  }

  // (f) Insert audit log entry
  const { data: auditRow, error: auditErr } = await supabase
    .from('used_hours_audit_log')
    .insert({
      session_id,
      student_id,
      delta,
      before_value: before,
      after_value: after,
      source,
      reason: reason ?? null,
      actor: actor ?? 'system',
    })
    .select('id')
    .single();

  if (auditErr) {
    // Hours were updated but audit insert failed — surface the gap
    console.error(
      `[used-hours-audit] AUDIT INSERT FAILED after successful update. ` +
      `student=${student_id} delta=${delta} before=${before} after=${after} ` +
      `error=${auditErr.message}`,
    );
    return {
      success: true,
      before,
      after,
      auditLogId: null,
      warning: `audit_insert_failed: ${auditErr.message}`,
    };
  }

  // (g) Success
  return {
    success: true,
    before,
    after,
    auditLogId: auditRow?.id ?? null,
  };
}

// ── History query ────────────────────────────────────────────────────────────

export async function getUsedHoursHistory(
  supabase: SupabaseClient,
  studentId: string,
  limit: number = 50,
): Promise<Array<{
  id: string;
  session_id: string | null;
  delta: number;
  before_value: number;
  after_value: number;
  source: string;
  reason: string | null;
  actor: string | null;
  created_at: string;
}>> {
  const { data, error } = await supabase
    .from('used_hours_audit_log')
    .select('id, session_id, delta, before_value, after_value, source, reason, actor, created_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[used-hours-audit] history fetch failed for student=${studentId}: ${error.message}`);
    return [];
  }

  return data ?? [];
}
