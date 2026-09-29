import { NextRequest, NextResponse } from 'next/server';
import { encodeSchedule, type DayAbbrev } from '@/lib/ssc-schedule';
import { postToSchedulingChannel } from '@/lib/slack';

export const dynamic = 'force-dynamic';

const GHL_BASE = 'https://services.leadconnectorhq.com';
const CF_AVAILABILITY    = 'nHsEh70Hs2ClIkFNHAQS';
const CF_SESSIONS_PER_WK = 'u6MJJujMhwiGKs7m9IPN';
const CF_START_DATE      = 'GCoTG1MOp7eerdcCfgm4';

const TZ_ABBR: Record<string, string> = {
  'America/New_York':    'ET',
  'America/Chicago':     'CT',
  'America/Denver':      'MT',
  'America/Phoenix':     'MT',
  'America/Los_Angeles': 'PT',
  'America/Anchorage':   'AKT',
  'Pacific/Honolulu':    'HT',
};

function headers() {
  return {
    Authorization: `Bearer ${process.env.GHL_SUPPORT_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      contactId:          string;
      sessionDays:        string[];
      sessionDurationHrs: number;
      sessionTime?:       string;
      sessionTimezone?:   string;
      startDate?:         string;
      studentName?:       string;
      tutorName?:         string;
    };

    const { contactId, sessionDays, sessionDurationHrs, sessionTime, sessionTimezone, startDate, studentName, tutorName } = body;

    if (!contactId || !Array.isArray(sessionDays) || sessionDays.length === 0) {
      return NextResponse.json({ error: 'Missing contactId or sessionDays' }, { status: 400 });
    }

    const availabilityValue  = encodeSchedule(sessionDays as DayAbbrev[], sessionDurationHrs ?? 1.5, sessionTime, sessionTimezone);
    const sessionsPerWkValue = sessionDays.length.toString();

    const customFields: { id: string; field_value: string }[] = [
      { id: CF_AVAILABILITY,    field_value: availabilityValue },
      { id: CF_SESSIONS_PER_WK, field_value: sessionsPerWkValue },
    ];
    if (startDate) {
      customFields.push({ id: CF_START_DATE, field_value: startDate });
    }

    const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ customFields }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[ssc-update-schedule] GHL error:', text);
      return NextResponse.json({ error: 'GHL update failed', detail: text }, { status: 502 });
    }

    // Fire Slack notification to scheduling manager
    const tzAbbr = sessionTimezone ? (TZ_ABBR[sessionTimezone] ?? sessionTimezone) : '';
    const timeStr = sessionTime ? `${sessionTime}${tzAbbr ? ` ${tzAbbr}` : ''}` : 'TBD';
    const daysStr = sessionDays.join(', ');
    const durStr  = `${sessionDurationHrs} hr${sessionDurationHrs !== 1 ? 's' : ''}`;
    const lines = [
      `📅 *Schedule Set — ${studentName ?? contactId}*`,
      `Tutor: ${tutorName ?? 'TBD'}`,
      `Days: ${daysStr}`,
      `Time: ${timeStr}`,
      `Duration: ${durStr}`,
      startDate ? `Start Date: ${startDate}` : null,
    ].filter(Boolean).join('\n');

    await postToSchedulingChannel(lines);

    return NextResponse.json({ ok: true, availability: availabilityValue, sessionsPerWeek: sessionsPerWkValue });
  } catch (err) {
    console.error('[ssc-update-schedule] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
