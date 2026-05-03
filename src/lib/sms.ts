const GHL_API_KEY     = process.env.GHL_API_KEY!;
const LOCATION_ID     = process.env.NEXT_PUBLIC_GHL_LOCATION_ID || '67091iYHBXVeSyRGbCoq';
const GHL_BASE        = 'https://services.leadconnectorhq.com';
const GHL_VERSION     = '2021-04-15';
const GHL_A2P_NUMBER  = '+19254815501';

function ghlHeaders() {
  return {
    Authorization: `Bearer ${GHL_API_KEY}`,
    Version: GHL_VERSION,
    'Content-Type': 'application/json',
  };
}

/**
 * Find a GHL contact by phone number using the contacts list search.
 * Returns the contact ID, or null if not found.
 */
async function lookupContactByPhone(phone: string): Promise<string | null> {
  const url = `${GHL_BASE}/contacts/?locationId=${encodeURIComponent(LOCATION_ID)}&query=${encodeURIComponent(phone)}`;
  const res = await fetch(url, { headers: ghlHeaders() });
  if (!res.ok) {
    console.error(`[sms] contact lookup failed ${res.status}:`, await res.text());
    return null;
  }
  const data = await res.json();
  const contacts: { id: string }[] = data?.contacts ?? [];
  return contacts[0]?.id ?? null;
}

/**
 * Find or create a GHL contact for the given phone number.
 * Returns the contact ID, or null on failure.
 */
async function findOrCreateContact(phone: string): Promise<string | null> {
  const existing = await lookupContactByPhone(phone);
  if (existing) return existing;

  // Not found — create a minimal contact so we can message them
  const res = await fetch(`${GHL_BASE}/contacts/`, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify({ locationId: LOCATION_ID, phone }),
  });
  const body = await res.text();

  if (res.ok) {
    try {
      const data = JSON.parse(body);
      const id = data?.contact?.id as string | undefined;
      if (id) return id;
    } catch { /* fall through */ }
  }

  // GHL may reject with 400 "duplicate contact" and return the existing contact's ID
  if (res.status === 400) {
    try {
      const data = JSON.parse(body);
      const dupId = data?.meta?.contactId as string | undefined;
      if (dupId) return dupId;
    } catch { /* fall through */ }
  }

  console.error(`[sms] could not find or create contact for ${phone} — ${res.status}: ${body}`);
  return null;
}

export async function sendSMS(phone: string, message: string): Promise<void> {
  if (!GHL_API_KEY) {
    console.warn('[sms] GHL_API_KEY not set — skipping SMS');
    return;
  }

  const contactId = await findOrCreateContact(phone);
  if (!contactId) {
    console.error(`[sms] no GHL contact for ${phone} — SMS not sent: "${message.slice(0, 60)}"`);
    return;
  }

  const res = await fetch(`${GHL_BASE}/conversations/messages`, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify({ type: 'SMS', contactId, message, from: GHL_A2P_NUMBER }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[sms] send failed ${res.status} (contactId=${contactId}, phone=${phone}):`, text);
    throw new Error(`GHL SMS error ${res.status}: ${text}`);
  }

  console.log(`[sms] sent to ${phone} (contactId=${contactId})`);
}
