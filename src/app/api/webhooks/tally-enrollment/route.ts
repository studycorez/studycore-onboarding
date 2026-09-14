import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { upsertSupportContact, createEnrollmentOpportunity, createSupportTask, type EnrollmentData } from '@/lib/ghl-support';
import { sendOnboardingEmail } from '@/lib/email';
import { postToSlack } from '@/lib/slack';

function field(fields: any[], label: string): string {
  const f = fields.find((f: any) => f.label === label);
  if (!f || f.value === null || f.value === undefined) return '';
  if (Array.isArray(f.value)) return f.value.join(', ');
  return String(f.value);
}

function diagnosticCompleteUrl(studentEmail: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://onboarding.studycore.net';
  const secret = process.env.WEBHOOK_SECRET ?? 'studycore-2026-onboard';
  const sig = createHmac('sha256', secret).update(studentEmail.toLowerCase()).digest('hex').slice(0, 16);
  return `${appUrl}/api/webhooks/diagnostic-complete?email=${encodeURIComponent(studentEmail)}&sig=${sig}`;
}

function onboardUrl(type: 'parent' | 'student', email: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://studycore-onboarding.vercel.app';
  const secret = process.env.WEBHOOK_SECRET ?? 'studycore-2026-onboard';
  const sig = createHmac('sha256', secret).update(email.toLowerCase()).digest('hex').slice(0, 16);
  return `${appUrl}/onboard/${type}?email=${encodeURIComponent(email)}&sig=${sig}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fields: any[] = body?.data?.fields ?? [];

    const data: EnrollmentData = {
      studentName:       field(fields, 'Student Full Name'),
      studentEmail:      field(fields, 'Student Email'),
      studentPhone:      field(fields, 'Student Phone'),
      grade:             field(fields, 'Grade'),
      currentScore:      field(fields, 'Current SAT Score (Optional)'),
      targetScore:       field(fields, 'Target SAT Score'),
      parentName:        field(fields, 'Parent Full Name'),
      parentEmail:       field(fields, 'Parent Email'),
      parentPhone:       field(fields, 'Parent Phone'),
      packageHours:      field(fields, 'Package Sold (Number of Hours)'),
      sessionFrequency:  field(fields, 'Session Frequency'),
      preferredDays:     field(fields, 'Preferred Session Days (Optional)'),
      preferredTime:     field(fields, 'Preferred Session Time (Optional)'),
      targetStartDate:   field(fields, 'Target Start Date (Optional)'),
      hasGuarantee:      field(fields, 'Guarantee Offered?'),
      gameplanUrl:       field(fields, 'Upload the Gameplan Document (not presentation) here'),
      notes:             field(fields, 'Notes from Call'),
      setterName:        field(fields, 'Setter Name'),
      closerName:        field(fields, 'Closer Name'),
    };

    if (!data.parentEmail || !data.studentName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const contactId = await upsertSupportContact(data);

    await Promise.allSettled([
      contactId ? createEnrollmentOpportunity(contactId, data.studentName) : Promise.resolve(null),
      contactId ? createSupportTask(contactId, `Awaiting diagnostic: ${data.studentName} | Start: ${data.targetStartDate || 'TBD'} | Freq: ${data.sessionFrequency || 'TBD'}`, 48) : Promise.resolve(),
      sendOnboardingEmail({
        parentName: data.parentName,
        parentEmail: data.parentEmail,
        studentName: data.studentName,
        currentScore: data.currentScore,
        targetScore: data.targetScore,
        packageHours: data.packageHours,
        sessionFrequency: data.sessionFrequency,
        preferredDays: data.preferredDays,
        preferredTime: data.preferredTime,
        targetStartDate: data.targetStartDate,
        gameplanUrl: data.gameplanUrl,
        diagnosticCompleteUrl: diagnosticCompleteUrl(data.parentEmail),
        parentFormUrl: onboardUrl('parent', data.parentEmail),
        studentFormUrl: onboardUrl('student', data.studentEmail),
      }),
      postToSlack(`🎉 New enrollment: *${data.studentName}* | ${data.packageHours || '?'}hrs | Closer: ${data.closerName || '?'} | Start: ${data.targetStartDate || 'TBD'}`),
    ]);

    return NextResponse.json({ ok: true, contactId });
  } catch (err: any) {
    console.error('[tally-enrollment]', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
