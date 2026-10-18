import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getSigningContractByToken, markSigningContractSigned } from '@/lib/signing-contracts';

export const dynamic = 'force-dynamic';

// GET /api/signing-contracts/sign?token=xxx — fetch contract data for rendering
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    const contract = await getSigningContractByToken(token);
    if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });

    if (contract.status === 'signed') {
      return NextResponse.json({ alreadySigned: true, signedAt: contract.signed_at, signedName: contract.signed_name });
    }

    return NextResponse.json({
      type: contract.type,
      recipientName: contract.recipient_name,
      contractData: contract.contract_data,
    });
  } catch (err: any) {
    console.error('[signing-contracts/sign GET]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/signing-contracts/sign — process signature, generate PDF, email to StudyCore
export async function POST(req: NextRequest) {
  try {
    const { token, signedName } = await req.json() as { token: string; signedName: string };
    if (!token || !signedName?.trim()) {
      return NextResponse.json({ error: 'Missing token or signedName' }, { status: 400 });
    }

    const contract = await getSigningContractByToken(token);
    if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    if (contract.status === 'signed') {
      return NextResponse.json({ error: 'Contract already signed' }, { status: 409 });
    }

    const signedAt = new Date().toISOString();
    const pdfData = {
      ...contract.contract_data,
      signedName: signedName.trim(),
      signedAt,
    };

    // Import PDF generators server-side only
    let pdfBuffer: Buffer;
    if (contract.type === 'tutor') {
      const { generateTutorContractPdf } = await import('@/lib/contracts-pdf/pdf-tutor-contract');
      pdfBuffer = await generateTutorContractPdf(pdfData);
    } else if (contract.type === 'tutor-student') {
      const { generateTutorStudentContractPdf } = await import('@/lib/contracts-pdf/pdf-tutor-student-contract');
      pdfBuffer = await generateTutorStudentContractPdf(pdfData);
    } else {
      // student — no PDF generator ported yet, skip attachment
      pdfBuffer = Buffer.alloc(0);
    }

    const contractLabel =
      contract.type === 'tutor' ? 'Tutor Services Agreement'
      : contract.type === 'tutor-student' ? 'Tutor-Student Assignment Agreement'
      : 'SAT Tutoring Services Agreement';

    const studentLine = (contract.contract_data as any)?.studentName
      ? ` · Student: ${(contract.contract_data as any).studentName}`
      : '';

    const fileName = `studycore-${contract.type}-contract-${contract.recipient_name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;

    // Email signed PDF to StudyCore
    const resend = new Resend(process.env.RESEND_API_KEY);
    const emailPayload: Parameters<typeof resend.emails.send>[0] = {
      from: process.env.RESEND_FROM_EMAIL ?? 'noreply@studycore.net',
      to: 'info@studycore.net',
      subject: `Signed: ${contractLabel} — ${contract.recipient_name}${studentLine}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111;">
          <div style="background: #0f172a; padding: 24px 32px; border-radius: 8px 8px 0 0;">
            <p style="color: #fff; font-size: 20px; font-weight: bold; margin: 0;">StudyCore LLC</p>
          </div>
          <div style="padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="font-size: 16px; font-weight: bold; margin: 0 0 16px;">Contract Signed</p>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr><td style="padding: 6px 0; font-weight: bold; width: 160px;">Contract Type</td><td style="padding: 6px 0; color: #475569;">${contractLabel}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: bold;">Signed By</td><td style="padding: 6px 0; color: #475569;">${signedName.trim()}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: bold;">Recipient</td><td style="padding: 6px 0; color: #475569;">${contract.recipient_name} (${contract.recipient_email})</td></tr>
              ${studentLine ? `<tr><td style="padding: 6px 0; font-weight: bold;">Student</td><td style="padding: 6px 0; color: #475569;">${(contract.contract_data as any).studentName}</td></tr>` : ''}
              <tr><td style="padding: 6px 0; font-weight: bold;">Signed At</td><td style="padding: 6px 0; color: #475569;">${new Date(signedAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'long', timeStyle: 'short' })} PT</td></tr>
            </table>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="font-size: 12px; color: #999; margin: 0;">StudyCore LLC · San Ramon, California · studycore.net</p>
          </div>
        </div>
      `,
    };

    if (pdfBuffer.length > 0) {
      (emailPayload as any).attachments = [{ filename: fileName, content: pdfBuffer.toString('base64') }];
    }

    await resend.emails.send(emailPayload);

    await markSigningContractSigned(token, { signedName: signedName.trim() });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[signing-contracts/sign POST]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
