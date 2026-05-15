/**
 * Part B — Financial impact of duplicate sessions.
 * Reports current vs deduped figures for:
 *   1. Tutor minutes (last 30 days)
 *   2. Student minutes consumed (last 30 days)
 *   3. NPS surveys triggered by inflated counts
 *   4. Invoices (manual-entry check)
 *   5. Payroll run inflation
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/audit-financial-impact.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const WINDOW_DAYS = 30;
const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

type Row = Record<string, any>;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchAll(
  table: string,
  selectCols: string,
  filters: (q: any) => any = q => q,
): Promise<Row[]> {
  const all: Row[] = [];
  let page = 0;
  while (true) {
    let q = supabase.from(table).select(selectCols);
    q = filters(q);
    q = q.order('id').range(page * 1000, page * 1000 + 999);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    page++;
  }
  return all;
}

// Build duplicate map: returns Set of non-earliest session IDs
function buildDuplicateSet(sessions: Row[]): Set<string> {
  const groups = new Map<string, Row[]>();
  for (const s of sessions) {
    const key = `${s.student_id}|${s.tutor_id ?? 'NULL'}|${s.scheduled_at}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  const dupes = new Set<string>();
  for (const rows of groups.values()) {
    if (rows.length > 1) {
      rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      for (const r of rows.slice(1)) dupes.add(r.id);
    }
  }
  return dupes;
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nLoading sessions (all time, for duplicate detection)…`);

  // Load ALL sessions for duplicate detection
  const allSessions = await fetchAll(
    'sessions',
    'id, student_id, tutor_id, scheduled_at, created_at, status, duration_minutes, actual_duration_minutes, payment_status',
    q => q,
  );
  console.log(`  Total sessions: ${allSessions.length}`);

  const dupeSet = buildDuplicateSet(allSessions);
  console.log(`  Non-earliest duplicate IDs: ${dupeSet.size}`);

  // Load tutors for name lookup
  const tutors = await fetchAll('tutors', 'id, name, hourly_rate');
  const tutorMap = new Map<string, Row>(tutors.map(t => [t.id, t]));

  // Load students for name lookup
  const students = await fetchAll('students', 'id, name, purchased_hours, used_hours');
  const studentMap = new Map<string, Row>(students.map(s => [s.id, s]));

  // ── 1. TUTOR MINUTES — last 30 days ──────────────────────────────────────
  console.log(`\n── Section 1: Tutor minutes (last ${WINDOW_DAYS} days) ──`);

  const recent = allSessions.filter(
    s => new Date(s.scheduled_at) >= windowStart && s.status === 'completed',
  );

  // Minute picker: prefer actual_duration_minutes, fallback to duration_minutes
  const mins = (s: Row) => (s.actual_duration_minutes ?? s.duration_minutes ?? 0) as number;

  const tutorCurrentMin = new Map<string, number>();
  const tutorDedupedMin = new Map<string, number>();
  for (const s of recent) {
    if (!s.tutor_id) continue;
    tutorCurrentMin.set(s.tutor_id, (tutorCurrentMin.get(s.tutor_id) ?? 0) + mins(s));
    if (!dupeSet.has(s.id)) {
      tutorDedupedMin.set(s.tutor_id, (tutorDedupedMin.get(s.tutor_id) ?? 0) + mins(s));
    }
  }

  const tutorRows: { name: string; rate: number; currentMin: number; dedupedMin: number; currentAmt: number; dedupedAmt: number }[] = [];
  let totalCurrentMin = 0, totalDedupedMin = 0;
  let totalCurrentAmt = 0, totalDedupedAmt = 0;

  for (const [tutorId, curMin] of tutorCurrentMin) {
    const t = tutorMap.get(tutorId);
    const name = t?.name ?? tutorId;
    const rate = Number(t?.hourly_rate ?? 0);
    const dedMin = tutorDedupedMin.get(tutorId) ?? 0;
    const curAmt = (curMin / 60) * rate;
    const dedAmt = (dedMin / 60) * rate;
    tutorRows.push({ name, rate, currentMin: curMin, dedupedMin: dedMin, currentAmt: curAmt, dedupedAmt: dedAmt });
    totalCurrentMin += curMin;
    totalDedupedMin += dedMin;
    totalCurrentAmt += curAmt;
    totalDedupedAmt += dedAmt;
  }

  tutorRows.sort((a, b) => (b.currentMin - a.currentMin));

  console.log('\nTutor-by-tutor breakdown:');
  console.log('─'.repeat(90));
  console.log('Tutor'.padEnd(28) + 'Rate'.padEnd(8) + 'Curr min'.padEnd(12) + 'Dedup min'.padEnd(12) + 'Curr $'.padEnd(12) + 'Dedup $'.padEnd(12) + 'Inflation');
  console.log('─'.repeat(90));
  for (const r of tutorRows) {
    const inflMin = r.currentMin - r.dedupedMin;
    if (inflMin === 0 && r.currentMin === 0) continue; // skip zero-activity tutors
    console.log(
      r.name.slice(0, 27).padEnd(28) +
      `$${r.rate}/hr`.padEnd(8) +
      fmtMin(r.currentMin).padEnd(12) +
      fmtMin(r.dedupedMin).padEnd(12) +
      `$${r.currentAmt.toFixed(2)}`.padEnd(12) +
      `$${r.dedupedAmt.toFixed(2)}`.padEnd(12) +
      (inflMin > 0 ? `+${fmtMin(inflMin)} / +$${(r.currentAmt - r.dedupedAmt).toFixed(2)}` : '—')
    );
  }
  console.log('─'.repeat(90));
  console.log(
    'TOTAL'.padEnd(28) + ''.padEnd(8) +
    fmtMin(totalCurrentMin).padEnd(12) + fmtMin(totalDedupedMin).padEnd(12) +
    `$${totalCurrentAmt.toFixed(2)}`.padEnd(12) + `$${totalDedupedAmt.toFixed(2)}`.padEnd(12) +
    `+${fmtMin(totalCurrentMin - totalDedupedMin)} / +$${(totalCurrentAmt - totalDedupedAmt).toFixed(2)}`
  );

  // ── 2. STUDENT MINUTES — last 30 days ────────────────────────────────────
  console.log('\n\n── Section 2: Student minutes consumed (last 30 days) ──');

  const studentCurrentMin = new Map<string, number>();
  const studentDedupedMin = new Map<string, number>();
  for (const s of recent) {
    studentCurrentMin.set(s.student_id, (studentCurrentMin.get(s.student_id) ?? 0) + mins(s));
    if (!dupeSet.has(s.id)) {
      studentDedupedMin.set(s.student_id, (studentDedupedMin.get(s.student_id) ?? 0) + mins(s));
    }
  }

  const studentRows: { name: string; currentMin: number; dedupedMin: number; purchased_hours: number; used_hours: number }[] = [];
  let stuTotalCurMin = 0, stuTotalDedMin = 0;
  for (const [sid, curMin] of studentCurrentMin) {
    const st = studentMap.get(sid);
    const dedMin = studentDedupedMin.get(sid) ?? 0;
    studentRows.push({
      name: st?.name ?? sid,
      currentMin: curMin,
      dedupedMin: dedMin,
      purchased_hours: Number(st?.purchased_hours ?? 0),
      used_hours: Number(st?.used_hours ?? 0),
    });
    stuTotalCurMin += curMin;
    stuTotalDedMin += dedMin;
  }

  studentRows.sort((a, b) => b.currentMin - a.currentMin);

  console.log('\nStudent-by-student breakdown (only those with inflation):');
  console.log('─'.repeat(100));
  console.log('Student'.padEnd(28) + 'Curr min'.padEnd(12) + 'Dedup min'.padEnd(12) + 'Inflation min'.padEnd(16) + 'Purch hrs'.padEnd(12) + 'Used hrs (DB)');
  console.log('─'.repeat(100));
  let inflatedStudentCount = 0;
  for (const r of studentRows) {
    const inflMin = r.currentMin - r.dedupedMin;
    if (inflMin === 0) continue;
    inflatedStudentCount++;
    console.log(
      r.name.slice(0, 27).padEnd(28) +
      fmtMin(r.currentMin).padEnd(12) +
      fmtMin(r.dedupedMin).padEnd(12) +
      `+${fmtMin(inflMin)}`.padEnd(16) +
      `${r.purchased_hours}h`.padEnd(12) +
      `${r.used_hours}h`
    );
  }
  console.log('─'.repeat(100));
  console.log(
    `TOTAL (${inflatedStudentCount} inflated students)`.padEnd(28) +
    fmtMin(stuTotalCurMin).padEnd(12) + fmtMin(stuTotalDedMin).padEnd(12) +
    `+${fmtMin(stuTotalCurMin - stuTotalDedMin)}`
  );
  console.log('\nNote: students.used_hours is a stored counter that may also be inflated.');

  // ── 3. NPS SURVEYS ────────────────────────────────────────────────────────
  console.log('\n\n── Section 3: NPS surveys triggered by inflated counts ──');
  console.log('NPS trigger rule: send when completed-session count is divisible by 4.');
  console.log('Affected if: real_count < 4k but inflated_count >= 4k for same k.');

  // Build per-student completed session counts (all time, not just 30 days)
  const completedByStudent = new Map<string, { all: number; deduped: number }>();
  for (const s of allSessions) {
    if (s.status !== 'completed') continue;
    const entry = completedByStudent.get(s.student_id) ?? { all: 0, deduped: 0 };
    entry.all++;
    if (!dupeSet.has(s.id)) entry.deduped++;
    completedByStudent.set(s.student_id, entry);
  }

  const npsSurveys = await fetchAll('nps_surveys', 'id, student_id, sent_at, score, responded_at', q => q.order('sent_at'));

  const npsAffected: { studentName: string; surveyId: string; sentAt: string; inflatedCount: string; realCount: string; milestone: number }[] = [];

  // For each survey, determine the inflated count at the time it was sent.
  // We can't reconstruct exact historical counts, but we can check: does the student
  // have inflated completed sessions now? If so, and if a milestone was reached due to
  // inflation, flag it.
  // Strategy: for each student, compute max milestone reachable with real count vs inflated.
  for (const [studentId, counts] of completedByStudent) {
    const inflatedMilestone = Math.floor(counts.all / 4);
    const realMilestone = Math.floor(counts.deduped / 4);
    if (inflatedMilestone <= realMilestone) continue; // no inflation at milestone level

    // Find surveys sent for this student
    const studentSurveys = npsSurveys.filter(s => s.student_id === studentId);
    const studentName = studentMap.get(studentId)?.name ?? studentId;

    // Each excess milestone = one survey that shouldn't have been sent
    const excessMilestones = inflatedMilestone - realMilestone;
    // The surveys beyond the real milestone were triggered by inflation
    const excessSurveys = studentSurveys.slice(realMilestone); // surveys beyond real trigger count

    if (excessSurveys.length > 0) {
      for (const sv of excessSurveys) {
        npsAffected.push({
          studentName,
          surveyId: sv.id,
          sentAt: sv.sent_at?.slice(0, 10) ?? '?',
          inflatedCount: `${counts.all} (milestone ${inflatedMilestone * 4})`,
          realCount: `${counts.deduped} (milestone ${realMilestone * 4})`,
          milestone: inflatedMilestone,
        });
      }
    } else if (excessMilestones > 0) {
      // Milestone inflation exists but no survey sent yet — future NPS would fire early
      npsAffected.push({
        studentName,
        surveyId: '(not yet sent)',
        sentAt: '—',
        inflatedCount: `${counts.all} → milestone ${inflatedMilestone * 4}`,
        realCount: `${counts.deduped} → milestone ${realMilestone * 4}`,
        milestone: inflatedMilestone,
      });
    }
  }

  if (npsAffected.length === 0) {
    console.log('\n✅ No NPS surveys triggered by inflated counts.');
  } else {
    console.log(`\n⚠️  ${npsAffected.length} NPS issue(s) found:\n`);
    console.log('─'.repeat(110));
    console.log('Student'.padEnd(24) + 'Survey ID'.padEnd(38) + 'Sent'.padEnd(12) + 'Inflated count'.padEnd(28) + 'Real count');
    console.log('─'.repeat(110));
    for (const r of npsAffected) {
      console.log(
        r.studentName.slice(0, 23).padEnd(24) +
        r.surveyId.slice(0, 37).padEnd(38) +
        r.sentAt.padEnd(12) +
        r.inflatedCount.padEnd(28) +
        r.realCount
      );
    }
    console.log('─'.repeat(110));
  }

  // ── 4. INVOICES ───────────────────────────────────────────────────────────
  console.log('\n\n── Section 4: Invoices ──');
  console.log('Note: Invoice amounts are manually entered by admins (no auto-calculation from sessions).');

  const invoices = await fetchAll(
    'invoices',
    'id, student_id, period_start, period_end, amount, status, created_at, notes',
    q => q.order('created_at', { ascending: false }),
  );

  console.log(`\nTotal invoices in DB: ${invoices.length}`);

  // Invoices created while duplicates existed — bulk imports happened 2026-04-29 and 2026-05-12
  // (from timestamps seen in previous audits)
  const DUPE_BLEED_START = new Date('2026-04-01'); // conservative earliest bleed date
  const dupeEraInvoices = invoices.filter(inv => new Date(inv.created_at) >= DUPE_BLEED_START);

  console.log(`Invoices created after duplicate bleed start (~2026-04-01): ${dupeEraInvoices.length}`);

  if (dupeEraInvoices.length === 0) {
    console.log('✅ No invoices generated during the duplicate period.');
  } else {
    console.log('\nInvoices from the duplicate era (amounts are manually set — review needed):');
    console.log('─'.repeat(100));
    console.log('Invoice ID'.padEnd(38) + 'Student'.padEnd(24) + 'Period'.padEnd(24) + 'Amount'.padEnd(10) + 'Status');
    console.log('─'.repeat(100));
    for (const inv of dupeEraInvoices) {
      const studentName = studentMap.get(inv.student_id)?.name ?? inv.student_id;
      const period = `${inv.period_start} → ${inv.period_end}`;
      console.log(
        inv.id.padEnd(38) +
        studentName.slice(0, 23).padEnd(24) +
        period.slice(0, 23).padEnd(24) +
        `$${Number(inv.amount).toFixed(2)}`.padEnd(10) +
        inv.status
      );
    }
    console.log('─'.repeat(100));
    console.log('⚠️  Cannot auto-verify invoice amounts — they are manually entered.');
    console.log('   Manual review: confirm each invoice amount matches deduped session count × rate.');
  }

  // ── 5. PAYROLL RUNS ───────────────────────────────────────────────────────
  console.log('\n\n── Section 5: Payroll run inflation ──');

  const payrollRuns = await fetchAll(
    'payroll_runs',
    'id, period_start, period_end, generated_at, total_amount, status',
    q => q.order('generated_at', { ascending: false }),
  );

  console.log(`Total payroll runs in DB: ${payrollRuns.length}`);

  if (payrollRuns.length === 0) {
    console.log('No payroll runs found.');
  } else {
    // Load line items for inflation analysis
    const lineItems = await fetchAll(
      'payroll_line_items',
      'id, payroll_run_id, tutor_id, sessions_count, total_minutes, hourly_rate, amount_owed, status',
      q => q,
    );

    const linesByRun = new Map<string, Row[]>();
    for (const li of lineItems) {
      if (!linesByRun.has(li.payroll_run_id)) linesByRun.set(li.payroll_run_id, []);
      linesByRun.get(li.payroll_run_id)!.push(li);
    }

    console.log('\nPayroll run breakdown (vs deduped tutor minutes in same period):');
    console.log('─'.repeat(120));
    console.log(
      'Run ID (short)'.padEnd(12) + 'Period'.padEnd(26) + 'Status'.padEnd(10) +
      'Recorded sessions'.padEnd(20) + 'Recorded min'.padEnd(15) + 'Recorded $'.padEnd(14) +
      'Deduped min (est)'.padEnd(20) + 'Est inflation $'
    );
    console.log('─'.repeat(120));

    for (const run of payrollRuns) {
      const lines = linesByRun.get(run.id) ?? [];
      const recordedSessions = lines.reduce((s, l) => s + (l.sessions_count ?? 0), 0);
      const recordedMin = lines.reduce((s, l) => s + (l.total_minutes ?? 0), 0);
      const recordedAmt = Number(run.total_amount);

      // Compute deduped minutes for each tutor in the period
      const periodStart = new Date(run.period_start + 'T00:00:00Z');
      const periodEnd   = new Date(run.period_end   + 'T23:59:59Z');

      const sessionsInPeriod = allSessions.filter(s => {
        const t = new Date(s.scheduled_at);
        return t >= periodStart && t <= periodEnd && s.status === 'completed' && s.tutor_id;
      });

      // Deduped minutes per tutor in period
      const dedupedMinByTutor = new Map<string, number>();
      for (const s of sessionsInPeriod) {
        if (dupeSet.has(s.id)) continue;
        dedupedMinByTutor.set(s.tutor_id, (dedupedMinByTutor.get(s.tutor_id) ?? 0) + mins(s));
      }

      // Re-compute payroll amount with deduped minutes
      let dedupedAmt = 0;
      for (const li of lines) {
        const dedMin = dedupedMinByTutor.get(li.tutor_id) ?? 0;
        const rate = Number(li.hourly_rate);
        dedupedAmt += (dedMin / 60) * rate;
      }

      const dedupedMin = [...dedupedMinByTutor.values()].reduce((s, v) => s + v, 0);
      const inflation = recordedAmt - dedupedAmt;

      const period = `${run.period_start} → ${run.period_end}`;
      console.log(
        run.id.slice(0, 11).padEnd(12) +
        period.slice(0, 25).padEnd(26) +
        run.status.padEnd(10) +
        String(recordedSessions).padEnd(20) +
        fmtMin(recordedMin).padEnd(15) +
        `$${recordedAmt.toFixed(2)}`.padEnd(14) +
        fmtMin(dedupedMin).padEnd(20) +
        (inflation > 0.01 ? `⚠️  +$${inflation.toFixed(2)}` : inflation < -0.01 ? `(data gap: -$${Math.abs(inflation).toFixed(2)})` : '✅ clean')
      );

      // Per-tutor breakdown for runs with inflation
      if (inflation > 0.01 && lines.length > 0) {
        for (const li of lines) {
          const t = tutorMap.get(li.tutor_id);
          const tName = t?.name ?? li.tutor_id;
          const recMin = li.total_minutes ?? 0;
          const dedMin = dedupedMinByTutor.get(li.tutor_id) ?? 0;
          const inflMin = recMin - dedMin;
          if (inflMin <= 0) continue;
          const rate = Number(li.hourly_rate);
          const inflAmt = (inflMin / 60) * rate;
          console.log(`  ↳ ${tName}: recorded ${fmtMin(recMin)} / deduped ${fmtMin(dedMin)} → +${fmtMin(inflMin)} / +$${inflAmt.toFixed(2)}`);
        }
      }
    }
    console.log('─'.repeat(120));
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('PART B COMPLETE — stop here, await approval for Part D.');
  console.log('══════════════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error(e); process.exit(1); });
