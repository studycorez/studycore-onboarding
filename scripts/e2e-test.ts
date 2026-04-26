/**
 * StudyCore End-to-End Test
 * Tests the full lifecycle: tutor → student → contract → session → log → hours → alert
 */
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';
import { config } from 'dotenv';
import { Resend } from 'resend';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const resend  = new Resend(process.env.RESEND_API_KEY);
const FROM    = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://studycore-eight.vercel.app';
// Resend free tier only delivers to the verified account address.
// All test emails are routed there; the DB records still store harshilch611@gmail.com.
const TEST_EMAIL         = 'harshilch611@gmail.com';
const DELIVERABLE_EMAIL  = 'info@studycore.net';
const NAVY = '#1e2090';

// ── Helpers ────────────────────────────────────────────────────────────────

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];

function pass(name: string, detail = '') {
  results.push({ name, passed: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail = '') {
  results.push({ name, passed: false, detail });
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function assert(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    pass(name);
  } catch (err: any) {
    fail(name, err?.message ?? String(err));
  }
}

function must<T>(data: T | null, error: any, label: string): T {
  if (error) throw new Error(`${label}: ${error.message}`);
  if (!data) throw new Error(`${label}: no data returned`);
  return data;
}

// ── Cleanup helper ─────────────────────────────────────────────────────────

async function cleanup(ids: { tutorId?: string; studentId?: string }) {
  console.log('\n🧹 Cleaning up test data…');
  if (ids.studentId) {
    await supabase.from('session_logs').delete().eq('tutor_id', ids.tutorId ?? '');
    await supabase.from('sessions').delete()
      .or(`tutor_id.eq.${ids.tutorId ?? 'none'},student_id.eq.${ids.studentId}`);
    await supabase.from('contracts').delete()
      .or(`tutor_id.eq.${ids.tutorId ?? 'none'},student_id.eq.${ids.studentId}`);
    await supabase.from('students').delete().eq('id', ids.studentId);
    console.log('  ✓ Student + sessions + contracts deleted');
  }
  if (ids.tutorId) {
    await supabase.from('tutor_availability').delete().eq('tutor_id', ids.tutorId);
    await supabase.from('tutors').delete().eq('id', ids.tutorId);
    console.log('  ✓ Tutor deleted');
  }
}

// ── Email senders (inline to avoid Next.js server-only imports) ─────────────

function baseLayout(content: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.08);}
  .header{background:${NAVY};padding:24px 32px;}
  .header h1{color:#fff;margin:0;font-size:22px;font-weight:700;}
  .header p{color:#9ab0ff;margin:4px 0 0;font-size:13px;}
  .body{padding:32px;}
  .body h2{color:#111827;margin:0 0 16px;font-size:18px;}
  .body p{color:#374151;line-height:1.6;margin:0 0 12px;font-size:15px;}
  .info-box{background:#f0f4ff;border:1px solid #c3d1ff;border-radius:6px;padding:16px 20px;margin:20px 0;}
  .info-row{display:flex;justify-content:space-between;padding:4px 0;font-size:14px;}
  .info-row .label{color:#6b7280;font-weight:500;}
  .info-row .value{color:#111827;font-weight:600;}
  .btn{display:inline-block;background:${NAVY};color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:15px;}
  .footer{padding:20px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;text-align:center;}
</style></head><body><div class="wrap">${content}
<div class="footer">&copy; ${new Date().getFullYear()} StudyCore. All rights reserved.</div>
</div></body></html>`;
}

async function sendContractEmail(params: {
  tutorEmail: string; tutorName: string; studentName: string;
  hourlyRate: number; contractId: string; gamePlanUrl: string | null;
}) {
  const contractUrl = `${APP_URL}/contracts/${params.contractId}`;
  const html = baseLayout(`
    <div class="header"><h1>StudyCore</h1><p>Action Required: Contract Signature</p></div>
    <div class="body">
      <h2>Please sign your tutor commitment contract</h2>
      <p>Hi ${params.tutorName}, you've been assigned to tutor <strong>${params.studentName}</strong> through StudyCore.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Rate</span><span class="value">$${params.hourlyRate}/hour</span></div>
      </div>
      <a href="${contractUrl}" class="btn">Review &amp; Sign Contract</a>
      <p style="margin-top:16px;font-size:13px;color:#6b7280">Link: ${contractUrl}</p>
    </div>`);
  return resend.emails.send({
    from: FROM, to: [params.tutorEmail],
    subject: `Action Required: Sign your StudyCore contract for ${params.studentName}`,
    html,
  });
}

async function sendSessionLogEmail(params: {
  tutorEmail: string; tutorName: string; studentName: string;
  scheduledAt: string; sessionId: string;
}) {
  const logUrl = `${APP_URL}/session-log/${params.sessionId}`;
  const date = new Date(params.scheduledAt).toLocaleString();
  const html = baseLayout(`
    <div class="header"><h1>StudyCore</h1><p>Session Log Request</p></div>
    <div class="body">
      <h2>Session complete — please submit your log 📋</h2>
      <p>Hi ${params.tutorName}, your session with <strong>${params.studentName}</strong> on ${date} has ended.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Session Time</span><span class="value">${date}</span></div>
      </div>
      <a href="${logUrl}" class="btn">Submit Session Log</a>
    </div>`);
  return resend.emails.send({
    from: FROM, to: [params.tutorEmail],
    subject: `Session Log: ${params.studentName} — please submit notes`,
    html,
  });
}

async function sendLowHoursEmail(params: {
  studentName: string; remainingHours: number;
  parentEmail: string | null; studentEmail: string;
}) {
  const html = baseLayout(`
    <div class="header"><h1>StudyCore</h1><p>Low Hours Alert</p></div>
    <div class="body">
      <h2>⚠️ A student is running low on hours</h2>
      <p>The following student has fewer than 5 hours remaining.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Hours Remaining</span><span class="value" style="color:#dc2626">${params.remainingHours.toFixed(1)} hrs</span></div>
        <div class="info-row"><span class="label">Contact</span><span class="value">${params.studentEmail}</span></div>
      </div>
      <p>Please reach out to the family to discuss renewing their package.</p>
    </div>`);
  return resend.emails.send({
    from: FROM, to: ['info@studycore.net'],
    subject: `Low Hours Alert: ${params.studentName} has ${params.remainingHours.toFixed(1)} hrs remaining`,
    html,
  });
}

// ── Main test runner ───────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(60));
  console.log('StudyCore End-to-End Test');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('═'.repeat(60));

  let tutorId: string | undefined;
  let studentId: string | undefined;
  let contractId: string | undefined;
  let sessionId: string | undefined;

  // ── 1. Create test tutor ─────────────────────────────────────────────────
  console.log('\n[1] Create test tutor');
  await assert('Insert tutor', async () => {
    const { data, error } = await supabase
      .from('tutors')
      .insert({
        name: 'Test Tutor',
        email: TEST_EMAIL,
        subjects: ['SAT Math', 'SAT Reading'],
        hourly_rate: 25,
        availability_mode: 'manual',
      })
      .select('id')
      .single();
    const row = must(data, error, 'insert tutor');
    tutorId = row.id;
    if (!tutorId) throw new Error('No tutor ID returned');
  });

  // ── 2. Create test student ───────────────────────────────────────────────
  console.log('\n[2] Create test student');
  await assert('Insert student', async () => {
    const { data, error } = await supabase
      .from('students')
      .insert({
        name: 'Test Student',
        email: TEST_EMAIL,
        purchased_hours: 10,
        used_hours: 0,
        low_hours_alerted: false,
      })
      .select('id')
      .single();
    const row = must(data, error, 'insert student');
    studentId = row.id;
    if (!studentId) throw new Error('No student ID returned');
  });

  // ── 3. Create contract + send email ─────────────────────────────────────
  console.log('\n[3] Create contract and send email');
  await assert('Insert contract (status: pending)', async () => {
    if (!tutorId || !studentId) throw new Error('Missing tutor/student IDs');
    const { data, error } = await supabase
      .from('contracts')
      .insert({
        tutor_id: tutorId,
        student_id: studentId,
        hourly_rate: 25,
        status: 'pending',
      })
      .select('id')
      .single();
    const row = must(data, error, 'insert contract');
    contractId = row.id;
  });

  await assert(`Send contract email to ${TEST_EMAIL}`, async () => {
    if (!contractId) throw new Error('No contract ID');
    const result = await sendContractEmail({
      tutorEmail:  DELIVERABLE_EMAIL,
      tutorName:   'Test Tutor',
      studentName: 'Test Student',
      hourlyRate:  25,
      contractId,
      gamePlanUrl: null,
    });
    if (result.error) throw new Error(result.error.message);
    if (!result.data?.id) throw new Error('No email ID returned from Resend');
  });

  // ── 4. Sign contract ─────────────────────────────────────────────────────
  console.log('\n[4] Sign contract');
  await assert('Update contract to signed', async () => {
    if (!contractId) throw new Error('No contract ID');
    const { error } = await supabase
      .from('contracts')
      .update({
        status: 'signed',
        tutor_signature: 'Test Tutor',
        signed_at: new Date().toISOString(),
      })
      .eq('id', contractId);
    if (error) throw error;
  });

  await assert('Verify contract status is signed', async () => {
    if (!contractId) throw new Error('No contract ID');
    const { data, error } = await supabase
      .from('contracts').select('status, tutor_signature').eq('id', contractId).single();
    const row = must(data, error, 'fetch contract');
    if (row.status !== 'signed') throw new Error(`Expected 'signed', got '${row.status}'`);
    if (row.tutor_signature !== 'Test Tutor') throw new Error('Signature mismatch');
  });

  // ── 5. Create session (10 min from now) ──────────────────────────────────
  console.log('\n[5] Create test session');
  await assert('Insert session (scheduled 10 min from now)', async () => {
    if (!tutorId || !studentId) throw new Error('Missing IDs');
    const scheduledAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        tutor_id:         tutorId,
        student_id:       studentId,
        scheduled_at:     scheduledAt,
        duration_minutes: 60,
        status:           'scheduled',
        payment_status:   'pending',
        payment_amount:   25,
      })
      .select('id')
      .single();
    const row = must(data, error, 'insert session');
    sessionId = row.id;
  });

  // ── 6. Send session log request email ────────────────────────────────────
  console.log('\n[6] Send session log request email');
  await assert(`Send session log request email to ${TEST_EMAIL}`, async () => {
    if (!sessionId) throw new Error('No session ID');
    const scheduledAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const result = await sendSessionLogEmail({
      tutorEmail:  DELIVERABLE_EMAIL,
      tutorName:   'Test Tutor',
      studentName: 'Test Student',
      scheduledAt,
      sessionId,
    });
    if (result.error) throw new Error(result.error.message);
    if (!result.data?.id) throw new Error('No email ID returned from Resend');
  });

  // ── 7. Submit session log → verify used_hours ────────────────────────────
  console.log('\n[7] Submit session log and verify used_hours');
  await assert('Insert session_log record', async () => {
    if (!sessionId || !tutorId) throw new Error('Missing IDs');
    const { error } = await supabase.from('session_logs').insert({
      session_id:              sessionId,
      tutor_id:                tutorId,
      actual_duration_minutes: 60,
      went_well:               'Test session',
      issues:                  null,
      follow_up_needed:        false,
    });
    if (error) throw error;
  });

  await assert('Update session status to completed', async () => {
    if (!sessionId) throw new Error('No session ID');
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'completed', session_notes: 'Test session' })
      .eq('id', sessionId);
    if (error) throw error;
  });

  await assert('Increment student used_hours by 1 (60 min / 60)', async () => {
    if (!studentId) throw new Error('No student ID');
    const { data: student, error: fetchErr } = await supabase
      .from('students').select('used_hours').eq('id', studentId).single();
    const s = must(student, fetchErr, 'fetch student');
    const newUsedHours = (s.used_hours ?? 0) + 1;
    const { error: updateErr } = await supabase
      .from('students')
      .update({ used_hours: newUsedHours })
      .eq('id', studentId);
    if (updateErr) throw updateErr;
  });

  await assert('Verify used_hours is now 1.0', async () => {
    if (!studentId) throw new Error('No student ID');
    const { data, error } = await supabase
      .from('students').select('used_hours').eq('id', studentId).single();
    const s = must(data, error, 'fetch student');
    if (s.used_hours !== 1) throw new Error(`Expected used_hours=1, got ${s.used_hours}`);
  });

  // ── 8. Low hours alert ────────────────────────────────────────────────────
  console.log('\n[8] Test low hours alert');
  await assert('Set purchased_hours to 4.5 (triggers low hours condition)', async () => {
    if (!studentId) throw new Error('No student ID');
    const { error } = await supabase
      .from('students')
      .update({ purchased_hours: 4.5, low_hours_alerted: false })
      .eq('id', studentId);
    if (error) throw error;
  });

  await assert('Verify remaining hours < 5 (4.5 - 1.0 = 3.5)', async () => {
    if (!studentId) throw new Error('No student ID');
    const { data, error } = await supabase
      .from('students').select('purchased_hours, used_hours').eq('id', studentId).single();
    const s = must(data, error, 'fetch student');
    const remaining = (s.purchased_hours ?? 0) - (s.used_hours ?? 0);
    if (remaining >= 5) throw new Error(`Expected remaining < 5, got ${remaining}`);
  });

  await assert('Send low hours alert to info@studycore.net', async () => {
    const result = await sendLowHoursEmail({
      studentName:    'Test Student',
      remainingHours: 3.5,
      parentEmail:    null,
      studentEmail:   TEST_EMAIL,
    });
    if (result.error) throw new Error(result.error.message);
    if (!result.data?.id) throw new Error('No email ID returned from Resend');
  });

  await assert('Set low_hours_alerted = true on student', async () => {
    if (!studentId) throw new Error('No student ID');
    const { error } = await supabase
      .from('students')
      .update({ low_hours_alerted: true })
      .eq('id', studentId);
    if (error) throw error;
  });

  await assert('Verify low_hours_alerted is true', async () => {
    if (!studentId) throw new Error('No student ID');
    const { data, error } = await supabase
      .from('students').select('low_hours_alerted').eq('id', studentId).single();
    const s = must(data, error, 'fetch student');
    if (!s.low_hours_alerted) throw new Error('low_hours_alerted should be true');
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('RESULTS');
  console.log('═'.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  for (const r of results) {
    const icon = r.passed ? '✓' : '✗';
    const detail = r.detail ? `  (${r.detail})` : '';
    console.log(`  ${icon} ${r.name}${detail}`);
  }

  console.log('');
  console.log(`  Passed: ${passed} / ${results.length}`);
  console.log(`  Failed: ${failed} / ${results.length}`);

  if (failed === 0) {
    console.log('\n✅ All tests passed!');
    await cleanup({ tutorId, studentId });
    console.log('\nAll test data removed.');
  } else {
    console.log(`\n❌ ${failed} test(s) failed — leaving data in DB for inspection.`);
    console.log('  Tutor ID:    ', tutorId   ?? 'not created');
    console.log('  Student ID:  ', studentId ?? 'not created');
    console.log('  Contract ID: ', contractId ?? 'not created');
    console.log('  Session ID:  ', sessionId  ?? 'not created');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('\nFATAL:', err); process.exit(1); });
