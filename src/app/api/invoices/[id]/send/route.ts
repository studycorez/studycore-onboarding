import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { Resend } from 'resend';
import { format } from 'date-fns';

function getResend() { return new Resend(process.env.RESEND_API_KEY); }
const FROM   = process.env.RESEND_FROM_EMAIL ?? 'noreply@studycore.net';
const NAVY   = '#1e2090';

function fmtDate(d: string) { return format(new Date(d), 'MMM d, yyyy'); }
function fmtAmt(n: number)  { return `$${Number(n).toFixed(2)}`; }

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createServiceClient();

    const { data: inv } = await supabase
      .from('invoices')
      .select('*, student:students(name, email, parent_email)')
      .eq('id', params.id)
      .single();

    if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    if (inv.status === 'voided') return NextResponse.json({ error: 'Cannot send voided invoice' }, { status: 409 });

    const student = inv.student as any;
    const toEmails: string[] = [student.email];
    if (student.parent_email && !toEmails.includes(student.parent_email)) toEmails.push(student.parent_email);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
      .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.08);}
      .header{background:${NAVY};padding:24px 32px;}
      .header h1{color:#fff;margin:0;font-size:22px;font-weight:700;}
      .header p{color:#9ab0ff;margin:4px 0 0;font-size:13px;}
      .body{padding:32px;}
      .footer{padding:20px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;text-align:center;}
    </style></head><body><div class="wrap">
      <div class="header"><h1>StudyCore</h1><p>Invoice</p></div>
      <div class="body">
        <h2 style="color:#111827;margin:0 0 8px">Invoice for ${student.name}</h2>
        <p style="color:#6b7280;font-size:14px;margin:0 0 24px">Tutoring services — ${fmtDate(inv.period_start)} to ${fmtDate(inv.period_end)}</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:24px;">
          <thead><tr style="background:#f9fafb;">
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Description</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;">Amount</th>
          </tr></thead>
          <tbody>
            <tr style="border-top:1px solid #e5e7eb;">
              <td style="padding:14px 16px;font-size:14px;color:#374151;">Tutoring sessions: ${fmtDate(inv.period_start)} – ${fmtDate(inv.period_end)}</td>
              <td style="padding:14px 16px;font-size:14px;font-weight:600;color:#111827;text-align:right;">${fmtAmt(inv.amount)}</td>
            </tr>
          </tbody>
          <tfoot><tr style="background:#f0f4ff;border-top:2px solid #c3d1ff;">
            <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#1e2090;">Total Due</td>
            <td style="padding:12px 16px;font-size:16px;font-weight:700;color:#1e2090;text-align:right;">${fmtAmt(inv.amount)}</td>
          </tr></tfoot>
        </table>
        ${inv.notes ? `<p style="font-size:14px;color:#6b7280;background:#f9fafb;padding:12px 16px;border-radius:6px;">${inv.notes}</p>` : ''}
        <p style="font-size:13px;color:#9ca3af;margin-top:24px;">Questions? Contact us at support@studycore.net or reply to this email.</p>
      </div>
      <div class="footer">&copy; ${new Date().getFullYear()} StudyCore. All rights reserved.</div>
    </div></body></html>`;

    const { error: emailError } = await getResend().emails.send({
      from: FROM,
      to: toEmails,
      reply_to: 'support@studycore.net',
      subject: `Invoice: ${student.name} — ${fmtDate(inv.period_start)} to ${fmtDate(inv.period_end)} (${fmtAmt(inv.amount)})`,
      html,
    });

    if (emailError) return NextResponse.json({ error: emailError.message }, { status: 500 });

    await supabase.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', params.id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
