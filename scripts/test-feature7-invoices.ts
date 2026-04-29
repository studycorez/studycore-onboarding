/**
 * Feature 7 E2E test — Invoice & Payment Tracking
 * Run: npx ts-node --project tsconfig.json scripts/test-feature7-invoices.ts
 */
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { config } from 'dotenv';
import { resolve } from 'path';
import { format, subDays } from 'date-fns';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = (process.env.RESEND_FROM_EMAIL || '').includes('onboarding@resend.dev')
  ? 'noreply@studycore.net'
  : (process.env.RESEND_FROM_EMAIL || 'noreply@studycore.net');
const TEST_EMAIL = 'harshilch611@gmail.com';
const NAVY = '#1e2090';

// ── Inline invoice logic ─────────────────────────────────────────────────────

async function createInvoice(studentId: string, periodStart: string, periodEnd: string, amount: number, notes?: string) {
  if (!studentId || !periodStart || !periodEnd) return { ok: false, error: 'Missing fields', status: 400 };
  if (amount == null || isNaN(amount)) return { ok: false, error: 'amount required', status: 400 };

  const { data, error } = await supabase.from('invoices')
    .insert({ student_id: studentId, period_start: periodStart, period_end: periodEnd, amount, notes: notes ?? null, status: 'draft' })
    .select('*, student:students(name, email, parent_email)').single();
  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, data, status: 201 };
}

async function sendInvoice(invoiceId: string) {
  const { data: inv } = await supabase.from('invoices')
    .select('*, student:students(name, email, parent_email)').eq('id', invoiceId).single();
  if (!inv) return { ok: false, error: 'Not found', status: 404 };
  if (inv.status === 'voided') return { ok: false, error: 'Cannot send voided invoice', status: 409 };

  const student = inv.student as any;
  const toEmails: string[] = [TEST_EMAIL]; // always send to test email
  const fmtDate = (d: string) => format(new Date(d), 'MMM d, yyyy');
  const fmtAmt  = (n: number) => `$${Number(n).toFixed(2)}`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;background:#f5f7fa;">
    <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;">
      <div style="background:${NAVY};padding:24px 32px;"><h1 style="color:#fff;margin:0;">StudyCore</h1><p style="color:#9ab0ff;margin:4px 0 0;">Invoice</p></div>
      <div style="padding:32px;">
        <h2 style="color:#111827;">Invoice for ${student.name}</h2>
        <p style="color:#6b7280;">Tutoring: ${fmtDate(inv.period_start)} – ${fmtDate(inv.period_end)}</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;margin:16px 0;">
          <tr style="background:#f9fafb;"><th style="padding:10px 16px;text-align:left;">Description</th><th style="padding:10px 16px;text-align:right;">Amount</th></tr>
          <tr><td style="padding:14px 16px;">Tutoring services</td><td style="padding:14px 16px;text-align:right;font-weight:600;">${fmtAmt(inv.amount)}</td></tr>
          <tr style="background:#f0f4ff;"><td style="padding:12px 16px;font-weight:700;color:${NAVY};">Total Due</td><td style="padding:12px 16px;text-align:right;font-weight:700;color:${NAVY};">${fmtAmt(inv.amount)}</td></tr>
        </table>
        ${inv.notes ? `<p style="color:#6b7280;">${inv.notes}</p>` : ''}
      </div>
    </div>
  </body></html>`;

  const { error: emailErr } = await resend.emails.send({
    from: FROM, to: toEmails,
    subject: `[Test] Invoice: ${student.name} — ${fmtDate(inv.period_start)} to ${fmtDate(inv.period_end)} (${fmtAmt(inv.amount)})`,
    html,
  });
  if (emailErr) return { ok: false, error: emailErr.message, status: 500 };

  await supabase.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', invoiceId);
  return { ok: true, status: 200 };
}

async function markPaid(invoiceId: string) {
  const { data: inv } = await supabase.from('invoices').select('id, status').eq('id', invoiceId).single();
  if (!inv) return { ok: false, error: 'Not found', status: 404 };
  if (inv.status === 'voided') return { ok: false, error: 'Cannot pay voided invoice', status: 409 };
  await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', invoiceId);
  return { ok: true, status: 200 };
}

async function voidInvoice(invoiceId: string) {
  const { data: inv } = await supabase.from('invoices').select('id').eq('id', invoiceId).single();
  if (!inv) return { ok: false, error: 'Not found', status: 404 };
  await supabase.from('invoices').update({ status: 'voided' }).eq('id', invoiceId);
  return { ok: true, status: 200 };
}

async function main() {
  const results: { step: string; passed: boolean; detail: string }[] = [];
  function pass(step: string, detail = '') { results.push({ step, passed: true, detail }); console.log(`  ✅ PASS  ${step}${detail ? ' — ' + detail : ''}`); }
  function fail(step: string, detail = '') { results.push({ step, passed: false, detail }); console.log(`  ❌ FAIL  ${step}${detail ? ' — ' + detail : ''}`); }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Feature 7 Test — Invoice & Payment Tracking');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let studentId: string | null = null;
  let invoiceId: string | null = null;
  let voidInvoiceId: string | null = null;

  // ── Setup ────────────────────────────────────────────────────────────────
  try {
    const { data: s, error: sErr } = await supabase.from('students')
      .insert({ name: 'Invoice Test Student', email: TEST_EMAIL, parent_email: TEST_EMAIL, grade: 11, status: 'active', purchased_hours: 10 })
      .select('id').single();
    if (sErr) throw new Error(sErr.message);
    studentId = s!.id;
    console.log(`  Setup: student=${studentId?.slice(0, 8)}\n`);
  } catch (e: any) { fail('Setup', e.message); process.exit(1); }

  // ── Step 1: Create invoice (draft) ───────────────────────────────────────
  console.log('── Step 1: Create invoice');
  const periodStart = format(subDays(new Date(), 14), 'yyyy-MM-dd');
  const periodEnd   = format(subDays(new Date(), 1),  'yyyy-MM-dd');
  const r1 = await createInvoice(studentId!, periodStart, periodEnd, 400.00, '8 sessions at $50/hr');
  if (r1.ok) { invoiceId = r1.data.id; pass('Invoice created', `id=${invoiceId!.slice(0, 8)}, status=draft`); }
  else fail('Create invoice', r1.error ?? '');

  // ── Step 2: Invoice in DB with correct fields ────────────────────────────
  console.log('\n── Step 2: Invoice persisted correctly');
  try {
    const { data } = await supabase.from('invoices').select('*').eq('id', invoiceId!).single();
    if (data?.status === 'draft' && data?.amount == 400 && data?.student_id === studentId) {
      pass('Invoice in DB', `amount=$${data.amount}, status=${data.status}`);
    } else {
      fail('Invoice in DB', JSON.stringify(data));
    }
  } catch (e: any) { fail('Invoice in DB', e.message); }

  // ── Step 3: Missing fields rejected ──────────────────────────────────────
  console.log('\n── Step 3: Missing fields rejected');
  const r3 = await createInvoice('', periodStart, periodEnd, 100);
  if (r3.status === 400) pass('Missing student_id rejected', 'status 400');
  else fail('Missing fields rejected', `status ${r3.status}`);

  // ── Step 4: Send invoice email ────────────────────────────────────────────
  console.log('\n── Step 4: Send invoice email');
  const r4 = await sendInvoice(invoiceId!);
  if (r4.ok) pass('Invoice email sent', `to ${TEST_EMAIL}`);
  else fail('Send invoice', r4.error ?? '');

  // ── Step 5: Status updated to sent ───────────────────────────────────────
  console.log('\n── Step 5: Status → sent after email');
  try {
    const { data } = await supabase.from('invoices').select('status, sent_at').eq('id', invoiceId!).single();
    if (data?.status === 'sent' && data?.sent_at) pass('Status = sent', `sent_at set`);
    else fail('Status sent', JSON.stringify(data));
  } catch (e: any) { fail('Status sent', e.message); }

  // ── Step 6: Mark paid ────────────────────────────────────────────────────
  console.log('\n── Step 6: Mark invoice paid');
  const r6 = await markPaid(invoiceId!);
  if (r6.ok) pass('Invoice marked paid', '');
  else fail('Mark paid', r6.error ?? '');

  // ── Step 7: Status → paid with paid_at ───────────────────────────────────
  console.log('\n── Step 7: Status → paid in DB');
  try {
    const { data } = await supabase.from('invoices').select('status, paid_at').eq('id', invoiceId!).single();
    if (data?.status === 'paid' && data?.paid_at) pass('Status = paid', `paid_at set`);
    else fail('Status paid', JSON.stringify(data));
  } catch (e: any) { fail('Status paid', e.message); }

  // ── Step 8: Void a separate invoice ──────────────────────────────────────
  console.log('\n── Step 8: Void invoice');
  const r8c = await createInvoice(studentId!, periodStart, periodEnd, 200);
  if (r8c.ok) {
    voidInvoiceId = r8c.data.id;
    const r8v = await voidInvoice(voidInvoiceId!);
    if (r8v.ok) {
      const { data } = await supabase.from('invoices').select('status').eq('id', voidInvoiceId!).single();
      if (data?.status === 'voided') pass('Invoice voided', 'status = voided');
      else fail('Invoice voided', `status = ${data?.status}`);
    } else fail('Void invoice', r8v.error ?? '');
  } else fail('Create invoice for void test', r8c.error ?? '');

  // ── Step 9: Cannot send voided invoice ───────────────────────────────────
  console.log('\n── Step 9: Cannot send voided invoice');
  if (voidInvoiceId) {
    const r9 = await sendInvoice(voidInvoiceId!);
    if (r9.status === 409) pass('Voided invoice send rejected', 'status 409');
    else fail('Voided invoice send rejected', `status ${r9.status}`);
  } else fail('Voided invoice test', 'no void invoice created');

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log('\n── Cleanup');
  try {
    if (invoiceId)     await supabase.from('invoices').delete().eq('id', invoiceId);
    if (voidInvoiceId) await supabase.from('invoices').delete().eq('id', voidInvoiceId);
    if (studentId)     await supabase.from('students').delete().eq('id', studentId);
    pass('Cleanup');
  } catch (e: any) { fail('Cleanup', e.message); }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  console.log('\n═══════════════════════════════════════════════════════════════');
  for (const r of results) console.log(`  ${r.passed ? '✅' : '❌'}  ${r.step}${r.detail ? ' — ' + r.detail : ''}`);
  console.log(`\n  ${passed}/${results.length} passed`);
  console.log(passed === results.length ? '  🎉 Feature 7 PASS' : '  ⚠️  Feature 7 FAIL');
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
