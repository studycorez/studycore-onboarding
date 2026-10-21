import { NextRequest, NextResponse } from 'next/server';
import { createSupportTask, setTutorAssigned } from '@/lib/ghl-support';
import { sendMatchConfirmationToParent, sendMatchConfirmationToTutor } from '@/lib/email';
import { postToSlack } from '@/lib/slack';
import { createSigningContract } from '@/lib/signing-contracts';
import { Resend } from 'resend';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

async function sendTutorStudentContract({
  tutorName, tutorEmail, studentName, availability, sessionsPerWeek, firstSession,
}: {
  tutorName: string; tutorEmail: string; studentName: string;
  availability?: string; sessionsPerWeek?: string; firstSession?: string;
}) {
  const effectiveDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const token = await createSigningContract({
    type: 'tutor-student',
    recipientName: tutorName,
    recipientEmail: tutorEmail,
    contractData: {
      tutorName,
      studentName,
      effectiveDate,
      sessionDaysTimes: availability || '',
      sessionsPerWeek: sessionsPerWeek || '',
      startDate: firstSession || '',
    },
  });

  const signingUrl = `${APP_URL}/signing-contracts/${token}`;
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'noreply@studycore.net',
    to: tutorEmail,
    subject: `Action Required: Sign Your Student Assignment Agreement — ${studentName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111;">
        <div style="background: #0f172a; padding: 24px 32px; border-radius: 8px 8px 0 0;">
          <p style="color: #fff; font-size: 20px; font-weight: bold; margin: 0;">StudyCore LLC</p>
        </div>
        <div style="padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px;">Hi ${tutorName},</p>
          <p>You have been matched with <strong>${studentName}</strong>. Before sessions begin, please review and sign the Tutor-Student Assignment Agreement.</p>
          <p><strong>Please read Section 3 (Early Departure Consequences) carefully before signing.</strong></p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${signingUrl}" style="background: #0f172a; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: bold;">
              Review &amp; Sign Assignment Agreement
            </a>
          </div>
          <p style="font-size: 13px; color: #666;">Questions? <a href="mailto:support@studycore.net">support@studycore.net</a></p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #999; margin: 0;">StudyCore LLC · San Ramon, California · studycore.net</p>
        </div>
      </div>
    `,
  });
}

async function sendTutorGameplanEmail({
  tutorName, tutorEmail, studentName, tutorPlanPdfB64,
}: {
  tutorName: string; tutorEmail: string; studentName: string; tutorPlanPdfB64: string;
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'noreply@studycore.net',
    to: tutorEmail,
    subject: `Gameplan attached — ${studentName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111;">
        <div style="background: #0f172a; padding: 24px 32px; border-radius: 8px 8px 0 0;">
          <p style="color: #fff; font-size: 20px; font-weight: bold; margin: 0;">StudyCore LLC</p>
        </div>
        <div style="padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px;">Hi ${tutorName},</p>
          <p>The gameplan for <strong>${studentName}</strong> is attached to this email. Review it before the first session and reach out with any questions.</p>
          <p style="font-size: 13px; color: #666;">Questions? <a href="mailto:support@studycore.net">support@studycore.net</a></p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: `${studentName}_Tutor_Gameplan.pdf`,
        content: Buffer.from(tutorPlanPdfB64, 'base64'),
      },
    ],
  });
}

async function sendParentStudentPlanEmail({
  parentName, parentEmail, studentName, tutorName, studentPlanPdfB64,
}: {
  parentName: string; parentEmail: string; studentName: string; tutorName: string; studentPlanPdfB64: string;
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'noreply@studycore.net',
    to: parentEmail,
    reply_to: 'support@studycore.net',
    subject: `${studentName}'s SAT Program Plan — StudyCore`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111;">
        <div style="background: #0f172a; padding: 24px 32px; border-radius: 8px 8px 0 0;">
          <p style="color: #fff; font-size: 20px; font-weight: bold; margin: 0;">StudyCore LLC</p>
        </div>
        <div style="padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px;">Hi ${parentName},</p>
          <p>We've attached <strong>${studentName}</strong>'s personalized SAT program plan. It outlines the topic sequence, session structure, and checkpoints for the program with <strong>${tutorName}</strong>.</p>
          <p>Take a look and feel free to reply with any questions.</p>
          <p style="font-size: 13px; color: #666;">Questions? <a href="mailto:support@studycore.net">support@studycore.net</a></p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: `${studentName}_Student_Plan.pdf`,
        content: Buffer.from(studentPlanPdfB64, 'base64'),
      },
    ],
  });
}

export async function POST(req: NextRequest) {
  try {
    const { opportunityId, contactId, studentName, studentEmail, parentEmail, parentName,
            currentScore, targetScore, availability, sessionsPerWeek,
            tutorName, tutorEmail, zoomUrl, firstSession, gameplanUrl, notes,
            tutorPlanPdfB64, studentPlanPdfB64 } = await req.json();

    if (!opportunityId || !contactId || !tutorName || !tutorEmail || !parentEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Auto-send tutor-student assignment contract
    const contractSend = sendTutorStudentContract({
      tutorName, tutorEmail, studentName, availability, sessionsPerWeek, firstSession,
    }).catch(err => console.error('[confirm-match] contract send error:', err));

    // Send gameplan PDFs if provided
    const tutorGameplanSend = tutorPlanPdfB64
      ? sendTutorGameplanEmail({ tutorName, tutorEmail, studentName, tutorPlanPdfB64 })
          .catch(err => console.error('[confirm-match] tutor gameplan email error:', err))
      : Promise.resolve();

    const parentPlanSend = studentPlanPdfB64 && parentEmail
      ? sendParentStudentPlanEmail({ parentName, parentEmail, studentName, tutorName, studentPlanPdfB64 })
          .catch(err => console.error('[confirm-match] parent plan email error:', err))
      : Promise.resolve();

    await Promise.allSettled([
      setTutorAssigned(contactId, tutorName),
      createSupportTask(contactId, `Schedule first session: ${studentName} ↔ ${tutorName}`, 24),
      sendMatchConfirmationToParent({
        parentName, parentEmail, studentName, tutorName,
        zoomUrl, firstSession, sessionFreq: sessionsPerWeek,
      }),
      sendMatchConfirmationToTutor({
        tutorName, tutorEmail, studentName,
        currentScore, targetScore, availability,
        sessionFreq: sessionsPerWeek, gameplanUrl, zoomUrl, firstSession, notes,
      }),
      postToSlack(`✅ Match confirmed: *${studentName}* → *${tutorName}* | ${sessionsPerWeek || '?'}/week${tutorPlanPdfB64 ? ' · gameplans sent' : ''}`),
      contractSend,
      tutorGameplanSend,
      parentPlanSend,
    ]);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[confirm-match]', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
