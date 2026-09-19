import { NextRequest, NextResponse } from 'next/server';
import { findSupportContact, moveOpportunityStage, STAGES } from '@/lib/ghl-support';

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
    const { parentEmail, studentName, ...fields } = data;

    if (!parentEmail) return NextResponse.json({ error: 'parentEmail required' }, { status: 400 });

    const contact = await findSupportContact(parentEmail);

    const noteBody = `
STUDENT ONBOARDING FORM — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

Student: ${studentName}
Grade: ${fields.grade || '—'}
Current Score: ${fields.currentScore || '—'}
Target Score: ${fields.targetScore || '—'}
Goal Schools: ${fields.targetSchools || '—'}
Hardest Section: ${fields.hardestSection || '—'}
Hardest Areas: ${fields.hardestAreas || '—'}
Current Struggles: ${fields.currentStruggles || '—'}
What made them sign up: ${fields.whyChoseProgram || '—'}
Confidence (1-10): ${fields.confidence || '—'}
Concerns/Doubts: ${fields.concerns || '—'}
Availability: ${fields.availability || '—'}
Past Experiences: ${fields.pastExperiences || '—'}
Who's Driving: ${fields.whosDriving || '—'}
Test Date: ${fields.testDate || '—'}
Accommodations: ${fields.accommodations || '—'}
    `.trim();

    if (contact?.contactId) {
      await addGHLNote(contact.contactId, noteBody);
      if (contact.opportunityId) {
        await moveOpportunityStage(contact.opportunityId, STAGES.ONBOARDING_FORM_COMPLETED);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[onboard/student]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
