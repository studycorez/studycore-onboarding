/**
 * Receives the Sales GHL W1 outbound webhook when a deal is marked Won.
 *
 * The GHL-native flow (Sales W1 → Support W1b) already handles:
 *   - Creating the parent contact in Support GHL
 *   - Creating the Student Fulfillment opportunity
 *   - Sending the onboarding email + SMS to the parent with form links
 *
 * This webhook's only job is to fill in what W1b can't do natively:
 *   1. Set STUDENT_NAME custom field from the opportunity name
 *   2. Set PARENT_NAME custom field from the contact's name
 *   3. Create a task for Ria
 *   4. Post to our Slack bot
 *
 * All other student data (scores, sessions/week, availability, etc.)
 * is written later by the onboarding forms.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupportTask } from '@/lib/ghl-support';
import { postToSlack } from '@/lib/slack';

const GHL_BASE         = 'https://services.leadconnectorhq.com';
const SUPPORT_LOCATION = process.env.GHL_SUPPORT_LOCATION_ID ?? 'T4M5UHtoDZkcVAK31IFA';

const CF_STUDENT_NAME = 'SVWWOw5yr7q7POnmp3eY';
const CF_PARENT_NAME  = 'VU2ma6BQHbOHwwAe85WS';

function supportHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_SUPPORT_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

/** Find the Support GHL contact by parent email. */
async function findContactByEmail(email: string): Promise<{ contactId: string; opportunityId: string | null } | null> {
  try {
    const res = await fetch(
      `${GHL_BASE}/contacts/search/duplicate?locationId=${SUPPORT_LOCATION}&email=${encodeURIComponent(email)}`,
      { headers: supportHeaders() },
    );
    if (!res.ok) return null;
    const contactId: string | undefined = (await res.json())?.contact?.id;
    if (!contactId) return null;
    const oppRes = await fetch(
      `${GHL_BASE}/opportunities/search?location_id=${SUPPORT_LOCATION}&contact_id=${contactId}&limit=1`,
      { headers: supportHeaders() },
    );
    const opportunityId = (oppRes.ok ? (await oppRes.json()) : {})?.opportunities?.[0]?.id ?? null;
    return { contactId, opportunityId };
  } catch { return null; }
}

/** Write STUDENT_NAME and PARENT_NAME CFs — the only fields W1b doesn't set. */
async function setNameFields(contactId: string, studentName: string, parentName: string): Promise<void> {
  try {
    await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      method: 'PUT',
      headers: supportHeaders(),
      body: JSON.stringify({
        customFields: [
          { id: CF_STUDENT_NAME, field_value: studentName },
          ...(parentName ? [{ id: CF_PARENT_NAME, field_value: parentName }] : []),
        ],
      }),
    });
  } catch (err) {
    console.error('[ghl-deal-won] setNameFields error:', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log('[ghl-deal-won] payload:', JSON.stringify(body, null, 2));

    const contact     = body.contact ?? body.Contact ?? {};
    const studentName = (body.name ?? body.Name ?? '').trim();

    const parentFirstName = String(contact.firstName ?? contact.FirstName ?? '').trim();
    const parentLastName  = String(contact.lastName  ?? contact.LastName  ?? '').trim();
    const parentName      = `${parentFirstName} ${parentLastName}`.trim() || String(contact.name ?? '').trim();
    const parentEmail     = String(contact.email ?? contact.Email ?? '').trim();

    if (!parentEmail) {
      console.warn('[ghl-deal-won] no parent email in payload');
      return NextResponse.json({ error: 'Missing parent email' }, { status: 400 });
    }
    if (!studentName) {
      console.warn('[ghl-deal-won] no opportunity name (student name) in payload');
      return NextResponse.json({ error: 'Missing opportunity name' }, { status: 400 });
    }

    // W1b may still be in-flight when our webhook fires — retry once after a short wait.
    let found = await findContactByEmail(parentEmail);
    if (!found) {
      await new Promise(r => setTimeout(r, 3000));
      found = await findContactByEmail(parentEmail);
    }

    if (found) {
      await Promise.allSettled([
        setNameFields(found.contactId, studentName, parentName),
        createSupportTask(
          found.contactId,
          `New enrollment — send onboarding forms: ${studentName}`,
          24,
        ),
      ]);
    } else {
      console.warn(`[ghl-deal-won] contact not found for ${parentEmail} — W1b may not have run yet`);
    }

    await postToSlack(
      `🎉 New enrollment (Deal Won): *${studentName}* | Parent: ${parentName || parentEmail}`,
    );

    return NextResponse.json({ ok: true, studentName, contactFound: !!found });
  } catch (err: any) {
    console.error('[ghl-deal-won]', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
