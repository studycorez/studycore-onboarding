import { NextRequest, NextResponse } from 'next/server';
import { findSupportContact } from '@/lib/ghl-support';
import { postToSlack } from '@/lib/slack';

const GHL_BASE = 'https://services.leadconnectorhq.com';

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_SUPPORT_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

async function addGHLNote(contactId: string, body: string): Promise<void> {
  await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify({ body, userId: contactId }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { parentEmail, parentName, studentName, ...fields } = data;

    if (!parentEmail) return NextResponse.json({ error: 'parentEmail required' }, { status: 400 });

    const contact = await findSupportContact(parentEmail);

    const noteBody = `
PARENT ONBOARDING FORM — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

Parent: ${parentName}
Goal Score: ${fields.goalScore || '—'}
Target Schools: ${fields.targetSchools || '—'}
What made them sign up: ${fields.whyChoseProgram || '—'}
Confidence (1-10): ${fields.confidence || '—'}
Concerns/Doubts: ${fields.concerns || '—'}
Availability: ${fields.availability || '—'}
Past Tutoring Experiences: ${fields.pastExperiences || '—'}
Who's Driving: ${fields.whosDriving || '—'}
Test Date: ${fields.testDate || '—'}
Accommodations: ${fields.accommodations || '—'}
Preferred Contact Method: ${fields.preferredContact || '—'}
    `.trim();

    if (contact?.contactId) {
      await addGHLNote(contact.contactId, noteBody);
    }

    await postToSlack(
      `🚨 *Parent Onboarding Form Submitted*\n` +
      `*Family:* ${parentName} → ${studentName}\n` +
      `*Confidence:* ${fields.confidence}/10\n` +
      `*Test Date:* ${fields.testDate || 'Not set'}\n` +
      `*Concerns:* ${fields.concerns || 'None stated'}\n` +
      `*Preferred Contact:* ${fields.preferredContact || '—'}\n` +
      `*Availability:* ${fields.availability || '—'}\n` +
      `📞 *Call them now if available. Booked call fallback in calendar.*`
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[onboard/parent]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
