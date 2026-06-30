import type { SupabaseClient } from '@supabase/supabase-js';

export interface SideEffectsResult {
  cancelled_future_count: number;
  locked_past_count: number;
  zoom_queue_count: number;
  cancelled_session_ids: string[];
  warnings: string[];
}

/**
 * Apply side effects when a student's status changes.
 *
 * - completed/refunded: cancel future sessions, lock past completed, enqueue zoom cleanup
 * - paused: cancel future sessions only (past stays editable for resume)
 * - active: no-op
 *
 * Writes side_effects_json back to the audit row.
 */
export async function applyStatusSideEffects(
  studentId: string,
  fromStatus: string,
  toStatus: string,
  supabase: SupabaseClient,
  auditId: string,
): Promise<SideEffectsResult> {
  const result: SideEffectsResult = {
    cancelled_future_count: 0,
    locked_past_count: 0,
    zoom_queue_count: 0,
    cancelled_session_ids: [],
    warnings: [],
  };

  // to=active: no automated side effects
  if (toStatus === 'active') {
    await writeSideEffects(supabase, auditId, result);
    return result;
  }

  const isTerminal = toStatus === 'completed' || toStatus === 'refunded';
  const isPaused = toStatus === 'paused';

  if (!isTerminal && !isPaused) {
    await writeSideEffects(supabase, auditId, result);
    return result;
  }

  const nowIso = new Date().toISOString();
  const cancelReason = isPaused ? 'paused' : 'student_lifecycle_status_change';

  // ── Step 1: Cancel future scheduled sessions ───────────────────────────
  // Filter: student_id match, status=scheduled, scheduled_at >= now
  // This never touches past sessions or non-scheduled sessions.

  const { data: cancelledSessions, error: cancelErr } = await supabase
    .from('sessions')
    .update({
      status: 'cancelled',
      payroll_review_required: true,
      cancellation_reason: cancelReason,
    })
    .eq('student_id', studentId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', nowIso)
    .select('id, zoom_meeting_id');

  if (cancelErr) {
    result.warnings.push(`Cancel future sessions failed: ${cancelErr.message}`);
  } else {
    const cancelled = cancelledSessions ?? [];
    result.cancelled_future_count = cancelled.length;
    result.cancelled_session_ids = cancelled.map((s: any) => s.id);

    // ── Step 3: Enqueue zoom cleanup for cancelled sessions with meetings ──
    const zoomSessions = cancelled.filter((s: any) => s.zoom_meeting_id);
    if (zoomSessions.length > 0) {
      const { error: zoomErr } = await supabase
        .from('zoom_cleanup_queue')
        .insert(
          zoomSessions.map((s: any) => ({
            session_id: s.id,
            zoom_meeting_id: s.zoom_meeting_id,
            action: 'delete',
          }))
        );

      if (zoomErr) {
        result.warnings.push(`Zoom cleanup enqueue failed: ${zoomErr.message}`);
      } else {
        result.zoom_queue_count = zoomSessions.length;
      }
    }
  }

  // ── Step 2: Lock past completed sessions (terminal states only) ────────
  // Filter: student_id match, status=completed, scheduled_at < now, not already finalized.
  // Only for completed/refunded. Paused students keep past hours editable.

  if (isTerminal) {
    const { data: locked, error: lockErr } = await supabase
      .from('sessions')
      .update({ hours_finalized: true })
      .eq('student_id', studentId)
      .eq('status', 'completed')
      .lt('scheduled_at', nowIso)
      .eq('hours_finalized', false)
      .select('id');

    if (lockErr) {
      result.warnings.push(`Lock past sessions failed: ${lockErr.message}`);
    } else {
      result.locked_past_count = locked?.length ?? 0;
    }
  }

  // ── Write side effects to audit row ────────────────────────────────────
  await writeSideEffects(supabase, auditId, result);

  return result;
}

async function writeSideEffects(
  supabase: SupabaseClient,
  auditId: string,
  result: SideEffectsResult,
) {
  const { error } = await supabase
    .from('student_status_changes')
    .update({
      side_effects_json: {
        cancelled_future_count: result.cancelled_future_count,
        locked_past_count: result.locked_past_count,
        zoom_queue_count: result.zoom_queue_count,
        cancelled_session_ids: result.cancelled_session_ids,
        warnings: result.warnings,
      },
    })
    .eq('id', auditId);

  if (error) {
    result.warnings.push(`Audit side_effects_json write failed: ${error.message}`);
  }
}
