/**
 * Tally webhook — fires when the student onboarding form (b5PvVo) is submitted.
 * Parses Tally payload, looks up GHL contact by student name, adds note, moves stage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getContactForTracking, moveOpportunityStage, STAGES, addTagToContact } from '@/lib/ghl-support';
import { broadcastToTutors } from '@/lib/tutor-broadcast';

const GHL_SUPPORT_BASE   = 'https://services.leadconnectorhq.com';
const SUPPORT_LOCATION_ID = 'T4M5UHtoDZkcVAK31IFA';

const CF = {
  STUDENT_NAME:  'SVWWOw5yr7q7POnmp3eY',
  STUDENT_EMAIL: 'BFQ9zkYahPjB5IceaP4f',
  CURRENT_SCORE: '2rY0PdPWokY0S4dEFGiX',
  TARGET_SCORE:  'lTC9zj3Uh2lhOLSKf0GI',
  AVAILABILITY:  'nHsEh70Hs2ClIkFNHAQS',
  START_DATE:    'GCoTG1MOp7eerdcCfgm4',
};

type LookupResult = { contactId: string; opportunityId: string | null };

// Lookup 1: find by parent email (e.g. when student email = parent email)
async function findByEmail(email: string): Promise<LookupResult | null> {
  try {
    const res = await fetch(
      `${GHL_SUPPORT_BASE}/contacts/search/duplicate?locationId=${SUPPORT_LOCATION_ID}&email=${encodeURIComponent(email)}`,
      { headers: ghlHeaders() },
    );
    if (!res.ok) return null;
    const contactId = (await res.json())?.contact?.id;
    if (!contactId) return null;
    const oppRes = await fetch(
      `${GHL_SUPPORT_BASE}/opportunities/search?location_id=${SUPPORT_LOCATION_ID}&contact_id=${contactId}&limit=1`,
      { headers: ghlHeaders() },
    );
    const opportunityId = (oppRes.ok ? (await oppRes.json()) : {})?.opportunities?.[0]?.id ?? null;
    return { contactId, opportunityId };
  } catch { return null; }
}

// Lookup 2: full-text search contacts by query (matches name, email, phone, and indexed custom fields).
// Used to find the parent contact when only the student email is known — GHL may match the
// STUDENT_EMAIL custom field if it was set by the deal-won webhook.
async function findByTextSearch(query: string): Promise<LookupResult | null> {
  try {
    const res = await fetch(
      `${GHL_SUPPORT_BASE}/contacts/search?locationId=${SUPPORT_LOCATION_ID}&q=${encodeURIComponent(query)}&limit=5`,
      { headers: ghlHeaders() },
    );
    if (!res.ok) return null;
    const { contacts = [] } = await res.json();
    if (!contacts.length) return null;
    const contactId: string = contacts[0].id;
    const oppRes = await fetch(
      `${GHL_SUPPORT_BASE}/opportunities/search?location_id=${SUPPORT_LOCATION_ID}&contact_id=${contactId}&limit=1`,
      { headers: ghlHeaders() },
    );
    const opportunityId = (oppRes.ok ? (await oppRes.json()) : {})?.opportunities?.[0]?.id ?? null;
    return { contactId, opportunityId };
  } catch { return null; }
}

// Update the GHL contact with all available student data from the onboarding form.
// This is the authoritative write — Sales GHL CFs are unreliable, so the student
// form submission is the canonical source for scores, availability, and email.
async function updateStudentFields(contactId: string, fields: {
  studentName:  string;
  studentEmail: string;
  currentScore: string;
  targetScore:  string;
  availability: string;
  testDate:     string;
}): Promise<void> {
  try {
    const customFields = [
      { id: CF.STUDENT_NAME,  field_value: fields.studentName },
      ...(fields.studentEmail ? [{ id: CF.STUDENT_EMAIL, field_value: fields.studentEmail }] : []),
      ...(fields.currentScore ? [{ id: CF.CURRENT_SCORE, field_value: fields.currentScore }] : []),
      ...(fields.targetScore  ? [{ id: CF.TARGET_SCORE,  field_value: fields.targetScore  }] : []),
      ...(fields.availability ? [{ id: CF.AVAILABILITY,  field_value: fields.availability }] : []),
      ...(fields.testDate     ? [{ id: CF.START_DATE,    field_value: fields.testDate     }] : []),
    ];
    await fetch(`${GHL_SUPPORT_BASE}/contacts/${contactId}`, {
      method: 'PUT',
      headers: ghlHeaders(),
      body: JSON.stringify({ customFields }),
    });
  } catch { /* non-blocking */ }
}

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

    // Lookup order:
    // 1. GHL opportunity text search by student name (works when opp is named after student)
    // 2. Exact email match (works when student enrolled themselves, i.e. student = parent)
    // 3. Full-text contact search by student email (works when deal-won set STUDENT_EMAIL CF)
    // 4. Full-text contact search by student name (last resort)
    let tracking = await getContactForTracking(studentName);
    if (!tracking?.contactId && studentEmail) {
      const r = await findByEmail(studentEmail);
      if (r) tracking = { ...r, currentStageId: '', hoursPurchased: 0, hoursCompleted: 0, hoursRemaining: 0, sessionsCompleted: 0 };
    }
    if (!tracking?.contactId && studentEmail) {
      const r = await findByTextSearch(studentEmail);
      if (r) tracking = { ...r, currentStageId: '', hoursPurchased: 0, hoursCompleted: 0, hoursRemaining: 0, sessionsCompleted: 0 };
    }
    if (!tracking?.contactId) {
      const r = await findByTextSearch(studentName);
      if (r) tracking = { ...r, currentStageId: '', hoursPurchased: 0, hoursCompleted: 0, hoursRemaining: 0, sessionsCompleted: 0 };
    }
    if (!tracking?.contactId) return NextResponse.json({ ok: true });

    // Write all student data to GHL custom fields — this is the authoritative source.
    // Sales GHL custom fields are unreliable (often empty), so the student form is the
    // canonical write for current score, target score, availability, and student email.
    await updateStudentFields(tracking.contactId, {
      studentName,
      studentEmail,
      currentScore,
      targetScore,
      availability,
      testDate,
    });

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

    // Broadcast to all active tutors via GHL inbound webhook.
    // The webhook payload includes student email/phone/name so GHL creates the
    // student contact and places them in the pipeline (Onboarding Form Completed).
    await broadcastToTutors({
      studentName:   studentName,
      studentEmail:  studentEmail  || '',
      studentPhone:  studentPhone  || '',
      availability:  availability  || '—',
      hoursPerWeek:  '',
      totalHours:    '',
      startDate:     '',
      testDate:      testDate      || '—',
      currentScore:  currentScore  || '—',
      targetScore:   targetScore   || '—',
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[onboard/student]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
