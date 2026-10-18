import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GHL_BASE         = 'https://services.leadconnectorhq.com';
const LOCATION_ID      = 'T4M5UHtoDZkcVAK31IFA';
const REMINDER_MESSAGE = (firstName: string) =>
  `Hey ${firstName}, this is a reminder from StudyCore — please make sure to submit your daily forms. Reply if you need help.`;

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_SUPPORT_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

async function findContactByPhone(phone: string): Promise<{ id: string; firstName: string; email: string } | null> {
  try {
    const res = await fetch(
      `${GHL_BASE}/contacts/?locationId=${LOCATION_ID}&query=${encodeURIComponent(phone)}&limit=5`,
      { headers: ghlHeaders() },
    );
    if (!res.ok) return null;
    const contacts: any[] = (await res.json())?.contacts ?? [];
    if (!contacts.length) return null;
    const c = contacts[0];
    return { id: c.id, firstName: c.firstName ?? '', email: c.email ?? '' };
  } catch (err) {
    console.error('[tqc-remind] findContactByPhone error:', err);
    return null;
  }
}

async function sendSms(contactId: string, message: string): Promise<void> {
  try {
    const res = await fetch(`${GHL_BASE}/conversations/messages`, {
      method: 'POST',
      headers: ghlHeaders(),
      body: JSON.stringify({ type: 'SMS', contactId, locationId: LOCATION_ID, message }),
    });
    if (!res.ok) console.error('[tqc-remind] sendSms failed:', await res.text());
  } catch (err) {
    console.error('[tqc-remind] sendSms error:', err);
  }
}

async function sendEmail(contactId: string, email: string, firstName: string): Promise<void> {
  try {
    const res = await fetch(`${GHL_BASE}/conversations/messages`, {
      method: 'POST',
      headers: ghlHeaders(),
      body: JSON.stringify({
        type: 'Email',
        contactId,
        locationId: LOCATION_ID,
        emailTo: email,
        subject: 'StudyCore — Daily Form Reminder',
        html: `<p>Hey ${firstName},</p><p>This is a reminder from StudyCore — please make sure to submit your daily forms (Start of Day and End of Day logs).</p><p>Reply to this email if you need help.</p><p>– StudyCore Team</p>`,
      }),
    });
    if (!res.ok) console.error('[tqc-remind] sendEmail failed:', await res.text());
  } catch (err) {
    console.error('[tqc-remind] sendEmail error:', err);
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tutorName, tutorPhone, tutorEmail, reminderType } = body ?? {};

  if (!tutorPhone && !tutorEmail) {
    return NextResponse.json({ error: 'tutorPhone or tutorEmail required' }, { status: 400 });
  }

  const contact = tutorPhone ? await findContactByPhone(tutorPhone) : null;
  const contactId = contact?.id ?? null;
  const firstName = contact?.firstName || (tutorName ?? '').split(' ')[0] || 'there';
  const emailToUse = contact?.email || tutorEmail || '';

  if (contactId && (reminderType === 'sms' || reminderType === 'both')) {
    await sendSms(contactId, REMINDER_MESSAGE(firstName));
  }

  if (contactId && emailToUse && (reminderType === 'email' || reminderType === 'both')) {
    await sendEmail(contactId, emailToUse, firstName);
  }

  return NextResponse.json({ ok: true });
}
