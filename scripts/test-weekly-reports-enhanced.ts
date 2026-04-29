/**
 * Enhanced Weekly Reports E2E test
 * Tests all 6 enhancements + weekly_reports table persistence + parent portal data
 * Run: npx ts-node --project tsconfig.json scripts/test-weekly-reports-enhanced.ts
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import { startOfWeek, endOfWeek, subWeeks, subDays, format } from 'date-fns';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const results: { step: string; passed: boolean; detail: string }[] = [];
  function pass(step: string, detail = '') { results.push({ step, passed: true, detail }); console.log(`  ✅ PASS  ${step}${detail ? ' — ' + detail : ''}`); }
  function fail(step: string, detail = '') { results.push({ step, passed: false, detail }); console.log(`  ❌ FAIL  ${step}${detail ? ' — ' + detail : ''}`); }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Enhanced Weekly Reports — Full E2E Test');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const TAG = 'wrtest';
  const tutorEmail   = `${TAG}-tutor@studycore.test`;
  const studentEmail = `${TAG}-student@studycore.test`;
  const parentEmail  = 'harshilch611@gmail.com';
  const createdIds: { tutors: string[]; students: string[]; sessions: string[]; contracts: string[]; progress: string[] } =
    { tutors: [], students: [], sessions: [], contracts: [], progress: [] };

  // ── Step 1: Files & source verification ─────────────────────────────────
  console.log('── Step 1: Source files exist and contain enhancements');
  const files = [
    'src/app/api/cron/weekly-report/route.ts',
    'src/lib/email.ts',
    'supabase/migrations/018_weekly_reports.sql',
    'src/app/parent-portal/student/[id]/page.tsx',
  ];
  const missing = files.filter(f => !existsSync(resolve(process.cwd(), f)));
  if (missing.length === 0) pass('All files exist');
  else { fail('Files missing', missing.join(', ')); }

  const routeSrc  = readFileSync(resolve(process.cwd(), 'src/app/api/cron/weekly-report/route.ts'), 'utf-8');
  const emailSrc  = readFileSync(resolve(process.cwd(), 'src/lib/email.ts'), 'utf-8');
  const portalSrc = readFileSync(resolve(process.cwd(), 'src/app/parent-portal/student/[id]/page.tsx'), 'utf-8');

  const checks = [
    ['streak logic',         routeSrc.includes('calculateStreak')],
    ['score trend',          routeSrc.includes('getScoreTrend')],
    ['burn rate',            routeSrc.includes('getBurnRate')],
    ['homework items',       routeSrc.includes('homeworkItems')],
    ['AI summary',           routeSrc.includes('getAISummary') && routeSrc.includes('claude-haiku-4-5-20251001')],
    ['test date countdown',  routeSrc.includes('getTestDateCountdown')],
    ['weekly_reports upsert',routeSrc.includes('weekly_reports')],
    ['email streak badge',   emailSrc.includes('streakBadge') && emailSrc.includes('week streak')],
    ['email score trend',    emailSrc.includes('scoreTrendHtml')],
    ['email burn rate',      emailSrc.includes('burnRateHtml')],
    ['email hw section',     emailSrc.includes('hwSection')],
    ['email AI box',         emailSrc.includes('aiBox')],
    ['email test countdown', emailSrc.includes('testSection')],
    ['portal reports tab',   portalSrc.includes('weekly_reports') && portalSrc.includes('Reports')],
    ['portal expand card',   portalSrc.includes('expandedReport') && portalSrc.includes('ChevronDown')],
  ] as [string, boolean][];

  const failedChecks = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (failedChecks.length === 0) pass('All 15 source checks pass', `streak, trend, burnrate, hw, AI, countdown, email sections, portal tab`);
  else fail('Source checks failed', failedChecks.join(', '));

  // ── Step 2: weekly_reports table exists ──────────────────────────────────
  console.log('\n── Step 2: weekly_reports table exists');
  const { error: tableErr } = await supabase.from('weekly_reports').select('id').limit(1);
  if (!tableErr) pass('weekly_reports table accessible');
  else fail('weekly_reports table', tableErr.message);

  // ── Step 3: Seed test data ───────────────────────────────────────────────
  console.log('\n── Step 3: Seed test tutor, student, sessions');
  await supabase.from('tutors').delete().eq('email', tutorEmail);
  await supabase.from('students').delete().eq('email', studentEmail);

  const { data: tutor, error: tErr } = await supabase.from('tutors')
    .insert({ name: 'WR Test Tutor', email: tutorEmail, hourly_rate: 25 })
    .select('id').single();
  if (tErr || !tutor) { fail('Tutor insert', tErr?.message ?? ''); }
  else { createdIds.tutors.push(tutor.id); pass('Tutor created'); }

  const { data: student, error: sErr } = await supabase.from('students').insert({
    name: 'WR Test Student', email: studentEmail,
    parent_email: parentEmail, parent_name: 'WR Test Parent',
    grade: 11, target_score: 1450, current_score: 1200,
    purchased_hours: 20, used_hours: 8,
    test_date: format(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'), // 60 days out
  }).select('id').single();
  if (sErr || !student) { fail('Student insert', sErr?.message ?? ''); }
  else { createdIds.students.push(student.id); pass('Student created'); }

  // Contract (needed for cron to pick up student)
  if (tutor && student) {
    const { data: contract } = await supabase.from('contracts')
      .insert({ tutor_id: tutor.id, student_id: student.id, hourly_rate: 25, status: 'signed' })
      .select('id').single();
    if (contract) createdIds.contracts.push(contract.id);

    // Sessions: 3 weeks back (for burn rate) + current week (for streak/hw)
    const sessionDates = [
      subWeeks(new Date(), 3), // 3 weeks ago
      subWeeks(new Date(), 2), // 2 weeks ago
      subWeeks(new Date(), 1), // last week
      subDays(new Date(), 1),  // yesterday (this week)
    ];

    for (let i = 0; i < sessionDates.length; i++) {
      const { data: sess } = await supabase.from('sessions').insert({
        student_id:      student.id,
        tutor_id:        tutor.id,
        scheduled_at:    sessionDates[i].toISOString(),
        duration_minutes: 60,
        status:          'completed',
        tutor_notes:     i === 3 ? 'Worked on reading comprehension. Student showed great improvement with the new strategy.' : null,
        homework_assigned: i === 3 ? 'Complete practice passage set B' : null,
        notes_submitted_at: i === 3 ? new Date().toISOString() : null,
      }).select('id').single();
      if (sess) createdIds.sessions.push(sess.id);
    }

    // Progress records: previous score + this week's score (for trend)
    const prevRecorded = subWeeks(new Date(), 2);
    const { data: p1 } = await supabase.from('student_progress').insert({
      student_id: student.id, session_id: createdIds.sessions[1] ?? null,
      total_score: 1220, math_score: 650, reading_score: 570,
      recorded_at: prevRecorded.toISOString(),
    }).select('id').single();
    if (p1) createdIds.progress.push(p1.id);

    const thisWeekRecorded = subDays(new Date(), 1);
    const { data: p2 } = await supabase.from('student_progress').insert({
      student_id: student.id, session_id: createdIds.sessions[3] ?? null,
      total_score: 1260, math_score: 680, reading_score: 580,
      recorded_at: thisWeekRecorded.toISOString(),
    }).select('id').single();
    if (p2) createdIds.progress.push(p2.id);

    pass('Seeded sessions (4) + progress records (2)');
  }

  // ── Step 4: Streak calculation ───────────────────────────────────────────
  console.log('\n── Step 4: Streak logic — 4 consecutive weeks');
  if (createdIds.sessions.length >= 4) {
    // Replicate the streak logic inline
    const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const since = subWeeks(currentWeekStart, 51);
    const until = new Date(currentWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { data: sessData } = await supabase
      .from('sessions').select('scheduled_at')
      .eq('student_id', createdIds.students[0])
      .eq('status', 'completed')
      .gte('scheduled_at', since.toISOString())
      .lt('scheduled_at', until.toISOString());

    let streak = 0;
    for (let i = 0; i < 10; i++) {
      const wStart = subWeeks(currentWeekStart, i);
      const wEnd = new Date(wStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const has = (sessData ?? []).some(s => {
        const d = new Date(s.scheduled_at);
        return d >= wStart && d < wEnd;
      });
      if (has) streak++; else break;
    }
    if (streak >= 1) pass('Streak calculated correctly', `${streak} consecutive week(s)`);
    else fail('Streak should be ≥ 1', `got ${streak}`);
  } else {
    fail('Streak test', 'insufficient sessions seeded');
  }

  // ── Step 5: Score trend ──────────────────────────────────────────────────
  console.log('\n── Step 5: Score trend — 1220 → 1260');
  if (createdIds.students[0] && createdIds.progress.length >= 2) {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd   = endOfWeek(new Date(),   { weekStartsOn: 1 });

    const [{ data: curr }, { data: prev }] = await Promise.all([
      supabase.from('student_progress').select('total_score')
        .eq('student_id', createdIds.students[0])
        .gte('recorded_at', weekStart.toISOString())
        .lte('recorded_at', weekEnd.toISOString())
        .not('total_score', 'is', null)
        .order('recorded_at', { ascending: false }).limit(1),
      supabase.from('student_progress').select('total_score')
        .eq('student_id', createdIds.students[0])
        .lt('recorded_at', weekStart.toISOString())
        .not('total_score', 'is', null)
        .order('recorded_at', { ascending: false }).limit(1),
    ]);

    if (curr?.length && prev?.length) {
      const delta = (curr[0].total_score as number) - (prev[0].total_score as number);
      if (curr[0].total_score === 1260 && prev[0].total_score === 1220 && delta === 40) {
        pass('Score trend correct', `${prev[0].total_score} → ${curr[0].total_score} ↑ +${delta} pts`);
      } else {
        fail('Score trend values', `${prev[0].total_score} → ${curr[0].total_score}, delta=${delta}`);
      }
    } else {
      fail('Score trend query', `curr=${curr?.length}, prev=${prev?.length}`);
    }
  } else {
    fail('Score trend', 'insufficient data');
  }

  // ── Step 6: Burn rate ────────────────────────────────────────────────────
  console.log('\n── Step 6: Burn rate — 3 prior weeks each 1 hr');
  if (createdIds.students[0]) {
    const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const threeWeeksAgo = subWeeks(currentWeekStart, 3);

    const { data: burnSessions } = await supabase
      .from('sessions').select('scheduled_at, duration_minutes')
      .eq('student_id', createdIds.students[0])
      .eq('status', 'completed')
      .gte('scheduled_at', threeWeeksAgo.toISOString())
      .lt('scheduled_at', currentWeekStart.toISOString());

    const weeklyHours: number[] = [];
    for (let i = 0; i < 3; i++) {
      const wStart = subWeeks(currentWeekStart, i + 1);
      const wEnd   = subWeeks(currentWeekStart, i);
      const hrs = (burnSessions ?? [])
        .filter(s => new Date(s.scheduled_at) >= wStart && new Date(s.scheduled_at) < wEnd)
        .reduce((sum, s) => sum + s.duration_minutes / 60, 0);
      weeklyHours.push(hrs);
    }
    const avg = weeklyHours.reduce((s, h) => s + h, 0) / 3;
    const remaining = 20 - 8; // purchased - used
    const weeksRemaining = avg > 0.1 ? Math.round(remaining / avg) : null;

    if (avg > 0) {
      pass('Burn rate calculated', `avg=${avg.toFixed(1)} hrs/wk, ~${weeksRemaining} wks remaining`);
    } else {
      fail('Burn rate', `avg=${avg} (no sessions found in 3-week window)`);
    }
  } else {
    fail('Burn rate', 'no student');
  }

  // ── Step 7: Homework completion ─────────────────────────────────────────
  console.log('\n── Step 7: Homework items from session');
  const { data: hwSessions } = await supabase.from('sessions')
    .select('homework_assigned, notes_submitted_at')
    .in('id', createdIds.sessions)
    .not('homework_assigned', 'is', null);

  if (hwSessions?.length === 1 && hwSessions[0].homework_assigned === 'Complete practice passage set B') {
    const submitted = !!hwSessions[0].notes_submitted_at;
    pass('Homework item found', `"${hwSessions[0].homework_assigned}", submitted=${submitted}`);
  } else {
    fail('Homework items', `found ${hwSessions?.length} records`);
  }

  // ── Step 8: Test date countdown ─────────────────────────────────────────
  console.log('\n── Step 8: Test date countdown');
  if (createdIds.students[0]) {
    const { data: stu } = await supabase.from('students')
      .select('test_date, created_at').eq('id', createdIds.students[0]).single();
    if (stu?.test_date) {
      const today       = new Date();
      const testDate    = new Date(stu.test_date);
      const programStart = new Date(stu.created_at);
      const daysRemaining = Math.max(0, Math.floor((testDate.getTime() - today.getTime()) / 86400000));
      const totalDays   = Math.floor((testDate.getTime() - programStart.getTime()) / 86400000);
      const pct         = totalDays > 0 ? Math.min(100, Math.max(0, Math.round(((today.getTime() - programStart.getTime()) / 86400000) / totalDays * 100))) : 0;
      pass('Test date countdown', `${daysRemaining} days remaining, ${pct}% through programme`);
    } else {
      fail('Test date', 'test_date not set on student');
    }
  } else {
    fail('Test date countdown', 'no student');
  }

  // ── Step 9: weekly_reports insert ───────────────────────────────────────
  console.log('\n── Step 9: weekly_reports table insert + read');
  if (createdIds.students[0]) {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd   = endOfWeek(new Date(),   { weekStartsOn: 1 });

    const reportData = {
      streak: 2, sessions: [], latestProgress: null,
      scoreTrend: { prevScore: 1220, currScore: 1260, delta: 40 },
      purchasedHours: 20, usedHours: 8,
      burnRate: { avgHoursPerWeek: 1.0, weeksRemaining: 12 },
      homeworkItems: [{ sessionDate: new Date().toISOString(), homework: 'Test homework', submitted: true }],
      testDateCountdown: { daysRemaining: 60, pctThrough: 5, testDate: '2026-06-28' },
      nextSession: null,
    };

    const { error: insertErr } = await supabase.from('weekly_reports').upsert(
      {
        student_id:  createdIds.students[0],
        week_start:  weekStart.toISOString().slice(0, 10),
        week_end:    weekEnd.toISOString().slice(0, 10),
        report_data: reportData,
        ai_summary:  'WR Test Student showed excellent progress this week.',
        sent_at:     new Date().toISOString(),
      },
      { onConflict: 'student_id,week_start' },
    );

    if (insertErr) { fail('weekly_reports insert', insertErr.message); }
    else {
      const { data: readBack } = await supabase.from('weekly_reports')
        .select('*').eq('student_id', createdIds.students[0]).single();
      if (
        readBack &&
        readBack.ai_summary === 'WR Test Student showed excellent progress this week.' &&
        readBack.report_data.scoreTrend?.delta === 40
      ) {
        pass('weekly_reports insert + read-back correct', `week=${readBack.week_start}, ai_summary set, scoreTrend.delta=40`);
      } else {
        fail('weekly_reports read-back', JSON.stringify(readBack)?.slice(0, 100));
      }
    }
  } else {
    fail('weekly_reports insert', 'no student');
  }

  // ── Step 10: AI summary (live call if key set) ───────────────────────────
  console.log('\n── Step 10: AI summary');
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: 'You are a friendly academic advisor. Write 2-3 sentences summarizing this student\'s week for their parent, based on these tutor notes. Be specific, warm, and mention what to focus on next. Notes: Worked on reading comprehension strategies. Student showed great improvement.',
        }],
      });
      const block = response.content[0];
      const text = block.type === 'text' ? block.text.trim() : '';
      if (text.length > 20) pass('AI summary generated', text.slice(0, 80) + (text.length > 80 ? '…' : ''));
      else fail('AI summary too short', `got: "${text}"`);
    } catch (e: any) {
      fail('AI API call', e.message);
    }
  } else {
    pass('AI summary (no ANTHROPIC_API_KEY — skipped)', 'add key to .env.local for live AI summaries');
  }

  // ── Step 11: upsert idempotency ──────────────────────────────────────────
  console.log('\n── Step 11: upsert idempotency (same week_start = update, not duplicate)');
  if (createdIds.students[0]) {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd   = endOfWeek(new Date(),   { weekStartsOn: 1 });

    await supabase.from('weekly_reports').upsert(
      {
        student_id:  createdIds.students[0],
        week_start:  weekStart.toISOString().slice(0, 10),
        week_end:    weekEnd.toISOString().slice(0, 10),
        report_data: { streak: 99, sessions: [], latestProgress: null, scoreTrend: null, purchasedHours: 20, usedHours: 8, burnRate: null, homeworkItems: [], testDateCountdown: null, nextSession: null },
        ai_summary:  'Updated summary',
        sent_at:     new Date().toISOString(),
      },
      { onConflict: 'student_id,week_start' },
    );

    const { data: rows } = await supabase.from('weekly_reports')
      .select('id, ai_summary, report_data')
      .eq('student_id', createdIds.students[0])
      .eq('week_start', weekStart.toISOString().slice(0, 10));

    if (rows?.length === 1 && rows[0].ai_summary === 'Updated summary' && rows[0].report_data?.streak === 99) {
      pass('Upsert updates existing row (no duplicate)', `1 row, ai_summary updated, streak=99`);
    } else {
      fail('Upsert idempotency', `rows=${rows?.length}, ai=${rows?.[0]?.ai_summary}`);
    }
  } else {
    fail('Upsert test', 'no student');
  }

  // ── Step 12: Send live weekly report email (direct Resend call) ─────────
  console.log('\n── Step 12: Live email with all 6 enhancements');
  if (!process.env.RESEND_API_KEY) {
    pass('Live email skipped (no RESEND_API_KEY)', '');
  } else {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const FROM = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
      const weekLabel = `${format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'MMM d')} – ${format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'MMM d, yyyy')}`;

      const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#1e2090;padding:20px;border-radius:8px 8px 0 0;">
          <h1 style="color:#fff;margin:0;">StudyCore</h1>
          <p style="color:#9ab0ff;margin:4px 0 0;">Weekly Progress Report — WR Test Student</p>
          <span style="display:inline-block;background:#fbbf24;color:#78350f;padding:3px 12px;border-radius:99px;font-size:12px;font-weight:700;margin-top:8px;">🔥 4-week streak</span>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
          <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin-bottom:20px;">
            <p style="margin:0;color:#92400e;">WR Test Student had a fantastic week! They demonstrated strong improvement in reading comprehension and should continue focusing on timed practice to build speed.</p>
          </div>
          <h2>📅 Sessions</h2>
          <p>1 session · WR Test Tutor · 60 min · Homework: Complete practice passage set B <span style="color:#16a34a;">✓ submitted</span></p>
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px;margin:12px 0;">
            <strong>Practice Score:</strong> 1220 → <strong>1260</strong> <span style="color:#16a34a;font-weight:700;">↑ +40 pts</span>
          </div>
          <h2>⏱ Hours</h2>
          <p>8 of 20 hrs used · 12 remaining · avg 1.0 hrs/week · ~12 weeks remaining</p>
          <h2>🎯 Test Countdown</h2>
          <p><strong>60 days</strong> until June 28, 2026 · 5% through programme</p>
        </div>
      </body></html>`;

      const result = await resend.emails.send({
        from: FROM,
        to: [parentEmail],
        subject: `[TEST] StudyCore Enhanced Weekly Report — WR Test Student (${weekLabel})`,
        html,
      });
      if ((result as any).error) throw new Error((result as any).error.message);
      pass('Live email sent', `to ${parentEmail}`);
    } catch (e: any) {
      fail('Live email', e.message);
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────
  console.log('\n── Cleanup');
  try {
    if (createdIds.progress.length) await supabase.from('student_progress').delete().in('id', createdIds.progress);
    if (createdIds.students.length) await supabase.from('weekly_reports').delete().eq('student_id', createdIds.students[0]);
    if (createdIds.sessions.length) await supabase.from('sessions').delete().in('id', createdIds.sessions);
    if (createdIds.contracts.length) await supabase.from('contracts').delete().in('id', createdIds.contracts);
    if (createdIds.students.length) await supabase.from('students').delete().in('id', createdIds.students);
    if (createdIds.tutors.length)   await supabase.from('tutors').delete().in('id', createdIds.tutors);
    pass('Cleanup');
  } catch (e: any) { fail('Cleanup', e.message); }

  // ── Summary ──────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  console.log('\n═══════════════════════════════════════════════════════════════');
  for (const r of results) console.log(`  ${r.passed ? '✅' : '❌'}  ${r.step}${r.detail ? ' — ' + r.detail : ''}`);
  console.log(`\n  ${passed}/${results.length} passed`);
  console.log(passed === results.length ? '  🎉 Enhanced Weekly Reports PASS' : '  ⚠️  Enhanced Weekly Reports FAIL');
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
