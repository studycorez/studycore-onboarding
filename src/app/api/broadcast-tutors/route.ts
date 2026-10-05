import { NextRequest, NextResponse } from 'next/server';

const GHL_BASE = 'https://services.leadconnectorhq.com';
const LOCATION_ID = process.env.GHL_SUPPORT_LOCATION_ID ?? 'T4M5UHtoDZkcVAK31IFA';

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_SUPPORT_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

async function getTutorContacts(): Promise<{ id: string; firstName: string }[]> {
  const results: any[] = [];
  let startAfter: number | null = null;
  let startAfterId: string | null = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = new URL(`${GHL_BASE}/contacts/`);
    url.searchParams.set('locationId', LOCATION_ID);
    url.searchParams.set('tags', 'tutor');
    url.searchParams.set('limit', '100');
    if (startAfter)   url.searchParams.set('startAfter',   String(startAfter));
    if (startAfterId) url.searchParams.set('startAfterId', startAfterId);

    const res = await fetch(url.toString(), { headers: ghlHeaders() });
    if (!res.ok) break;
    const data = await res.json();
    const contacts: any[] = data.contacts ?? [];
    results.push(...contacts);

    if (contacts.length < 100 || !data.meta?.nextPageUrl) break;
    startAfter   = data.meta.startAfter   ?? null;
    startAfterId = data.meta.startAfterId ?? null;
  }

  // Only include contacts that have a phone number (required for SMS)
  return results
    .filter(c => c.phone)
    .map(c => ({ id: c.id as string, firstName: (c.firstName as string) ?? '' }));
}

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json() as { message?: string };
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const tutors = await getTutorContacts();
    if (!tutors.length) {
      return NextResponse.json({ sent: 0, failed: 0, total: 0 });
    }

    let sent = 0;
    let failed = 0;

    await Promise.allSettled(
      tutors.map(async (tutor) => {
        const res = await fetch(`${GHL_BASE}/conversations/messages`, {
          method: 'POST',
          headers: ghlHeaders(),
          body: JSON.stringify({
            type: 'SMS',
            contactId: tutor.id,
            locationId: LOCATION_ID,
            message,
          }),
        });
        if (res.ok) {
          sent++;
        } else {
          failed++;
          console.error('[broadcast-tutors] SMS failed for contact', tutor.id, await res.text());
        }
      }),
    );

    return NextResponse.json({ sent, failed, total: tutors.length });
  } catch (err) {
    console.error('[broadcast-tutors] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
