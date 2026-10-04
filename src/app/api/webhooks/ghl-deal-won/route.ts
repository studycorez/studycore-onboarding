/**
 * Receives the Sales GHL W1 outbound webhook when a deal is marked Won.
 *
 * This webhook is intentionally minimal — it creates the enrollment skeleton
 * in Support GHL so the record exists immediately. All student data (scores,
 * availability, sessions/week, hours, etc.) is written later by the onboarding
 * forms:
 *   - Tally enrollment form (closer fills this out) → /api/webhooks/tally-enrollment
 *   - Student onboarding Tally form                → /api/onboard/student
 *
 * We do NOT read Sales GHL custom fields here because sales reps don't
 * reliably fill them. The only Sales GHL data we use is what's always present
 * in the webhook payload itself: parent contact info + opportunity name.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  upsertSupportContact,
  createEnrollmentOpportunity,
  createSupportTask,
  type EnrollmentData,
} from '@/lib/ghl-support';
import { postToSlack } from '@/lib/slack';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log('[ghl-deal-won] payload:', JSON.stringify(body, null, 2));

    // GHL outbound webhook shape for opportunity events:
    // { contact: { id, firstName, lastName, email, phone }, name: "Opp Name", ... }
    const contact       = body.contact ?? body.Contact ?? {};
    const studentName   = (body.name ?? body.Name ?? '').trim() || 'Unknown';

    const parentFirstName = String(contact.firstName ?? contact.FirstName ?? '').trim();
    const parentLastName  = String(contact.lastName  ?? contact.LastName  ?? '').trim();
    const parentName      = `${parentFirstName} ${parentLastName}`.trim() || String(contact.name ?? '').trim();
    const parentEmail     = String(contact.email ?? contact.Email ?? '').trim();
    const parentPhone     = String(contact.phone ?? contact.Phone ?? '').trim();

    if (!parentEmail) {
      console.warn('[ghl-deal-won] no parent email in payload — skipping');
      return NextResponse.json({ error: 'Missing parent email' }, { status: 400 });
    }

    const data: EnrollmentData = {
      studentName,
      studentEmail: '',   // filled later by student onboarding form
      parentName,
      parentEmail,
      parentPhone,
      // All other fields (packageHours, sessionFrequency, scores, etc.) are
      // filled later by the Tally enrollment form or student onboarding form.
    };

    const supportContactId = await upsertSupportContact(data);

    await Promise.allSettled([
      supportContactId
        ? createEnrollmentOpportunity(supportContactId, studentName)
        : Promise.resolve(null),
      supportContactId
        ? createSupportTask(
            supportContactId,
            `New enrollment (Deal Won): ${studentName} — send onboarding forms`,
            24,
          )
        : Promise.resolve(),
      postToSlack(
        `🎉 New enrollment (Deal Won): *${studentName}* | Parent: ${parentName || parentEmail}`,
      ),
    ]);

    return NextResponse.json({ ok: true, supportContactId, studentName });
  } catch (err: any) {
    console.error('[ghl-deal-won]', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
