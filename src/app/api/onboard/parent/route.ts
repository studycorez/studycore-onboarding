/**
 * Typeform webhook — fires when the parent onboarding form (HJ40hGh0) is submitted.
 * Parses Typeform payload, looks up GHL contact by student name, adds note, posts to Slack.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getContactForTracking } from '@/lib/ghl-support';
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

    const parentName      = getAnswer(answers, '0a3f3227-059c-4227-842e-05d294b8a9f1');
    const parentEmail     = getAnswer(answers, 'cdd6ccc2-b003-4d04-a5e7-423309999cfb');
    const parentPhone     = getAnswer(answers, '92412f51-4918-46fe-a54a-83b354c78be0');
    const checkinPref     = getAnswer(answers, '88212dda-8a0f-441f-b8f1-6b5fd6ee1e87');
    const updatePref      = getAnswer(answers, '4676edf5-370c-4e3e-a672-bd6e215d15a6');
    const bestTime        = getAnswer(answers, '46f90f67-87e2-4ca3-83ce-1c4b4d94fe86');
    const studentName     = getAnswer(answers, 'b55812e8-941d-40bf-bcfd-43601481e13a');
    const studentGrade    = getAnswer(answers, 'bb5572ab-b5b1-468a-aed2-4d94d58baf80');
    const targetScore     = getAnswer(answers, '66878a66-3d1e-4983-987a-bece18e78ce7');
    const targetSchools   = getAnswer(answers, '4333b57c-86b6-4dfd-80e6-7e2961e99dec');
    const testDate        = getAnswer(answers, '5994331f-77c3-4355-8b06-7b78f58fbaed');
    const registered      = getAnswer(answers, '33604f69-5798-45e1-8cb2-082b4f209281');
    const backupDate      = getAnswer(answers, 'eaae74b3-2858-4961-bd93-ed8956638828');
    const accommodations  = getAnswer(answers, 'dc006e0a-5197-4b46-86ea-1cc4b9a2d2e6');
    const accommodationDetail = getAnswer(answers, 'd30684f2-aada-4b4d-87f9-a7bd581c8811');
    const whyStudyCore    = getAnswer(answers, '8ae4b437-c342-4229-841b-dc6c82eedeca');
    const confidence      = getAnswer(answers, 'aaa83e53-9ca1-4b99-a7ee-38636d17145e');
    const confidenceWhy   = getAnswer(answers, '89214949-c709-4a45-ad94-3eabe5c94062');
    const concerns        = getAnswer(answers, '7aee6cc4-9424-4fca-b3b2-6c2bd905bd5f');
    const prepBefore      = getAnswer(answers, '65399f17-2177-434f-bd6d-8cd69b2344fc');
    const prepDetails     = getAnswer(answers, 'e7b0db0a-1239-41e3-9ac5-7c026fd15863');
    const whosDriving     = getAnswer(answers, 'a198ac8b-3956-40fd-bd7f-761e8c7e9b79');
    const anythingElse    = getAnswer(answers, 'd83c9fa7-a661-4985-81d8-8612fab20070');

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
    }

    await postToSlack(
      `📋 Parent Onboarding Form: *${parentName}* → Student: *${studentName}*\n` +
      `Confidence: ${confidence}/10 | Test Date: ${testDate || 'Not set'} | Check-in pref: ${checkinPref || '—'}\n` +
      (concerns ? `Concerns: ${concerns}\n` : '') +
      (!tracking?.contactId ? '⚠️ Could not find GHL contact — note not saved' : '')
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[onboard/parent]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
