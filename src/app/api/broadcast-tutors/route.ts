import { NextRequest, NextResponse } from 'next/server';

const GHL_BASE       = 'https://services.leadconnectorhq.com';
const LOCATION_ID    = process.env.GHL_SUPPORT_LOCATION_ID ?? 'T4M5UHtoDZkcVAK31IFA';
const AIRTABLE_BASE  = 'appTAp5csw4vqR6NA';
const TUTOR_INTAKE_TABLE = 'tblvOHePCuwYPSNNh';

// Airtable day-field names (multipleSelects, created as short names)
const DAY_FIELD: Record<string, string> = {
  Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu',
  Fri: 'Fri', Sat: 'Sat', Sun: 'Sun',
};

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_SUPPORT_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

function airtableHeaders() {
  return {
    Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

/** Fetch all GHL contacts with the "tutor-active" tag that have a phone number.
 *  GHL's contacts list endpoint does not support tag filtering via query param,
 *  so we paginate all contacts and filter client-side.
 */
async function getTutorContacts(): Promise<{ id: string; email: string; firstName: string }[]> {
  const results: any[] = [];
  let startAfter: number | null = null;
  let startAfterId: string | null = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = new URL(`${GHL_BASE}/contacts/`);
    url.searchParams.set('locationId', LOCATION_ID);
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

  return results
    .filter(c => c.phone && Array.isArray(c.tags) && c.tags.includes('tutor-active'))
    .map(c => ({
      id:        c.id as string,
      email:     (c.email as string ?? '').toLowerCase(),
      firstName: (c.firstName as string) ?? '',
    }));
}

/**
 * Query the Airtable Tutor Intake table for tutors who are available on ALL
 * specified days during the specified time slot.
 * Returns a set of lowercase emails for matched tutors.
 */
async function getAvailableAirtableTutorEmails(days: string[], timeSlot: string): Promise<Set<string>> {
  if (!days.length || !timeSlot) return new Set();

  // Build filterByFormula: each day field must contain the time slot value
  const clauses = days
    .filter(d => DAY_FIELD[d])
    .map(d => `FIND("${timeSlot}", ARRAYJOIN({${DAY_FIELD[d]}}, ",")) > 0`);

  if (!clauses.length) return new Set();
  const formula = clauses.length === 1 ? clauses[0] : `AND(${clauses.join(', ')})`;

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${TUTOR_INTAKE_TABLE}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=100`;
  const res = await fetch(url, { headers: airtableHeaders() });
  if (!res.ok) {
    console.error('[broadcast-tutors] Airtable query failed:', await res.text());
    return new Set();
  }

  const data = await res.json();
  const records: any[] = data.records ?? [];

  const emails = new Set<string>();
  for (const r of records) {
    // Scan all field values for email addresses (robust — no hard-coded field name)
    for (const value of Object.values(r.fields ?? {})) {
      if (typeof value === 'string' && value.includes('@') && value.includes('.')) {
        emails.add(value.toLowerCase());
      }
    }
  }

  console.log(`[broadcast-tutors] Airtable matched ${records.length} tutors for days=${days.join(',')} slot=${timeSlot}`);
  return emails;
}

interface BroadcastRequest {
  message: string;
  availabilityFilter?: {
    days: string[];
    timeSlot: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const { message, availabilityFilter } = await req.json() as BroadcastRequest;
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    let tutors = await getTutorContacts();
    if (!tutors.length) {
      return NextResponse.json({ sent: 0, failed: 0, total: 0 });
    }

    // If an availability filter is set, narrow down to matching tutors only
    if (availabilityFilter?.days?.length && availabilityFilter.timeSlot) {
      const matchedEmails = await getAvailableAirtableTutorEmails(
        availabilityFilter.days,
        availabilityFilter.timeSlot,
      );
      if (matchedEmails.size > 0) {
        tutors = tutors.filter(t => matchedEmails.has(t.email));
      }
      console.log(`[broadcast-tutors] Filtered to ${tutors.length} tutors with matching availability`);
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
