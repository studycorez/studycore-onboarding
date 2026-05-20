import { fromZonedTime } from 'date-fns-tz';
import { addDays } from 'date-fns';

const DEFAULT_TZ = 'America/Los_Angeles';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Returns local date components (year, 1-indexed month, day, weekday 0=Sun)
 * for a UTC Date interpreted in the given IANA timezone.
 * Uses Intl — no external dependencies, handles DST correctly.
 */
function getLocalDateParts(
  utcDate: Date,
  tz: string,
): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(utcDate);

  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0');
  const wStr = parts.find(p => p.type === 'weekday')?.value ?? 'Sun';
  const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return { year: get('year'), month: get('month'), day: get('day'), weekday: DOW[wStr] ?? 0 };
}

/**
 * Returns the UTC Date for the next upcoming occurrence of `dayOfWeek`
 * (0=Sun … 6=Sat) at `timeStr` ("HH:MM") in the given IANA timezone.
 * Looks forward up to 8 days; falls back to 7 days out if nothing found.
 */
function nextOccurrenceUTC(dayOfWeek: number, timeStr: string, tz: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();

  for (let i = 0; i < 8; i++) {
    const probe = addDays(now, i);
    const local = getLocalDateParts(probe, tz);

    if (local.weekday !== dayOfWeek) continue;

    // Build a local datetime string and let date-fns-tz convert it to UTC
    const localStr = `${local.year}-${pad(local.month)}-${pad(local.day)}T${pad(h)}:${pad(m)}:00`;
    const utc = fromZonedTime(localStr, tz);

    if (utc > now) return utc;
  }

  // Fallback: same weekday next week
  const probe = addDays(now, 7);
  const local = getLocalDateParts(probe, tz);
  const localStr = `${local.year}-${pad(local.month)}-${pad(local.day)}T${pad(h)}:${pad(m)}:00`;
  return fromZonedTime(localStr, tz);
}

/**
 * Derives the UTC start/end timestamps and source_timezone for a weekly
 * availability slot.
 *
 * The returned datetimes represent the NEXT upcoming occurrence from now.
 * For subsequent weekly occurrences, add multiples of 7 × 24 × 3600 × 1000 ms.
 *
 * @param day_of_week    0=Sun … 6=Sat (matches tutor_availability.day_of_week)
 * @param start_time     "HH:MM" in tutor's local timezone
 * @param end_time       "HH:MM" in tutor's local timezone
 * @param tutor_timezone IANA timezone string (e.g. "America/Los_Angeles")
 */
export function deriveAvailabilityUTC(
  day_of_week: number,
  start_time: string,
  end_time: string,
  tutor_timezone: string,
): { start_utc: string; end_utc: string; source_timezone: string } {
  const tz = tutor_timezone || DEFAULT_TZ;

  const start = nextOccurrenceUTC(day_of_week, start_time, tz);
  const end   = nextOccurrenceUTC(day_of_week, end_time,   tz);

  // Defensive: if end ≤ start (DST edge or midnight crossing), push end by 1 day
  const endDate = end <= start ? new Date(end.getTime() + 24 * 60 * 60 * 1000) : end;

  return {
    start_utc:       start.toISOString(),
    end_utc:         endDate.toISOString(),
    source_timezone: tz,
  };
}

/**
 * Extracts the UTC minute-of-day (0–1439) from an ISO timestamp.
 * Useful for overlap arithmetic after grouping by UTC day-of-week.
 */
export function utcMinuteOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * Returns the UTC day-of-week (0=Sun … 6=Sat) from an ISO timestamp.
 */
export function utcDayOfWeek(iso: string): number {
  return new Date(iso).getUTCDay();
}
