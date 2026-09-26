/**
 * Tally webhook — fires when the student onboarding form (b5PvVo) is submitted.
 * Parses Tally payload, looks up GHL contact by student name, adds note, moves stage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getContactForTracking, moveOpportunityStage, STAGES, addTagToContact, upsertStudentContact, createStudentOpportunity } from '@/lib/ghl-support';

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

interface TallyField {
  key: string;
  label: string;
  type: string;
  value: unknown;
}

function getTallyAnswer(fields: TallyField[], label: string): string {
  const field = fields.find((f) => f.label.toLowerCase() === label.toLowerCase());
  if (!field) return '';
  const v = field.value;
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map((item: any) => item.text ?? '').filter(Boolean).join(', ');
  if (typeof v === 'number') return String(v);
  return String(v);
}

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fields: TallyField[] = body?.data?.fields ?? [];

    const studentName    = getTallyAnswer(fields, 'Your full name');
    const studentEmail   = getTallyAnswer(fields, 'Your email');
    const studentPhone   = getTallyAnswer(fields, 'Your phone number');
    const grade          = getTallyAnswer(fields, 'What grade are you in?');
    const currentScore   = getTallyAnswer(fields, 'What was your most recent score?');
    const targetScore    = getTallyAnswer(fields, 'What score are you going for?');
    const targetSchools  = getTallyAnswer(fields, 'Which schools are you aiming for?');
    const hardestSection = getTallyAnswer(fields, 'Which section is harder for you?');
    const hardestAreas   = getTallyAnswer(fields, 'Which of these feel hardest right now?');
    const struggles      = getTallyAnswer(fields, "Tell us more about what you're struggling with");
    const dailyTime      = getTallyAnswer(fields, 'Realistically, how much time can you put in outside sessions each day?');
    const confidence     = getTallyAnswer(fields, 'On a scale of 1 to 10, how confident are you that you\'ll hit your target score?');
    const whyNumber      = getTallyAnswer(fields, 'Why that number?');
    const concerns       = getTallyAnswer(fields, 'Any doubts or concerns about doing this program?');
    const prepBefore     = getTallyAnswer(fields, 'Have you done SAT prep before?');
    const prepDetails    = getTallyAnswer(fields, "What was that like, and what didn't work for you?");
    const whosDriving    = getTallyAnswer(fields, "Honestly — was this more your idea or your parents'?");
    const testDate       = getTallyAnswer(fields, 'Which SAT date are you taking?');
    const accommodations = getTallyAnswer(fields, 'Do you have testing accommodations?');
    const availability   = getTallyAnswer(fields, 'Which days and times work for your sessions?');
    const anythingElse   = getTallyAnswer(fields, "Anything else that'd help your tutor work with you better?");

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

    // Tag parent contact and move their opportunity
    await addTagToContact(tracking.contactId, 'parent');
    if (tracking.opportunityId) {
      await moveOpportunityStage(tracking.opportunityId, STAGES.ONBOARDING_FORM_COMPLETED);
    }

    // Create (or update) the student contact and mirror the opportunity
    const studentContactId = await upsertStudentContact(studentName, studentEmail, studentPhone, '');
    if (studentContactId) {
      await createStudentOpportunity(studentContactId, studentName, STAGES.ONBOARDING_FORM_COMPLETED);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[onboard/student]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
