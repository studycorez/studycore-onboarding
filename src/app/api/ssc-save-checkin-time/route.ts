import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

const GHL_BASE = 'https://services.leadconnectorhq.com';
const CF_WEEKLY_CHECKIN = 'PrlX68P986aJSuY7o8HL'; // Weekly Check-in Time field

export async function POST(req: NextRequest) {
  const { contactId, studentTime, parentTime } = await req.json();
  if (!contactId) return NextResponse.json({ ok: false }, { status: 400 });

  const value = [
    studentTime ? `Student: ${studentTime}` : '',
    parentTime  ? `Parent: ${parentTime}`   : '',
  ].filter(Boolean).join(' / ');

  const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${process.env.GHL_SUPPORT_API_KEY}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    },
    body: JSON.stringify({
      customFields: [{ id: CF_WEEKLY_CHECKIN, fieldValue: value }],
    }),
  });

  if (!res.ok) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}
