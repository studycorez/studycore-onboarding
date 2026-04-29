/**
 * Feature 4 E2E test — Weekly Progress Reports
 * Run: npx ts-node --project tsconfig.json scripts/test-feature4-weekly-reports.ts
 */
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { config } from 'dotenv';
import { resolve } from 'path';
import { subDays, startOfWeek, endOfWeek, format } from 'date-fns';
import { readFileSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TEST_EMAIL = 'harshilch611@gmail.com';
const FROM = (process.env.RESEND_FROM_EMAIL || '').includes('onboarding@resend.dev')
  ? 'noreply@studycore.net'
  : (process.env.RESEND_FROM_EMAIL || 'noreply@studycore.net');

const NAVY = '#1e2090';
const resend = new Resend(process.env.RESEND_API_KEY);

// ── Inline weekly report logic (mirrors cron/weekly-report) ─────────────────
async function runWeeklyReportForStudent(studentId: string): Promise<{ sent: boolean; error?: string }> {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(now,   { weekStartsOn: 1 });
  const pastWeekStart = subDays(now, 7);

  const { data: student } = await supabase.from('students').select('*').eq('id', studentId).single();
  if (!student?.parent_email) return { sent: false, error: 'No parent email' };

  const { data: rawSessions } = await supabase
    .from('sessions')
    .select('*, tutor:tutors(name), session_logs(*)')
    .eq('student_id', studentId)
    .gte('scheduled_at', pastWeekStart.toISOString())
    .lte('scheduled_at', now.toISOString())
    .in('status', ['completed', 'scheduled'])
    .order('scheduled_at');

  const sessions = (rawSessions ?? []).map((s: any) => ({
    scheduledAt:     s.scheduled_at,
    tutorName:       (s.tutor as any)?.name ?? '—',
    durationMinutes: s.duration_minutes,
    wentWell:        s.tutor_notes ?? s.session_logs?.[0]?.went_well ?? null,
    issues:          s.session_logs?.[0]?.issues ?? null,
  }));

  const { data: upcoming } = await supabase
    .from('sessions')
    .select('scheduled_at, tutor:tutors(name)')
    .eq('student_id', studentId)
    .eq('status', 'scheduled')
    .gt('scheduled_at', now.toISOString())
    .order('scheduled_at')
    .limit(1);

  const next = (upcoming?.[0] as any) ?? null;
  const weekLabel = `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;
  const remaining = (student.purchased_hours ?? 0) - (student.used_hours ?? 0);

  const sessionRows = sessions.length === 0
    ? `<tr><td colspan="3" style="padding:12px;color:#9ca3af;font-size:14px;text-align:center;">No sessions this week.</td></tr>`
    : sessions.map(s => `
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:10px 16px;font-size:14px;color:#374151;">${format(new Date(s.scheduledAt), 'EEE, MMM d')}</td>
          <td style="padding:10px 16px;font-size:14px;color:#374151;">${s.tutorName}</td>
          <td style="padding:10px 16px;font-size:14px;color:#374151;">${s.durationMinutes} min${s.wentWell ? `<br><span style="color:#6b7280;font-size:13px;">${s.wentWell.slice(0, 100)}${s.wentWell.length > 100 ? '…' : ''}</span>` : ''}</td>
        </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
    .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.08);}
    .header{background:${NAVY};padding:24px 32px;}
    .header h1{color:#fff;margin:0;font-size:22px;font-weight:700;}
    .header p{color:#9ab0ff;margin:4px 0 0;font-size:13px;}
    .body{padding:32px;}
    .footer{padding:20px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;text-align:center;}
    table{border-collapse:collapse;width:100%;}
    th{background:#f9fafb;padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;}
  </style></head><body><div class="wrap">
    <div class="header"><h1>StudyCore</h1><p>Weekly Progress Report · ${weekLabel}</p></div>
    <div class="body">
      <h2 style="color:#111827;margin:0 0 8px;font-size:18px;">Weekly update for ${student.name}</h2>
      <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Here's a summary of ${student.name}'s tutoring activity this week.</p>

      <p style="font-weight:600;color:#111827;margin-bottom:8px;">Sessions this week</p>
      <table style="margin-bottom:24px;border:1px solid #f3f4f6;border-radius:6px;overflow:hidden;">
        <thead><tr><th>Date</th><th>Tutor</th><th>Summary</th></tr></thead>
        <tbody>${sessionRows}</tbody>
      </table>

      <div style="background:#f0f4ff;border:1px solid #c3d1ff;border-radius:6px;padding:16px 20px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px;">
          <span style="color:#6b7280;">Hours remaining</span>
          <span style="color:#111827;font-weight:600;">${remaining.toFixed(1)} / ${student.purchased_hours}</span>
        </div>
        ${next ? `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px;">
          <span style="color:#6b7280;">Next session</span>
          <span style="color:#111827;font-weight:600;">${format(new Date(next.scheduled_at), 'EEE, MMM d h:mm a')} with ${(next.tutor as any)?.name ?? '—'}</span>
        </div>` : ''}
      </div>

      <p style="color:#6b7280;font-size:13px;margin:0;">Questions? Reply to this email or contact info@studycore.net.</p>
    </div>
    <div class="footer">&copy; 2025 StudyCore. All rights reserved.</div>
  </div></body></html>`;

  const { error } = await resend.emails.send({
    from: FROM,
    to: [student.parent_email, ...(student.email !== student.parent_email ? [student.email] : [])],
    subject: `[Test] Weekly progress report: ${student.name} — ${weekLabel}`,
    html,
  });

  if (error) return { sent: false, error: error.message };
  return { sent: true };
}

async function main() {
  const results: { step: string; passed: boolean; detail: string }[] = [];
  function pass(step: string, detail = '') { results.push({ step, passed: true, detail }); console.log(`  ✅ PASS  ${step}${detail ? ' — ' + detail : ''}`); }
  function fail(step: string, detail = '') { results.push({ step, passed: false, detail }); console.log(`  ❌ FAIL  ${step}${detail ? ' — ' + detail : ''}`); }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Feature 4 Test — Weekly Progress Reports');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let studentId: string | null = null;
  let tutorId: string | null = null;
  let sessionId: string | null = null;
  let contractId: string | null = null;

  // ── Setup ────────────────────────────────────────────────────────────────
  try {
    const { data: s, error: sErr } = await supabase.from('students')
      .insert({ name: 'Weekly Test Student', email: TEST_EMAIL, parent_email: TEST_EMAIL, grade: 11, status: 'active', purchased_hours: 20, used_hours: 6, target_score: 1400, current_score: 1250 })
      .select('id').single();
    if (sErr) throw new Error(sErr.message);
    studentId = s!.id;

    const { data: t, error: tErr } = await supabase.from('tutors')
      .insert({ name: 'Weekly Test Tutor', email: 'weeklytesttutor@studycore.test', hourly_rate: 25 })
      .select('id').single();
    if (tErr) throw new Error(tErr.message);
    tutorId = t!.id;

    const { data: c, error: cErr } = await supabase.from('contracts')
      .insert({ student_id: studentId, tutor_id: tutorId, hourly_rate: 25, status: 'signed', tutor_signature: 'Weekly Test Tutor', signed_at: new Date().toISOString() })
      .select('id').single();
    if (cErr) throw new Error(cErr.message);
    contractId = c!.id;

    const sessionAt = subDays(new Date(), 2).toISOString();
    const { data: sess, error: sessErr } = await supabase.from('sessions')
      .insert({
        student_id: studentId,
        tutor_id: tutorId,
        scheduled_at: sessionAt,
        duration_minutes: 90,
        status: 'completed',
        tutor_notes: 'Reviewed reading comprehension strategies. Worked through 3 full passages with annotation technique.',
        session_rating: 4,
        notes_submitted_at: new Date().toISOString(),
      })
      .select('id').single();
    if (sessErr) throw new Error(sessErr.message);
    sessionId = sess!.id;
    console.log(`  Setup: student=${studentId?.slice(0, 8)}, session=${sessionId?.slice(0, 8)}\n`);
  } catch (e: any) {
    fail('Setup test data', e.message);
    process.exit(1);
  }

  // ── Step 1: Cron schedule is correct ──────────────────────────────────────
  console.log('── Step 1: Cron schedule (Sunday 8pm EST = Mon 1am UTC)');
  try {
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));
    const weeklyJob = vercel.crons.find((c: any) => c.path === '/api/cron/weekly-report');
    if (weeklyJob?.schedule === '0 1 * * 1') pass('Cron schedule correct', weeklyJob.schedule);
    else fail('Cron schedule correct', `got: ${weeklyJob?.schedule}`);
  } catch (e: any) { fail('Cron schedule', e.message); }

  // ── Step 2: Active student with signed contract found ────────────────────
  console.log('\n── Step 2: Active student with signed contract');
  try {
    const { data: contracts } = await supabase.from('contracts').select('student_id').eq('status', 'signed').eq('student_id', studentId!);
    if (contracts && contracts.length > 0) pass('Signed contract found', `student ${studentId!.slice(0, 8)}`);
    else fail('Signed contract found', 'no contracts returned');
  } catch (e: any) { fail('Contract query', e.message); }

  // ── Step 3: Sessions from past week retrieved ─────────────────────────────
  console.log('\n── Step 3: Sessions from past week retrieved');
  try {
    const pastWeekStart = subDays(new Date(), 7).toISOString();
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, tutor_notes')
      .eq('student_id', studentId!)
      .gte('scheduled_at', pastWeekStart)
      .eq('id', sessionId!);
    if (sessions && sessions.length > 0 && sessions[0].tutor_notes) pass('Session with tutor_notes found', sessions[0].tutor_notes.slice(0, 40) + '…');
    else fail('Session found', JSON.stringify(sessions));
  } catch (e: any) { fail('Session query', e.message); }

  // ── Step 4: Send weekly report email ─────────────────────────────────────
  console.log('\n── Step 4: Send weekly report email');
  try {
    const { sent, error } = await runWeeklyReportForStudent(studentId!);
    if (sent) pass('Weekly report email sent', `to ${TEST_EMAIL}`);
    else fail('Weekly report email', error ?? 'unknown error');
  } catch (e: any) { fail('Send weekly report', e.message); }

  // ── Step 5: session-reports cron also registered ─────────────────────────
  console.log('\n── Step 5: session-reports cron registered');
  try {
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));
    const reportJob = vercel.crons.find((c: any) => c.path === '/api/cron/session-reports');
    if (reportJob) pass('session-reports cron registered', reportJob.schedule);
    else fail('session-reports cron registered', 'not found in vercel.json');
  } catch (e: any) { fail('Cron config', e.message); }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log('\n── Cleanup');
  try {
    if (sessionId)  await supabase.from('sessions').delete().eq('id', sessionId);
    if (contractId) await supabase.from('contracts').delete().eq('id', contractId);
    if (studentId)  await supabase.from('students').delete().eq('id', studentId);
    if (tutorId)    await supabase.from('tutors').delete().eq('id', tutorId);
    pass('Cleanup');
  } catch (e: any) { fail('Cleanup', e.message); }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  console.log('\n═══════════════════════════════════════════════════════════════');
  for (const r of results) console.log(`  ${r.passed ? '✅' : '❌'}  ${r.step}${r.detail ? ' — ' + r.detail : ''}`);
  console.log(`\n  ${passed}/${results.length} passed`);
  console.log(passed === results.length ? '  🎉 Feature 4 PASS' : '  ⚠️  Feature 4 FAIL');
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
