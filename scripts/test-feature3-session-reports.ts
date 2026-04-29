/**
 * Feature 3 E2E test — Automated Session Reports to Parents
 * Run: npx ts-node --project tsconfig.json scripts/test-feature3-session-reports.ts
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://studycore-eight.vercel.app';
const TEST_EMAIL = 'harshilch611@gmail.com';
const FROM = (process.env.RESEND_FROM_EMAIL || '').includes('onboarding@resend.dev')
  ? 'noreply@studycore.net'
  : (process.env.RESEND_FROM_EMAIL || 'noreply@studycore.net');

// ── Inline sendSessionReport logic ─────────────────────────────────────────
import { Resend } from 'resend';
import { format } from 'date-fns';

const resend = new Resend(process.env.RESEND_API_KEY);
const NAVY = '#1e2090';

function baseLayout(content: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
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
    .footer{padding:20px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;text-align:center;}
  </style></head><body><div class="wrap">${content}<div class="footer">&copy; 2025 StudyCore. All rights reserved.</div></div></body></html>`;
}

async function sendSessionReport(params: {
  toEmails: string[];
  studentName: string;
  tutorName: string;
  scheduledAt: string;
  durationMinutes: number;
  tutorNotes: string;
  homeworkAssigned: string | null;
  sessionRating: number;
}) {
  const stars = '★'.repeat(params.sessionRating) + '☆'.repeat(5 - params.sessionRating);
  const ratingLabels = ['', 'Needs significant work', 'Below expectations', 'Met expectations', 'Above expectations', 'Excellent'];
  const ratingLabel = ratingLabels[params.sessionRating] ?? '';
  const formatDt = (iso: string) => format(new Date(iso), "EEEE, MMMM d, yyyy 'at' h:mm a");

  const html = baseLayout(`
    <div class="header"><h1>StudyCore</h1><p>Session Report</p></div>
    <div class="body">
      <h2>Session report for ${params.studentName}</h2>
      <p>Here's a summary of today's tutoring session with <strong>${params.tutorName}</strong>.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Tutor</span><span class="value">${params.tutorName}</span></div>
        <div class="info-row"><span class="label">Session Time</span><span class="value">${formatDt(params.scheduledAt)}</span></div>
        <div class="info-row"><span class="label">Duration</span><span class="value">${params.durationMinutes} minutes</span></div>
        <div class="info-row"><span class="label">Performance</span><span class="value" style="color:#f59e0b">${stars} <span style="color:#374151">${ratingLabel}</span></span></div>
      </div>
      <p style="font-weight:600;margin-bottom:4px">What was covered:</p>
      <p style="background:#f9fafb;border-left:3px solid ${NAVY};padding:10px 14px;border-radius:0 4px 4px 0;font-size:14px">${params.tutorNotes.replace(/\n/g, '<br>')}</p>
      ${params.homeworkAssigned ? `
      <p style="font-weight:600;margin-bottom:4px;margin-top:16px">Homework assigned:</p>
      <p style="background:#f0fdf4;border-left:3px solid #22c55e;padding:10px 14px;border-radius:0 4px 4px 0;font-size:14px">${params.homeworkAssigned.replace(/\n/g, '<br>')}</p>
      ` : ''}
    </div>
  `);

  return resend.emails.send({
    from: FROM,
    to: params.toEmails,
    subject: `[Test] Session report: ${params.studentName} with ${params.tutorName} — ${format(new Date(params.scheduledAt), 'MMM d')}`,
    html,
  });
}

// ── Inline cron logic ────────────────────────────────────────────────────────
async function runSessionReportsCron(): Promise<{ sent: number; failed: number }> {
  const { data: sessions } = await supabase
    .from('sessions')
    .select('*, tutor:tutors(name), student:students(name, email, parent_email)')
    .not('notes_submitted_at', 'is', null)
    .eq('session_report_sent', false);

  let sent = 0; let failed = 0;

  for (const s of sessions ?? []) {
    const tutor   = (s.tutor   as any);
    const student = (s.student as any);
    if (!student?.email || !s.tutor_notes) continue;

    try {
      const emails = [student.email];
      if (student.parent_email && !emails.includes(student.parent_email)) emails.push(student.parent_email);

      await sendSessionReport({
        toEmails: emails,
        studentName: student.name,
        tutorName: tutor?.name ?? 'Your tutor',
        scheduledAt: s.scheduled_at,
        durationMinutes: s.duration_minutes,
        tutorNotes: s.tutor_notes,
        homeworkAssigned: s.homework_assigned ?? null,
        sessionRating: s.session_rating ?? 3,
      });

      await supabase.from('sessions').update({ session_report_sent: true }).eq('id', s.id);
      sent++;
    } catch (err) {
      console.error('[cron] failed', s.id, err);
      failed++;
    }
  }

  return { sent, failed };
}

async function main() {
  const results: { step: string; passed: boolean; detail: string }[] = [];
  function pass(step: string, detail = '') { results.push({ step, passed: true, detail }); console.log(`  ✅ PASS  ${step}${detail ? ' — ' + detail : ''}`); }
  function fail(step: string, detail = '') { results.push({ step, passed: false, detail }); console.log(`  ❌ FAIL  ${step}${detail ? ' — ' + detail : ''}`); }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Feature 3 Test — Automated Session Reports to Parents');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let studentId: string | null = null;
  let tutorId: string | null = null;
  let sessionId: string | null = null;

  // ── Setup ────────────────────────────────────────────────────────────────
  try {
    const { data: s, error: sErr } = await supabase.from('students')
      .insert({ name: 'Report Test Student', email: TEST_EMAIL, parent_email: TEST_EMAIL, grade: 11, status: 'active', purchased_hours: 10, target_score: 1400, current_score: 1200 })
      .select('id').single();
    if (sErr) throw new Error(sErr.message);
    studentId = s!.id;

    const { data: t, error: tErr } = await supabase.from('tutors')
      .insert({ name: 'Report Test Tutor', email: 'reporttesttutor@studycore.test', hourly_rate: 25 })
      .select('id').single();
    if (tErr) throw new Error(tErr.message);
    tutorId = t!.id;

    const scheduledAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: sess, error: sessErr } = await supabase.from('sessions')
      .insert({
        student_id: studentId,
        tutor_id: tutorId,
        scheduled_at: scheduledAt,
        duration_minutes: 90,
        status: 'completed',
        tutor_notes: 'Covered linear equations and systems of equations. Student showed strong improvement on graphing.',
        homework_assigned: 'Complete Khan Academy: Systems of equations — 10 problems.',
        session_rating: 4,
        notes_submitted_at: new Date().toISOString(),
        session_report_sent: false,
        log_request_sent: true,
      })
      .select('id').single();
    if (sessErr) throw new Error(sessErr.message);
    sessionId = sess!.id;
    console.log(`  Setup: session=${sessionId?.slice(0, 8)}\n`);
  } catch (e: any) {
    fail('Setup test data', e.message);
    process.exit(1);
  }

  // ── Step 1: session_report_sent column exists ─────────────────────────────
  console.log('── Step 1: session_report_sent column exists');
  try {
    const { data } = await supabase.from('sessions').select('session_report_sent').eq('id', sessionId!).single();
    if (data?.session_report_sent === false) pass('session_report_sent column', 'default false');
    else fail('session_report_sent column', JSON.stringify(data));
  } catch (e: any) { fail('session_report_sent column', e.message); }

  // ── Step 2: Cron finds sessions with notes not yet reported ───────────────
  console.log('\n── Step 2: Cron identifies unreported sessions');
  try {
    const { data } = await supabase.from('sessions')
      .select('id')
      .not('notes_submitted_at', 'is', null)
      .eq('session_report_sent', false)
      .eq('id', sessionId!);
    if (data && data.length > 0) pass('Session found by cron query', sessionId!.slice(0, 8));
    else fail('Session found by cron query', 'not in result set');
  } catch (e: any) { fail('Cron query', e.message); }

  // ── Step 3: Run cron and send report ─────────────────────────────────────
  console.log('\n── Step 3: Run session reports cron');
  try {
    const { sent, failed: failedCount } = await runSessionReportsCron();
    if (sent >= 1 && failedCount === 0) pass('Cron ran and sent report', `${sent} sent`);
    else fail('Cron ran', `sent=${sent} failed=${failedCount}`);
  } catch (e: any) { fail('Cron run', e.message); }

  // ── Step 4: session_report_sent = true in DB ─────────────────────────────
  console.log('\n── Step 4: session_report_sent marked true');
  try {
    const { data } = await supabase.from('sessions').select('session_report_sent').eq('id', sessionId!).single();
    if (data?.session_report_sent === true) pass('session_report_sent = true', 'marked after send');
    else fail('session_report_sent = true', JSON.stringify(data));
  } catch (e: any) { fail('session_report_sent marked', e.message); }

  // ── Step 5: Cron is idempotent (won't send again) ─────────────────────────
  console.log('\n── Step 5: Cron idempotent (no double send)');
  try {
    const { sent } = await runSessionReportsCron();
    if (sent === 0) pass('Cron idempotent', 'already-sent session skipped');
    else fail('Cron idempotent', `re-sent ${sent} sessions`);
  } catch (e: any) { fail('Cron idempotent', e.message); }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log('\n── Cleanup');
  try {
    if (sessionId) await supabase.from('sessions').delete().eq('id', sessionId);
    if (studentId) await supabase.from('students').delete().eq('id', studentId);
    if (tutorId) await supabase.from('tutors').delete().eq('id', tutorId);
    pass('Cleanup');
  } catch (e: any) { fail('Cleanup', e.message); }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  console.log('\n═══════════════════════════════════════════════════════════════');
  for (const r of results) console.log(`  ${r.passed ? '✅' : '❌'}  ${r.step}${r.detail ? ' — ' + r.detail : ''}`);
  console.log(`\n  ${passed}/${results.length} passed`);
  console.log(passed === results.length ? '  🎉 Feature 3 PASS' : '  ⚠️  Feature 3 FAIL');
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
