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

async function lookupContactByPhone(phone: string): Promise<string | null> {
  const url = `${GHL_BASE}/contacts/search?locationId=${encodeURIComponent(LOCATION_ID)}&phone=${encodeURIComponent(phone)}`;
  const res = await fetch(url, { headers: ghlHeaders() });
  if (!res.ok) {
    console.error(`[sms] contact lookup failed ${res.status}:`, await res.text());
    return null;
  }
  const data = await res.json();
  const contacts: any[] = data.contacts ?? [];
  return contacts[0]?.id ?? null;
}

export async function sendSMS(phone: string, message: string): Promise<void> {
  if (!GHL_API_KEY) {
    console.warn('[sms] GHL_API_KEY not set — skipping SMS');
    return;
  }

  const contactId = await lookupContactByPhone(phone);
  if (!contactId) {
    console.warn(`[sms] no GHL contact found for phone ${phone} — skipping`);
    return;
  }

  const res = await fetch(`${GHL_BASE}/conversations/messages`, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify({ type: 'SMS', contactId, message, from: GHL_A2P_NUMBER }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[sms] send failed ${res.status}:`, text);
    throw new Error(`GHL SMS error ${res.status}: ${text}`);
  }

  console.log(`[sms] sent to contactId=${contactId}`);
}
