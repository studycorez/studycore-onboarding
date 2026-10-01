import { NextRequest, NextResponse } from 'next/server';
import { createAppointment } from '@/lib/ghl-support';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { calendarId, contactId, startTime, endTime, title } = body ?? {};
  if (!calendarId || !contactId || !startTime || !endTime || !title) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const appointmentId = await createAppointment({ calendarId, contactId, startTime, endTime, title });
  if (!appointmentId) {
    return NextResponse.json({ error: 'GHL appointment creation failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, appointmentId });
}
