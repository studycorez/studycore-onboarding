import { NextRequest, NextResponse } from 'next/server';
import { sendCheckinBookingLink } from '@/lib/checkin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { studentName, checkInType } = await req.json();
    if (!studentName || !checkInType) {
      return NextResponse.json({ error: 'studentName and checkInType required' }, { status: 400 });
    }
    await sendCheckinBookingLink('', studentName, checkInType);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[send-checkin]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
