/**
 * Tutor broadcast — fires when a student's availability is known.
 * Fetches active tutors from Airtable, optionally filters by availability
 * using the Tutor Intake table, then POSTs to the GHL inbound webhook once
 * per matching tutor to trigger the "New Student Tutor Broadcast" workflow.
 *
 * studentAvailability: Record<DayAbbrev, string[]>
 *   Keys: Mon/Tue/Wed/Thu/Fri/Sat/Sun
 *   Values: array of time-of-day slots — "Morning", "Afternoon", "Evening"
 *   If omitted or empty, broadcasts to ALL active tutors (no filter).
 *
 * Availability filter logic:
 *   For each day the student has slots, the tutor must match at least one
 *   slot on that day. All days must match (AND across days, OR within day).
 *   e.g. {Mon: ['Morning','Evening'], Wed: ['Afternoon']} →
 *     AND(
 *       OR(Mon has Morning, Mon has Evening),
 *       OR(Wed has Afternoon)
 *     )
 */

const AIRTABLE_BASE        = 'appTAp5csw4vqR6NA';
const TUTOR_INTAKE_TABLE   = 'tblvOHePCuwYPSNNh';
const GHL_WEBHOOK_URL      = 'https://services.leadconnectorhq.com/hooks/T4M5UHtoDZkcVAK31IFA/webhook-trigger/3c4300ec-a9da-42b3-8412-7b40c10f7abd';

const VALID_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type DayAbbrev = typeof VALID_DAYS[number];

export interface BroadcastData {
  studentName:   string;
  studentEmail:  string;
  studentPhone:  string;
  availability:  string;
  hoursPerWeek:  string;
  totalHours:    string;
  startDate:     string;
  testDate:      string;
  currentScore:  string;
  targetScore:   string;
}

// ── Availability filtering ───────────────────────────────────────────────────

/**
 * Queries the Tutor Intake table for tutors available on ALL requested days,
 * matching at least one time slot per day.
 * Returns a Set of lowercase tutor emails.
 */
async function getMatchingTutorEmails(
  token: string,
  availability: Partial<Record<string, string[]>>,
): Promise<Set<string>> {
  const days = Object.entries(availability)
    .filter(([day, slots]) => (VALID_DAYS as readonly string[]).includes(day) && slots && slots.length > 0) as [string, string[]][];

  if (!days.length) return new Set();

  // Build Airtable filterByFormula
  const dayClauses = days.map(([day, slots]) => {
    const slotChecks = slots.map(
      slot => `FIND("${slot}", ARRAYJOIN({${day}}, ",")) > 0`,
    );
    return slotChecks.length === 1 ? slotChecks[0] : `OR(${slotChecks.join(', ')})`;
  });

  const formula = dayClauses.length === 1 ? dayClauses[0] : `AND(${dayClauses.join(', ')})`;

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${TUTOR_INTAKE_TABLE}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=100`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    console.error('[broadcast] Tutor Intake query failed:', await res.text());
    return new Set();
  }

  const data = await res.json();
  const records: any[] = data.records ?? [];

  // Scan all field values for email addresses (no hardcoded field name needed)
  const emails = new Set<string>();
  for (const r of records) {
    for (const value of Object.values(r.fields ?? {})) {
      if (typeof value === 'string' && value.includes('@') && value.includes('.')) {
        emails.add(value.toLowerCase());
      }
    }
  }

  console.log(
    `[broadcast] Tutor Intake matched ${records.length} tutors for ` +
    days.map(([d, s]) => `${d}(${s.join('/')})`).join(', '),
  );
  return emails;
}

// ── Main broadcast ───────────────────────────────────────────────────────────

export async function broadcastToTutors(
  data: BroadcastData,
  studentAvailability?: Partial<Record<string, string[]>>,
): Promise<void> {
  const token = process.env.AIRTABLE_API_TOKEN;
  if (!token) {
    console.error('[broadcast] AIRTABLE_API_TOKEN not set — skipping tutor broadcast');
    return;
  }

  // Fetch all active tutors from Airtable
  const atRes = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE}/Tutors?fields[]=Name&fields[]=Email&fields[]=Phone&fields[]=Active&filterByFormula={Active}=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!atRes.ok) {
    console.error('[broadcast] Airtable Tutors fetch failed:', await atRes.text());
    return;
  }

  let tutors: any[] = (await atRes.json()).records ?? [];

  // Filter by availability if provided
  const hasFilter = studentAvailability && Object.values(studentAvailability).some(s => s && s.length > 0);
  if (hasFilter) {
    const matchedEmails = await getMatchingTutorEmails(token, studentAvailability!);
    if (matchedEmails.size > 0) {
      tutors = tutors.filter(t => {
        const email = String(t.fields.Email ?? '').toLowerCase();
        return email && matchedEmails.has(email);
      });
      console.log(`[broadcast] filtered to ${tutors.length} availability-matched tutors`);
    } else {
      // Intake query returned nothing — fall back to all active tutors
      console.warn('[broadcast] Tutor Intake returned 0 matches — broadcasting to all active tutors');
    }
  }

  console.log(`[broadcast] sending to ${tutors.length} tutors`);

  // Split student name for GHL contact creation
  const nameParts = data.studentName.trim().split(' ');
  const firstName = nameParts[0] ?? data.studentName;
  const lastName  = nameParts.slice(1).join(' ') || '';

  // POST to GHL inbound webhook once per tutor
  await Promise.allSettled(
    tutors.map((t: any) => {
      const tutorName  = String(t.fields.Name  ?? '').trim();
      const tutorEmail = String(t.fields.Email ?? '').trim();
      const tutorPhone = String(t.fields.Phone ?? '').trim();
      if (!tutorEmail) return Promise.resolve();

      return fetch(GHL_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:                  data.studentEmail,
          phone:                  data.studentPhone,
          first_name:             firstName,
          last_name:              lastName,
          tutor_name:             tutorName,
          tutor_email:            tutorEmail,
          tutor_phone:            tutorPhone,
          student_availability:   data.availability,
          student_hours_per_week: data.hoursPerWeek,
          student_total_hours:    data.totalHours,
          student_start_date:     data.startDate,
          student_test_date:      data.testDate,
          student_current_score:  data.currentScore,
          student_target_score:   data.targetScore,
        }),
      });
    }),
  );
}

// ── Time-to-slot helper (used by ssc-update-schedule) ────────────────────────

/**
 * Converts a 12hr time string ("4:00 PM") to a time-of-day slot.
 * Morning = before 12pm, Afternoon = 12–5pm, Evening = after 5pm.
 */
export function timeToSlot(time: string): string {
  const match = time.match(/(\d+):(\d{2})\s*(AM|PM)/i);
  if (!match) return 'Afternoon';
  let h = parseInt(match[1]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}
