/**
 * GoHighLevel (GHL) contact sync helper.
 * Requires GHL_API_KEY and GHL_LOCATION_ID environment variables.
 */

const GHL_BASE = 'https://services.leadconnectorhq.com';

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

export interface GHLContactPayload {
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string | null;
  name?: string;
  customField?: Record<string, string>;
  tags?: string[];
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName  = parts.slice(1).join(' ') || '';
  return { firstName, lastName };
}

/**
 * Upsert a contact in GHL by email.
 * Returns the GHL contact ID, or null on failure.
 */
export async function upsertGHLContact(payload: GHLContactPayload): Promise<string | null> {
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return null; // silently skip if not configured

  try {
    // Search for existing contact
    const searchRes = await fetch(
      `${GHL_BASE}/contacts/search/duplicate?locationId=${locationId}&email=${encodeURIComponent(payload.email)}`,
      { headers: ghlHeaders() },
    );

    let contactId: string | null = null;

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      contactId = searchData?.contact?.id ?? null;
    }

    const { firstName, lastName } = splitName(payload.name ?? `${payload.firstName ?? ''} ${payload.lastName ?? ''}`.trim());

    const body: Record<string, unknown> = {
      locationId,
      email:     payload.email,
      firstName,
      lastName,
      ...(payload.phone ? { phone: payload.phone } : {}),
      ...(payload.tags  ? { tags:  payload.tags  } : {}),
      ...(payload.customField ? { customField: payload.customField } : {}),
    };

    if (contactId) {
      // Update existing
      const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
        method: 'PUT',
        headers: ghlHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.error('[ghl] update failed:', res.status, await res.text());
        return null;
      }
      return contactId;
    } else {
      // Create new
      const res = await fetch(`${GHL_BASE}/contacts/`, {
        method: 'POST',
        headers: ghlHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.error('[ghl] create failed:', res.status, await res.text());
        return null;
      }
      const data = await res.json();
      return data?.contact?.id ?? null;
    }
  } catch (err) {
    console.error('[ghl] upsertGHLContact error:', err);
    return null;
  }
}

/**
 * Add a tag to a GHL contact by email.
 */
export async function addGHLTag(email: string, tag: string): Promise<void> {
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return;

  try {
    const searchRes = await fetch(
      `${GHL_BASE}/contacts/search/duplicate?locationId=${locationId}&email=${encodeURIComponent(email)}`,
      { headers: ghlHeaders() },
    );
    if (!searchRes.ok) return;
    const { contact } = await searchRes.json();
    if (!contact?.id) return;

    const existing: string[] = contact.tags ?? [];
    if (existing.includes(tag)) return;

    await fetch(`${GHL_BASE}/contacts/${contact.id}`, {
      method: 'PUT',
      headers: ghlHeaders(),
      body: JSON.stringify({ locationId, tags: [...existing, tag] }),
    });
  } catch { /* best-effort */ }
}
