/**
 * POST /api/webhooks/tally-student-form
 *
 * Handles submission of the student onboarding availability form (Tally form b5PvVo).
 * Fires the tutor broadcast immediately so tutors can reply OPEN before the onboarding call.
 *
 * Flow:
 * 1. Parse form fields (name, email, phone, timezone, scores, test date, availability by day)
 * 2. Format availability into broadcast-ready string
 * 3. Fire broadcastToTutors
 * 4. Post to Slack
 */

import { NextRequest, NextResponse } from 'next/server';
import { broadcastToTutors } from '@/lib/tutor-broadcast';

// Maps full day names to the abbreviated keys used in the Tutor Intake table
const DAY_ABBR: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu',
  Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
};

function toSlotName(raw: string): string | null {
  const l = raw.toLowerCase();
  if (l.startsWith('morning'))   return 'Morning';
  if (l.startsWith('afternoon')) return 'Afternoon';
  if (l.startsWith('evening'))   return 'Evening';
  return null;
}
import { postToSlack } from '@/lib/slack';

export const dynamic = 'force-dynamic';

// ── Field helpers ─────────────────────────────────────────────────────────────

function field(fields: any[], ...labels: string[]): string {
  for (const label of labels) {
    const f = fields.find((f: any) => f.label === label);
    if (f && f.value !== null && f.value !== undefined) {
      if (Array.isArray(f.value)) return f.value.join(', ');
      return String(f.value);
    }
  }
  return '';
}

function fieldArr(fields: any[], label: string): string[] {
  const f = fields.find((f: any) => f.label === label);
  if (!f || f.value === null || f.value === undefined) return [];
  if (Array.isArray(f.value)) return f.value.map(String).filter(Boolean);
  if (typeof f.value === 'string' && f.value) return f.value.split(',').map((s: string) => s.trim()).filter(Boolean);
  return [];
}

// ── Timezone mapping ──────────────────────────────────────────────────────────

const TZ_MAP: Record<string, string> = {
  'Pacific':  'America/Los_Angeles',
  'Mountain': 'America/Denver',
  'Central':  'America/Chicago',
  'Eastern':  'America/New_York',
};

// ── Availability formatting ───────────────────────────────────────────────────

const DAY_LABELS: [string, string][] = [
  ['Monday',    'Mon'],
  ['Tuesday',   'Tue'],
  ['Wednesday', 'Wed'],
  ['Thursday',  'Thu'],
  ['Friday',    'Fri'],
  ['Saturday',  'Sat'],
  ['Sunday',    'Sun'],
];

function formatAvailability(fields: any[]): string {
  const parts: string[] = [];
  for (const [fullDay, abbr] of DAY_LABELS) {
    const slots = fieldArr(fields, `What times work on ${fullDay}?`);
    const available = slots.filter(s => !s.toLowerCase().includes('not available'));
    if (available.length === 0) continue;
    const shortSlots = available.map(s => {
      if (s.toLowerCase().startsWith('morning'))   return 'Morning';
      if (s.toLowerCase().startsWith('afternoon')) return 'Afternoon';
      if (s.toLowerCase().startsWith('evening'))   return 'Evening';
      return s;
    });
    parts.push(`${abbr} (${shortSlots.join('/')})`);
  }
  return parts.join(', ') || 'TBD';
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body  = await req.json();
    const fields: any[] = body?.data?.fields ?? [];

    const studentName  = field(fields, 'Your full name');
    const studentEmail = field(fields, 'Your email');
    const studentPhone = field(fields, 'Your phone number');
    const tzRaw        = field(fields, 'What time zone are you in?');
    const currentScore = field(fields, 'What was your most recent score?');
    const targetScore  = field(fields, 'What score are you going for?');
    const testDate     = field(fields, 'Which SAT date are you taking?');
    const notes        = field(fields, 'Any other timing notes?');

    if (!studentName || !studentEmail) {
      return NextResponse.json({ error: 'Missing student name or email' }, { status: 400 });
    }

    const availability = formatAvailability(fields);
    const timezone     = TZ_MAP[tzRaw] ?? 'America/New_York';

    // Build per-day availability map for Airtable filtering
    const studentAvailability: Record<string, string[]> = {};
    let availDayCount = 0;
    for (const [fullDay, abbr] of DAY_LABELS) {
      const slots = fieldArr(fields, `What times work on ${fullDay}?`);
      const named = slots.map(toSlotName).filter((s): s is string => s !== null);
      if (named.length > 0) {
        studentAvailability[abbr] = named;
        availDayCount++;
      }
    }

    // Fire broadcast — only to tutors who match the student's availability
    await broadcastToTutors({
      studentName,
      studentEmail,
      studentPhone,
      availability: notes ? `${availability} | Notes: ${notes}` : availability,
      hoursPerWeek: availDayCount > 0 ? String(availDayCount) : '?',
      totalHours:   '?',
      startDate:    '',
      testDate,
      currentScore,
      targetScore,
    }, studentAvailability);

    // Slack notification with form summary
    await postToSlack(
      `📋 *Student Form Submitted — ${studentName}*\n` +
      `Score: ${currentScore || '?'} → ${targetScore || '?'} | Test: ${testDate || 'TBD'}\n` +
      `Availability: ${availability}\n` +
      `Timezone: ${tzRaw || '?'}\n` +
      `📡 Broadcast sent to all active tutors`
    );

    return NextResponse.json({ ok: true, availability });
  } catch (err: any) {
    console.error('[tally-student-form]', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
