/**
 * SSC scheduling utilities — pure TypeScript, no side effects.
 */

export type DayAbbrev = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export const ALL_DAYS: DayAbbrev[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NUM: Record<DayAbbrev, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

// ─── Stage ordering ───────────────────────────────────────────────────────────

const STAGE_ORDER: Record<string, number> = {
  '79095236-7c28-4684-b7ce-29d03e2d1c86': 0,   // New Enrollment
  'eb217c7e-1f20-4a6d-aeec-f5123fe625db': 1,   // Form Completed
  'f145c10b-bd9f-4794-ab8b-1d3cdc6c3707': 2,   // Diagnostic Done
  'e3af64f6-0af3-487f-aa5c-f8b05f3a84a3': 3,   // Onboarding Call Done
  '34126179-af56-4feb-969d-aec6dd9b6547': 4,   // Session 1 Done
  '22ddfa4c-a618-467f-b894-980d2d2ef4af': 5,   // Session 3 Done
  '99803c34-071c-476c-a513-e3789816bf85': 6,   // Active
  '3294f8d5-ff1c-4368-b0a0-17c3bf0cccc5': 7,   // Phase 1 Done
  '0f27807f-987a-44a4-9e3e-6399c4f73ff4': 8,   // Phase 2 Done
  'd3e839e1-1128-4308-9d51-93b8f2b7dd0d': 9,   // Phase 3 Done
  'd4454fd6-e20f-476d-896b-d4ad2c55c021': 10,  // Phase 4 Done
  '54e8aab9-ddd4-40d9-ab0a-95a7fb753c23': 11,  // Low Hours
  'b3731eaf-3b6f-4db2-9369-d0665f7f6e03': 12,  // SAT Day Done
  'eefacac9-3cbd-46ba-a711-ac24bc00a16c': 13,  // Results Done
};

const STAGE_IDS = {
  FIRST_CHECKIN_COMPLETED:    '34126179-af56-4feb-969d-aec6dd9b6547',
  SESSION3_CHECKIN_COMPLETED: '22ddfa4c-a618-467f-b894-980d2d2ef4af',
  PHASE_1_COMPLETED:          '3294f8d5-ff1c-4368-b0a0-17c3bf0cccc5',
  PHASE_2_COMPLETED:          '0f27807f-987a-44a4-9e3e-6399c4f73ff4',
  PHASE_3_COMPLETED:          'd3e839e1-1128-4308-9d51-93b8f2b7dd0d',
  PHASE_4_COMPLETED:          'd4454fd6-e20f-476d-896b-d4ad2c55c021',
  SAT_DAY_COMPLETED:          'b3731eaf-3b6f-4db2-9369-d0665f7f6e03',
  RESULTS_COMPLETED:          'eefacac9-3cbd-46ba-a711-ac24bc00a16c',
};

function stageOrder(stageId: string): number {
  return STAGE_ORDER[stageId] ?? -1;
}

// ─── Parse / encode ───────────────────────────────────────────────────────────

/**
 * Parse "Mon,Thu|1.5|5:00 PM,3:00 PM|America/Chicago" into structured schedule data.
 *
 * Format: days|duration|times|timezone
 *   - times: comma-separated list in the same order as days (new per-day format)
 *   - backward compat: if times has only one entry, it applies to all days
 *   - even older format: no times at all
 */
export function parseSchedule(
  availability: string,
  sessionsPerWeekStr: string,
): {
  sessionDays: DayAbbrev[];
  sessionDurationHrs: number;
  sessionsPerWeek: number;
  /** First non-empty time — for display in header */
  sessionTime: string;
  sessionTimezone: string;
  /** Per-day times map */
  sessionTimes: Partial<Record<DayAbbrev, string>>;
} {
  const empty = { sessionDays: [] as DayAbbrev[], sessionDurationHrs: 1.5, sessionsPerWeek: parseInt(sessionsPerWeekStr) || 0, sessionTime: '', sessionTimezone: '', sessionTimes: {} };
  const parts = availability.split('|');
  if (parts.length < 2) return empty;

  const sessionDays = parts[0]
    .split(',')
    .map(d => d.trim())
    .filter((d): d is DayAbbrev => ALL_DAYS.includes(d as DayAbbrev));
  const sessionDurationHrs = parseFloat(parts[1]) || 1.5;
  const sessionsPerWeek    = parseInt(sessionsPerWeekStr) || sessionDays.length;

  const rawTimes   = parts[2] ?? '';
  const sessionTimezone = parts[3] ?? '';

  // Build per-day times map
  const sessionTimes: Partial<Record<DayAbbrev, string>> = {};
  if (rawTimes) {
    const timeParts = rawTimes.split(',');
    if (timeParts.length === 1) {
      // Old format: one time applies to all days
      sessionDays.forEach(d => { sessionTimes[d] = rawTimes; });
    } else {
      // New format: one time per day in day order
      sessionDays.forEach((d, i) => { if (timeParts[i]) sessionTimes[d] = timeParts[i]; });
    }
  }

  const sessionTime = rawTimes.split(',')[0] ?? '';
  return { sessionDays, sessionDurationHrs, sessionsPerWeek, sessionTime, sessionTimezone, sessionTimes };
}

/**
 * Encode days + duration + per-day times + timezone.
 * New format: "Mon,Thu|1.5|5:00 PM,3:00 PM|America/Chicago"
 */
export function encodeSchedule(
  days: DayAbbrev[],
  durationHrs: number,
  sessionTimes?: Partial<Record<DayAbbrev, string>>,
  sessionTimezone?: string,
): string {
  let result = `${days.join(',')}|${durationHrs}`;
  if (sessionTimes && Object.keys(sessionTimes).length > 0) {
    const timesStr = days.map(d => sessionTimes[d] ?? '').join(',');
    if (timesStr.replace(/,/g, '').trim()) {
      result += `|${timesStr}`;
      if (sessionTimezone) result += `|${sessionTimezone}`;
    }
  } else if (sessionTimezone) {
    result += `||${sessionTimezone}`;
  }
  return result;
}

/** Returns true if the availability string is in the structured "days|duration[|time[|tz]]" format. */
export function hasSchedule(availability: string): boolean {
  return typeof availability === 'string' && availability.includes('|') && availability.split('|').length >= 2;
}

// ─── Date generation ──────────────────────────────────────────────────────────

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Generate projected session dates starting from startDateStr.
 * Advances day-by-day and yields the date whenever the weekday is in sessionDays.
 */
export function generateSessionDates(
  startDateStr: string,
  sessionDays: DayAbbrev[],
  count: number,
): Date[] {
  const start = parseDate(startDateStr);
  if (!start || !sessionDays.length || count <= 0) return [];

  const dayNums = new Set(sessionDays.map(d => DAY_NUM[d]));
  const result: Date[] = [];
  const cursor = midnight(start);

  while (result.length < count) {
    if (dayNums.has(cursor.getDay())) {
      result.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
    // Safety cap: don't loop more than 365 days
    if (result.length === 0 && cursor.getTime() - start.getTime() > 365 * 86400000) break;
  }
  return result;
}

// ─── Check-in reminders ───────────────────────────────────────────────────────

export interface CheckInReminder {
  type: string;
  callTypeId: string;
  dueDate: Date;
  daysUntil: number;
  status: 'overdue' | 'today' | 'this-week' | 'upcoming' | 'done';
}

const STATUS_ORDER = { overdue: 0, today: 1, 'this-week': 2, upcoming: 3, done: 4 };

function reminderStatus(daysUntil: number): CheckInReminder['status'] {
  if (daysUntil < 0)  return 'overdue';
  if (daysUntil === 0) return 'today';
  if (daysUntil <= 7) return 'this-week';
  return 'upcoming';
}

export function calcCheckInReminders(
  student: {
    stageId:           string;
    startDate:         string;
    availability:      string;
    sessionsPerWeek:   string;
    hoursPurchased:    number;
    hoursCompleted:    number;
    sessionsCompleted: number;
  },
  today?: Date,
): CheckInReminder[] {
  const now        = midnight(today ?? new Date());
  const todayMs    = now.getTime();
  const { sessionDays } = parseSchedule(student.availability, student.sessionsPerWeek);

  // Without a schedule we can't project dates — return empty
  if (!sessionDays.length || !student.startDate) return [];

  // Generate enough session dates to cover everything we need (at least 10)
  const sessionDates = generateSessionDates(student.startDate, sessionDays, 20);
  if (!sessionDates.length) return [];

  const currentOrder = stageOrder(student.stageId);
  const reminders: CheckInReminder[] = [];

  // ── Post-Session 1 ──────────────────────────────────────────────────────────
  const s1 = sessionDates[0];
  if (s1) {
    const dueDate = new Date(s1);
    dueDate.setDate(dueDate.getDate() + 1);
    const isDone = currentOrder >= stageOrder(STAGE_IDS.FIRST_CHECKIN_COMPLETED);
    const daysUntil = Math.round((midnight(dueDate).getTime() - todayMs) / 86400000);
    const status: CheckInReminder['status'] = isDone ? 'done' : reminderStatus(daysUntil);
    reminders.push({ type: 'Post-Session 1', callTypeId: 'post-session-1', dueDate, daysUntil, status });
  }

  // ── Post-Session 3 ──────────────────────────────────────────────────────────
  const s3 = sessionDates[2];
  if (s3) {
    const dueDate = new Date(s3);
    dueDate.setDate(dueDate.getDate() + 1);
    const isDone = currentOrder >= stageOrder(STAGE_IDS.SESSION3_CHECKIN_COMPLETED);
    const daysUntil = Math.round((midnight(dueDate).getTime() - todayMs) / 86400000);
    const status: CheckInReminder['status'] = isDone ? 'done' : reminderStatus(daysUntil);
    reminders.push({ type: 'Post-Session 3', callTypeId: 'weekly-student', dueDate, daysUntil, status });
  }

  // ── Weekly Sync ─────────────────────────────────────────────────────────────
  // Recurs every 7 days from session 1 date. Show the next one within 10 days or overdue.
  if (s1) {
    const s1Time = midnight(s1).getTime();
    // Find the current cycle index: how many 7-day periods have elapsed since s1
    const elapsed = Math.floor((todayMs - s1Time) / (7 * 86400000));
    const cycleStart = elapsed >= 0 ? elapsed : 0;

    // Check this cycle and next to find one that's within 10 days or overdue
    for (let i = cycleStart; i <= cycleStart + 2; i++) {
      const dueDate = new Date(s1);
      dueDate.setDate(dueDate.getDate() + i * 7);
      const daysUntil = Math.round((midnight(dueDate).getTime() - todayMs) / 86400000);
      if (daysUntil <= 10) {
        reminders.push({
          type: 'Weekly Sync',
          callTypeId: 'weekly-student',
          dueDate,
          daysUntil,
          status: reminderStatus(daysUntil),
        });
        break;
      }
    }
  }

  // ── Phase Check-in ──────────────────────────────────────────────────────────
  // Show if stageId is one of the Phase*Done stages AND it's overdue/today (just completed).
  const phaseStages = [
    STAGE_IDS.PHASE_1_COMPLETED,
    STAGE_IDS.PHASE_2_COMPLETED,
    STAGE_IDS.PHASE_3_COMPLETED,
    STAGE_IDS.PHASE_4_COMPLETED,
  ];
  if (phaseStages.includes(student.stageId)) {
    // Due = today (it just completed). We show it regardless as it's actionable.
    reminders.push({
      type:       'Phase Check-in',
      callTypeId: 'phase-checkin',
      dueDate:    now,
      daysUntil:  0,
      status:     'today',
    });
  }

  // ── Post-SAT Day ─────────────────────────────────────────────────────────────
  if (student.stageId === STAGE_IDS.SAT_DAY_COMPLETED) {
    reminders.push({
      type:       'Post-SAT Day',
      callTypeId: 'sat-day',
      dueDate:    now,
      daysUntil:  0,
      status:     'today',
    });
  }

  // ── Post-SAT Results ─────────────────────────────────────────────────────────
  if (student.stageId === STAGE_IDS.RESULTS_COMPLETED) {
    reminders.push({
      type:       'Post-SAT Results',
      callTypeId: 'sat-day',
      dueDate:    now,
      daysUntil:  0,
      status:     'today',
    });
  }

  // ── Sort ────────────────────────────────────────────────────────────────────
  reminders.sort((a, b) => {
    const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (so !== 0) return so;
    return a.dueDate.getTime() - b.dueDate.getTime();
  });

  return reminders;
}
