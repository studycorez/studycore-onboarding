import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSigningContract, type ContractType } from '@/lib/signing-contracts';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      type: ContractType;
      recipientName: string;
      recipientEmail: string;
      contractData?: Record<string, unknown>;
    };
    const { type, recipientName, recipientEmail, contractData = {} } = body;

    if (!type || !recipientName || !recipientEmail) {
      return NextResponse.json({ error: 'Missing type, recipientName, or recipientEmail' }, { status: 400 });
    }
    if (!['tutor', 'tutor-student', 'student'].includes(type)) {
      return NextResponse.json({ error: 'type must be tutor, tutor-student, or student' }, { status: 400 });
    }

    const token = await createSigningContract({ type, recipientName, recipientEmail, contractData });
    const signingUrl = `${APP_URL}/signing-contracts/${token}`;

    let subject: string;
    let html: string;

    if (type === 'student') {
      subject = 'Action Required: Sign Your StudyCore Services Agreement';
      html = buildStudentEmail({ recipientName, signingUrl });
    } else if (type === 'tutor-student') {
      subject = `Action Required: Sign Your Student Assignment Agreement — ${(contractData.studentName as string) || 'New Student'}`;
      html = buildTutorStudentEmail({ recipientName, studentName: (contractData.studentName as string) || '', signingUrl });
    } else {
      subject = 'Action Required: Sign Your StudyCore Tutor Agreement';
      html = buildTutorEmail({ recipientName, signingUrl });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'noreply@studycore.net',
      to: recipientEmail,
      subject,
      html,
    });

    return NextResponse.json({ success: true, token });
  } catch (err: any) {
    console.error('[signing-contracts/send]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function buildTutorEmail({ recipientName, signingUrl }: { recipientName: string; signingUrl: string }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111;">
      <div style="background: #0f172a; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <p style="color: #fff; font-size: 20px; font-weight: bold; margin: 0;">StudyCore LLC</p>
      </div>
      <div style="padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px;">Hi ${recipientName},</p>
        <p>Welcome to StudyCore! Before you begin tutoring, please review and sign your Tutor Services Agreement.</p>
        <p>This agreement covers your role as an independent contractor, compensation, session expectations, and our student commitment policy.</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${signingUrl}" style="background: #0f172a; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: bold;">
            Review &amp; Sign Agreement
          </a>
        </div>
        <p style="font-size: 13px; color: #666;">Questions? <a href="mailto:support@studycore.net">support@studycore.net</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999; margin: 0;">StudyCore LLC · San Ramon, California · studycore.net</p>
      </div>
    </div>
  `;
}

function buildTutorStudentEmail({ recipientName, studentName, signingUrl }: { recipientName: string; studentName: string; signingUrl: string }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111;">
      <div style="background: #0f172a; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <p style="color: #fff; font-size: 20px; font-weight: bold; margin: 0;">StudyCore LLC</p>
      </div>
      <div style="padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px;">Hi ${recipientName},</p>
        <p>You have been assigned to work with <strong>${studentName || 'a new student'}</strong>. Before sessions begin, please review and sign the Tutor-Student Assignment Agreement.</p>
        <p>This agreement covers your commitment to see this student through the full program, session schedule, and consequences for early departure. <strong>Please read Section 3 (Early Departure Consequences) carefully before signing.</strong></p>
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
  `;
}

function buildStudentEmail({ recipientName, signingUrl }: { recipientName: string; signingUrl: string }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111;">
      <div style="background: #0f172a; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <p style="color: #fff; font-size: 20px; font-weight: bold; margin: 0;">StudyCore LLC</p>
      </div>
      <div style="padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px;">Hi ${recipientName},</p>
        <p>Please review and sign the SAT Tutoring Services Agreement to officially begin the program.</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${signingUrl}" style="background: #0f172a; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: bold;">
            Review &amp; Sign Agreement
          </a>
        </div>
        <p style="font-size: 13px; color: #666;">Questions? <a href="mailto:support@studycore.net">support@studycore.net</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999; margin: 0;">StudyCore LLC · San Ramon, California · studycore.net</p>
      </div>
    </div>
  `;
}
