/**
 * Tally webhook — fires when the parent onboarding form (LZlkZ1) is submitted.
 * Parses Tally payload, looks up GHL contact by student name, adds note, posts to Slack.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getContactForTracking, addTagToContact, upsertStudentContact } from '@/lib/ghl-support';

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

    const parentName          = getTallyAnswer(fields, 'Your full name');
    const parentEmail         = getTallyAnswer(fields, 'Your email');
    const parentPhone         = getTallyAnswer(fields, 'Your phone number');
    const checkinPref         = getTallyAnswer(fields, 'Best way to reach you for check-in calls');
    const updatePref          = getTallyAnswer(fields, 'Best way to reach you for brief updates');
    const bestTime            = getTallyAnswer(fields, 'Best time of day to reach you');
    const studentName         = getTallyAnswer(fields, "Your student's full name");
    const studentGrade        = getTallyAnswer(fields, "Your student's current grade");
    const targetScore         = getTallyAnswer(fields, 'What score are you hoping they reach?');
    const targetSchools       = getTallyAnswer(fields, 'Which schools are they targeting?');
    const testDate            = getTallyAnswer(fields, 'Which SAT date are you aiming for?');
    const registered          = getTallyAnswer(fields, 'Have you registered for that date yet?');
    const backupDate          = getTallyAnswer(fields, 'We recommend registering for the test date before your target date. Which backup date are you considering?');
    const accommodations      = getTallyAnswer(fields, 'Does your student have any testing accommodations?');
    const accommodationDetail = getTallyAnswer(fields, 'Please describe them');
    const whyStudyCore        = getTallyAnswer(fields, 'What made you decide to go with StudyCore?');
    const confidence          = getTallyAnswer(fields, 'On a scale of 1 to 10, how confident are you that your student will hit their target score?');
    const confidenceWhy       = getTallyAnswer(fields, "What's driving that number?");
    const concerns            = getTallyAnswer(fields, 'Do you have any remaining concerns or doubts about the program?');
    const prepBefore          = getTallyAnswer(fields, 'Has your student worked with a tutor or prep program before?');
    const prepDetails         = getTallyAnswer(fields, 'What was that like?');
    const whosDriving         = getTallyAnswer(fields, 'Who was more driving this decision — you or your student?');
    const anythingElse        = getTallyAnswer(fields, 'Anything else we should know about your student?');

    if (!studentName) return NextResponse.json({ ok: true });

    const tracking = await getContactForTracking(studentName);

    const noteBody = `
PARENT ONBOARDING FORM — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

Parent: ${parentName}
Parent Email: ${parentEmail || '—'}
Parent Phone: ${parentPhone || '—'}
Check-in Preference: ${checkinPref || '—'}
Update Preference: ${updatePref || '—'}
Best Time to Reach: ${bestTime || '—'}
Student: ${studentName}
Student Grade: ${studentGrade || '—'}
Target Score: ${targetScore || '—'}
Target Schools: ${targetSchools || '—'}
Test Date: ${testDate || '—'}
Registered for Test: ${registered || '—'}
Backup Test Date: ${backupDate || '—'}
Accommodations: ${accommodations || '—'}
Accommodation Details: ${accommodationDetail || '—'}
Why StudyCore: ${whyStudyCore || '—'}
Confidence (1-10): ${confidence || '—'}
Why That Number: ${confidenceWhy || '—'}
Concerns/Doubts: ${concerns || '—'}
Prep Before: ${prepBefore || '—'}
Prep Details: ${prepDetails || '—'}
Who's Driving: ${whosDriving || '—'}
Anything Else: ${anythingElse || '—'}
    `.trim();

    if (tracking?.contactId) {
      await addGHLNote(tracking.contactId, noteBody);
      // Tag parent contact
      await addTagToContact(tracking.contactId, 'parent');
    }

    // Update parent name on the student contact
    await upsertStudentContact(studentName, '', '', parentName);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[onboard/parent]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
