import { NextRequest, NextResponse } from 'next/server';
import { encodeSchedule, type DayAbbrev } from '@/lib/ssc-schedule';

export const dynamic = 'force-dynamic';

const GHL_BASE = 'https://services.leadconnectorhq.com';
const CF_AVAILABILITY    = 'nHsEh70Hs2ClIkFNHAQS';
const CF_SESSIONS_PER_WK = 'u6MJJujMhwiGKs7m9IPN';

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
    };

    const { contactId, sessionDays, sessionDurationHrs, sessionTime, sessionTimezone } = body;

    if (!contactId || !Array.isArray(sessionDays) || sessionDays.length === 0) {
      return NextResponse.json({ error: 'Missing contactId or sessionDays' }, { status: 400 });
    }

    const availabilityValue = encodeSchedule(sessionDays as DayAbbrev[], sessionDurationHrs ?? 1.5, sessionTime, sessionTimezone);
    const sessionsPerWkValue = sessionDays.length.toString();

    const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({
        customFields: [
          { id: CF_AVAILABILITY,    field_value: availabilityValue },
          { id: CF_SESSIONS_PER_WK, field_value: sessionsPerWkValue },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[ssc-update-schedule] GHL error:', text);
      return NextResponse.json({ error: 'GHL update failed', detail: text }, { status: 502 });
    }

    return NextResponse.json({ ok: true, availability: availabilityValue, sessionsPerWeek: sessionsPerWkValue });
  } catch (err) {
    console.error('[ssc-update-schedule] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
