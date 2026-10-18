import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GHL_BASE = 'https://services.leadconnectorhq.com';

const HOUR_CF = {
  HOURS_PURCHASED:    'etFhJwmUHaXckNDl0QMW',
  HOURS_COMPLETED:    'VLz7JSx5KLXLIp7e6vFx',
  HOURS_REMAINING:    'D7HseGnpqkc2i2hqrhRd',
  SESSIONS_COMPLETED: 'W9EtK6usUyCjMROF3MpW',
};
const CF_STUDENT_NAME = 'SVWWOw5yr7q7POnmp3eY';

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
      sessionsCompleted:  number;
      hoursCompleted:     number;
      hoursPurchased:     number;
      studentName?:       string;
    };

    const { contactId, sessionsCompleted, hoursCompleted, hoursPurchased, studentName } = body;

    if (!contactId) {
      return NextResponse.json({ error: 'Missing contactId' }, { status: 400 });
    }

    const hoursRemaining = Math.max(0, hoursPurchased - hoursCompleted);

    const customFields: { id: string; field_value: string }[] = [
      { id: HOUR_CF.HOURS_PURCHASED,    field_value: hoursPurchased.toString() },
      { id: HOUR_CF.SESSIONS_COMPLETED, field_value: sessionsCompleted.toString() },
      { id: HOUR_CF.HOURS_COMPLETED,    field_value: hoursCompleted.toString() },
      { id: HOUR_CF.HOURS_REMAINING,    field_value: hoursRemaining.toString() },
    ];
    if (studentName) customFields.push({ id: CF_STUDENT_NAME, field_value: studentName });

    const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ customFields }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[ssc-update-progress] GHL error:', text);
      return NextResponse.json({ error: 'GHL update failed', detail: text }, { status: 502 });
    }

    return NextResponse.json({ ok: true, hoursRemaining });
  } catch (err) {
    console.error('[ssc-update-progress] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
