/**
 * Hours Policy — Pure functions for computing session hours attribution.
 *
 * Rounding rule (nearest 30-min block, floor-based):
 *   < 15 min  → 0.0 hr
 *   15–44 min → 0.5 hr
 *   45–74 min → 1.0 hr
 *   75–104 min → 1.5 hr
 *   105–134 min → 2.0 hr
 *   ...continues in 30-min steps
 *
 * Examples:
 *   0 → 0, 14 → 0, 15 → 0.5, 29 → 0.5, 44 → 0.5,
 *   45 → 1.0, 60 → 1.0, 74 → 1.0, 75 → 1.5, 104 → 1.5,
 *   105 → 2.0
 *
 * Four session scenarios:
 *   1. Normal (both student and tutor ≥15 min): round student runtime
 *   2. Student no-show (student <15, tutor ≥15): full scheduled duration penalty
 *   3. Tutor no-show (tutor <15, student ≥15): 0 hours
 *   4. Mutual no-show (both <15): 0 hours
 *
 * DO NOT modify this file without updating HOURS_POLICY_VERSION
 * and writing a corresponding migration if used_hours values need
 * recomputation.
 */

/** Bump this when the rounding rule or scenario logic changes. */
export const HOURS_POLICY_VERSION = '2026-06-10';

/** Days after a session before hours are auto-finalized by cron. */
export const HOURS_FINALIZED_TIMEOUT_DAYS = 7;

/**
 * Round actual runtime minutes to hours using the StudyCore step policy.
 * Returns 0 for negative, NaN, or Infinity inputs.
 */
export function roundHours(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes < 15) return 0;
  return Math.floor((minutes - 15) / 30) * 0.5 + 0.5;
}

type SessionScenario = 'normal' | 'student_no_show' | 'tutor_no_show' | 'mutual_no_show';

/**
 * Compute attributed hours and classify the session scenario.
 */
export function computeSessionHours(params: {
  studentRuntimeMin: number;
  tutorRuntimeMin: number;
  scheduledDurationMin: number;
}): { hours: number; scenario: SessionScenario } {
  const { studentRuntimeMin, tutorRuntimeMin, scheduledDurationMin } = params;

  if (studentRuntimeMin >= 15 && tutorRuntimeMin >= 15) {
    return { hours: roundHours(studentRuntimeMin), scenario: 'normal' };
  }
  if (studentRuntimeMin < 15 && tutorRuntimeMin >= 15) {
    return { hours: scheduledDurationMin / 60, scenario: 'student_no_show' };
  }
  if (studentRuntimeMin >= 15 && tutorRuntimeMin < 15) {
    return { hours: 0, scenario: 'tutor_no_show' };
  }
  return { hours: 0, scenario: 'mutual_no_show' };
}

/**
 * Compute hours for a tutor-logged session (no Zoom data available).
 * Uses the same rounding policy applied to the tutor's reported duration.
 */
export function computeTutorLoggedHours(loggedDurationMin: number): number {
  return roundHours(loggedDurationMin);
}
