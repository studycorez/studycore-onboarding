/**
 * Typeform webhook — fires when the student onboarding form (dGHWF2d6) is submitted.
 * Parses Typeform payload, looks up GHL contact by student name, adds note, moves stage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getContactForTracking, moveOpportunityStage, STAGES } from '@/lib/ghl-support';

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

function getAnswer(answers: any[], ref: string): string {
  const a = answers.find((a: any) => a.field?.ref === ref);
  if (!a) return '';
  if (a.type === 'text' || a.type === 'short_text' || a.type === 'long_text') return a.text ?? '';
  if (a.type === 'email') return a.email ?? '';
  if (a.type === 'number' || a.type === 'opinion_scale') return String(a.number ?? '');
  if (a.type === 'choice') return a.choice?.label ?? '';
  if (a.type === 'choices') return (a.choices?.labels ?? []).join(', ');
  if (a.type === 'boolean') return a.boolean ? 'Yes' : 'No';
  if (a.type === 'date') return a.date ?? '';
  if (a.type === 'phone_number') return a.phone_number ?? '';
  return '';
}

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const formResponse = body?.form_response ?? body;
    const answers: any[] = formResponse?.answers ?? [];

    const studentName    = getAnswer(answers, 'fd749c8e-2800-4966-83e1-58ae4335dc8d');
    const grade          = getAnswer(answers, 'ff1e0244-45be-4aac-a6c2-14dcd8776c7c');
    const currentScore   = getAnswer(answers, 'ada02fb8-b5d4-4200-b78e-a11795efb786');
    const targetScore    = getAnswer(answers, '5bba1e07-c0f8-48af-86ed-44033817303f');
    const targetSchools  = getAnswer(answers, 'd52cf7b8-c407-47df-8710-be8ed54e03d6');
    const hardestSection = getAnswer(answers, '86ac0485-d960-4cec-8f4f-e63e8eeb94bb');
    const hardestAreas   = getAnswer(answers, '7b018014-bdf7-49cf-9681-042cd17f6c6f');
    const struggles      = getAnswer(answers, '3645821a-995b-486c-8311-32cd7c7e096b');
    const dailyTime      = getAnswer(answers, '56ef9484-e973-4498-9606-ac0b7f7a245f');
    const confidence     = getAnswer(answers, '6f67de48-6f3b-4896-b6ed-bcb3f4e28225');
    const whyNumber      = getAnswer(answers, 'b31d0b49-9960-47a1-bc71-71688ca060e8');
    const concerns       = getAnswer(answers, '4d6cee6e-497e-4e90-8268-67c0b656c7fa');
    const prepBefore     = getAnswer(answers, 'c89d6989-8ee8-4073-8cfb-efe656ef7617');
    const prepDetails    = getAnswer(answers, '04d2b4a0-0306-414d-b50a-b21345ca4054');
    const whosDriving    = getAnswer(answers, '93f70444-1de5-434f-8f52-0eb12e6a3e13');
    const testDate       = getAnswer(answers, '1c789486-95ec-4dbc-b11c-ccb311386669');
    const accommodations = getAnswer(answers, '607113f1-bd40-411a-ba17-904ed6bfcc64');
    const availability   = getAnswer(answers, '693114cf-742a-4c24-b424-1daee1763d61');
    const anythingElse   = getAnswer(answers, '4a6f7b55-f901-49a4-b098-5e4fd7325ed4');

    if (!studentName) return NextResponse.json({ ok: true });

    const tracking = await getContactForTracking(studentName);
    if (!tracking?.contactId) return NextResponse.json({ ok: true });

    const noteBody = `
STUDENT ONBOARDING FORM — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

Student: ${studentName}
Grade: ${grade || '—'}
Current Score: ${currentScore || '—'}
Target Score: ${targetScore || '—'}
Goal Schools: ${targetSchools || '—'}
Hardest Section: ${hardestSection || '—'}
Hardest Areas: ${hardestAreas || '—'}
Current Struggles: ${struggles || '—'}
Daily Time Available: ${dailyTime || '—'}
Confidence (1-10): ${confidence || '—'}
Why That Number: ${whyNumber || '—'}
Concerns/Doubts: ${concerns || '—'}
Prep Before: ${prepBefore || '—'}
Prep Details: ${prepDetails || '—'}
Who's Driving: ${whosDriving || '—'}
Test Date: ${testDate || '—'}
Accommodations: ${accommodations || '—'}
Availability: ${availability || '—'}
Anything Else: ${anythingElse || '—'}
    `.trim();

    await addGHLNote(tracking.contactId, noteBody);

    if (tracking.opportunityId) {
      await moveOpportunityStage(tracking.opportunityId, STAGES.ONBOARDING_FORM_COMPLETED);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[onboard/student]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
