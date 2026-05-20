/**
 * Compute payable minutes per StudyCore policy:
 *   Round half-up to nearest 30-min block. No minimum.
 *   Examples: 20→30, 15→30, 14→0, 45→60, 44→30, 75→90, 74→60, 90→90
 *
 * TODO: sessions with fewer than 15 reported minutes pay 0
 *   (14/30 = 0.467 rounds down to 0). Confirm whether this is intended
 *   or whether a minimum (e.g. 30 min) should be enforced.
 *
 * Input is the duration from session_reports.duration_minutes (what the
 * tutor actually reported), not sessions.duration_minutes (scheduled length).
 * Callers must filter status='completed' before calling this.
 */
export function computePayableMinutes(reportedMinutes: number): number {
  if (reportedMinutes <= 0) return 0;
  return Math.round(reportedMinutes / 30) * 30;
}

/**
 * Compute pay for a single tutor's session aggregate.
 * Returns { payableMinutes, payAmount } so callers can display both
 * actual minutes (for transparency) and the rounded result.
 */
export function computeSessionPay(
  actualMinutes: number,
  hourlyRate: number,
): { payableMinutes: number; payAmount: number } {
  const payableMinutes = computePayableMinutes(actualMinutes);
  const payAmount = parseFloat(((payableMinutes / 60) * hourlyRate).toFixed(2));
  return { payableMinutes, payAmount };
}
