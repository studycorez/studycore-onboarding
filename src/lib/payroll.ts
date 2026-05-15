/**
 * Compute payable minutes per StudyCore policy:
 *   - Sessions under 60 min are paid as 60 min (minimum)
 *   - Otherwise floor to nearest 30-min block
 *   - 60 → 60, 73 → 60, 90 → 90, 110 → 90, 120 → 120
 *
 * Applies only to sessions that actually happened (status='completed').
 * Callers must filter status before calling this.
 */
export function computePayableMinutes(actualMinutes: number): number {
  if (actualMinutes < 60) return 60;
  return Math.floor(actualMinutes / 30) * 30;
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
