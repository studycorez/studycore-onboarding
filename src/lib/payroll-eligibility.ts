import { SupabaseClient } from '@supabase/supabase-js';

// ─── Payroll constants ─────────────────────────────────────────────────────────

/**
 * Hard cutoff: sessions scheduled before this date are "legacy" and payable
 * without a session_report (they predate the report requirement).
 * Sessions on or after this date require a filed session_report to be payable.
 */
export const PAYROLL_CUTOFF = '2026-05-15T00:00:00Z';
const PAYROLL_CUTOFF_MS = new Date(PAYROLL_CUTOFF).getTime();

/**
 * Backlog window end: tutors may file reports for May 15+ sessions without
 * per-session admin approval until this date. Hardcoded so it auto-expires.
 * After this date the normal 72hr rule + late_filing_approved_at applies.
 */
export const BACKLOG_WINDOW_END = '2026-06-01T00:00:00Z';

// ─── Eligibility ───────────────────────────────────────────────────────────────

export interface SessionForEligibility {
  id: string;
  status: string;
  paid_in_run_id: string | null;
  scheduled_at: string;
}

/**
 * Returns true if a session should be included in a payroll run.
 *
 * Rules:
 *   - status = 'completed'
 *   - a session_report exists (post-cutoff) and is not no_show
 *   - paid_in_run_id IS NULL (not already paid)
 *   - Pre-cutoff (scheduled_at < PAYROLL_CUTOFF): payable without report
 *   - Post-cutoff: a session_report must exist (caller must supply filedReports)
 *
 * Note: after settle-pre-cutoff-sessions.ts runs, pre-cutoff sessions will
 * already have paid_in_run_id set, so the pre-cutoff branch is a safety net.
 */
export function isSessionPayable(
  session: SessionForEligibility,
  filedReports: Map<string, { duration_minutes: number; tutor_attended: string | null }>,
): boolean {
  if (session.status !== 'completed') return false;
  if (session.paid_in_run_id !== null) return false;

  const scheduledMs = new Date(session.scheduled_at).getTime();
  if (scheduledMs < PAYROLL_CUTOFF_MS) {
    // Pre-cutoff: safety net for any unstamped stragglers (historical settle
    // should have stamped all of these already via paid_in_run_id)
    return true;
  }

  // Post-cutoff: report required AND tutor must not be no_show
  const report = filedReports.get(session.id);
  if (!report) return false;
  if (report.tutor_attended === 'no_show') return false;
  return true;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fetches filed session_reports as a Map<session_id, { duration_minutes, tutor_attended }>.
 * Requires a service-role client (session_reports is RLS-protected).
 * Batches in groups of 200 to stay within URL length limits.
 *
 * Use .has(id) to check report existence.
 * Use .get(id)?.duration_minutes for pay calculation (report-reported duration).
 * Use .get(id)?.tutor_attended to check no_show exclusion ('yes'|'partial'|'no_show'|null).
 */
export async function fetchFiledSessionIds(
  supabase: SupabaseClient,
  sessionIds: string[],
): Promise<Map<string, { duration_minutes: number; tutor_attended: string | null }>> {
  const filed = new Map<string, { duration_minutes: number; tutor_attended: string | null }>();
  if (sessionIds.length === 0) return filed;

  const BATCH_SIZE = 200;
  for (let i = 0; i < sessionIds.length; i += BATCH_SIZE) {
    const chunk = sessionIds.slice(i, i + BATCH_SIZE);
    const { data } = await supabase
      .from('session_reports')
      .select('session_id, duration_minutes, tutor_attended')
      .in('session_id', chunk);
    for (const r of data ?? []) {
      filed.set((r as any).session_id as string, {
        duration_minutes: (r as any).duration_minutes as number,
        tutor_attended:   (r as any).tutor_attended as string | null,
      });
    }
  }
  return filed;
}
