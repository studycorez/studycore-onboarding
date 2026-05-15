/**
 * Checkpoint 3(c) — Post-dedup verification script.
 * Run AFTER dedup-execute.ts --commit to confirm the database is in a clean state.
 * Makes ZERO writes. Exits non-zero if any check fails.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/dedup-verify.ts
 *
 * Checks:
 *   1. No duplicate (student_id, tutor_id, scheduled_at) groups remain
 *   2. No session_recordings rows point at non-existent session IDs
 *   3. Every session has at most 1 is_primary recording
 *   4. used_hours matches the canonical sync-hours formula for all students
 *   5. low_hours_alerted is false for all students with remaining >= 5h
 *   6. No session has a null fathom_recording_url when its session_recordings has a URL
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Row = Record<string, any>;

// ── used_hours formula — mirrors /api/students/sync-hours/route.ts exactly ───
function computeUsedHours(totalMinutes: number): number {
  return Math.round((totalMinutes / 60) * 2) / 2;
}

// ── Pagination helper ─────────────────────────────────────────────────────────
async function fetchAll(table: string, select: string, filters: (q: any) => any = q => q): Promise<Row[]> {
  const all: Row[] = [];
  let page = 0;
  while (true) {
    let q = supabase.from(table).select(select);
    q = filters(q);
    q = q.range(page * 1000, page * 1000 + 999);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    page++;
  }
  return all;
}

// ─────────────────────────────────────────────────────────────────────────────

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
  failures?: string[];
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('CHECKPOINT 3(c) — POST-DEDUP VERIFICATION');
  console.log('══════════════════════════════════════════════════════════════\n');

  console.log('Loading data…');

  const [sessions, recordings, students] = await Promise.all([
    fetchAll('sessions', 'id, student_id, tutor_id, scheduled_at, status, duration_minutes, fathom_recording_url'),
    fetchAll('session_recordings', 'id, session_id, fathom_recording_id, fathom_recording_url, is_primary, duration_seconds'),
    fetchAll('students', 'id, name, used_hours, purchased_hours, low_hours_alerted'),
  ]);

  console.log(`  sessions: ${sessions.length} | recordings: ${recordings.length} | students: ${students.length}\n`);

  const sessionIds = new Set(sessions.map(s => s.id));
  const results: CheckResult[] = [];

  // ── Check 1: No duplicate groups remain ───────────────────────────────────
  {
    const groups = new Map<string, number>();
    for (const s of sessions) {
      const key = `${s.student_id}|${s.tutor_id ?? 'NULL'}|${s.scheduled_at}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    const dups = [...groups.entries()].filter(([, c]) => c > 1);
    const passed = dups.length === 0;
    results.push({
      name: 'CHECK 1: No duplicate (student_id, tutor_id, scheduled_at) groups',
      passed,
      detail: passed
        ? `All ${groups.size} unique (student, tutor, scheduled_at) triples — clean.`
        : `${dups.length} duplicate groups still present!`,
      failures: dups.slice(0, 10).map(([k, c]) => `  key=${k}  count=${c}`),
    });
  }

  // ── Check 2: No orphaned session_recordings rows ──────────────────────────
  {
    const orphans = recordings.filter(r => !sessionIds.has(r.session_id));
    const passed = orphans.length === 0;
    results.push({
      name: 'CHECK 2: No session_recordings rows pointing at missing sessions',
      passed,
      detail: passed
        ? `All ${recordings.length} recording rows have valid session_id references.`
        : `${orphans.length} orphaned recording rows found!`,
      failures: orphans.slice(0, 10).map(r => `  rec_id=${r.id.slice(0, 8)}… → session_id=${r.session_id.slice(0, 8)}… (missing)`),
    });
  }

  // ── Check 3: Each session has at most 1 is_primary recording ──────────────
  {
    const primaryCounts = new Map<string, number>();
    for (const r of recordings) {
      if (r.is_primary) primaryCounts.set(r.session_id, (primaryCounts.get(r.session_id) ?? 0) + 1);
    }
    const multiples = [...primaryCounts.entries()].filter(([, c]) => c > 1);
    const passed = multiples.length === 0;
    results.push({
      name: 'CHECK 3: Each session has at most 1 is_primary recording',
      passed,
      detail: passed
        ? 'No sessions have multiple is_primary recordings.'
        : `${multiples.length} sessions have multiple is_primary recordings!`,
      failures: multiples.slice(0, 10).map(([sid, c]) => `  session_id=${sid.slice(0, 8)}…  is_primary_count=${c}`),
    });
  }

  // ── Check 4: used_hours matches sync-hours formula ─────────────────────────
  {
    // Compute expected used_hours per student from current sessions
    const minByStudent = new Map<string, number>();
    for (const s of sessions) {
      if (s.status !== 'completed' && s.status !== 'no_show_student') continue;
      minByStudent.set(s.student_id, (minByStudent.get(s.student_id) ?? 0) + (s.duration_minutes ?? 0));
    }

    const mismatches: { name: string; stored: number; expected: number; diff: number }[] = [];
    for (const student of students) {
      const totalMin = minByStudent.get(student.id) ?? 0;
      const expected = computeUsedHours(totalMin);
      const stored = student.used_hours ?? 0;
      if (stored !== expected) {
        mismatches.push({ name: student.name, stored, expected, diff: stored - expected });
      }
    }
    mismatches.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    const passed = mismatches.length === 0;
    results.push({
      name: 'CHECK 4: students.used_hours matches sync-hours formula',
      passed,
      detail: passed
        ? `All ${students.length} students have correct used_hours.`
        : `${mismatches.length} students have mismatched used_hours!`,
      failures: mismatches.slice(0, 15).map(m =>
        `  ${m.name}: stored=${m.stored}h  expected=${m.expected}h  diff=${m.diff > 0 ? '+' : ''}${m.diff}h`
      ),
    });
  }

  // ── Check 5: low_hours_alerted is false where remaining >= 5h ─────────────
  {
    // Need per-student expected used_hours (same as check 4)
    const minByStudent = new Map<string, number>();
    for (const s of sessions) {
      if (s.status !== 'completed' && s.status !== 'no_show_student') continue;
      minByStudent.set(s.student_id, (minByStudent.get(s.student_id) ?? 0) + (s.duration_minutes ?? 0));
    }

    const wronglyAlerted: { name: string; remaining: number }[] = [];
    for (const student of students) {
      if (!student.low_hours_alerted) continue;
      const totalMin = minByStudent.get(student.id) ?? 0;
      const usedHours = computeUsedHours(totalMin);
      const remaining = (student.purchased_hours ?? 0) - usedHours;
      if (remaining >= 5) {
        wronglyAlerted.push({ name: student.name, remaining });
      }
    }

    const passed = wronglyAlerted.length === 0;
    results.push({
      name: 'CHECK 5: low_hours_alerted is false where remaining >= 5h',
      passed,
      detail: passed
        ? 'No students are incorrectly flagged as low-hours.'
        : `${wronglyAlerted.length} students still flagged low_hours_alerted but have >= 5h remaining!`,
      failures: wronglyAlerted.slice(0, 10).map(s => `  ${s.name}: remaining=${s.remaining.toFixed(1)}h`),
    });
  }

  // ── Check 6: No session missing fathom_recording_url when recordings has one
  {
    const recsBySession = new Map<string, Row[]>();
    for (const r of recordings) {
      if (!recsBySession.has(r.session_id)) recsBySession.set(r.session_id, []);
      recsBySession.get(r.session_id)!.push(r);
    }

    const missingUrl: { sessionId: string; recUrl: string }[] = [];
    for (const s of sessions) {
      if (s.fathom_recording_url) continue; // already has URL — fine
      const recs = recsBySession.get(s.id) ?? [];
      const recWithUrl = recs.find(r => r.fathom_recording_url);
      if (recWithUrl) {
        missingUrl.push({ sessionId: s.id, recUrl: recWithUrl.fathom_recording_url });
      }
    }

    const passed = missingUrl.length === 0;
    results.push({
      name: 'CHECK 6: sessions.fathom_recording_url in sync with session_recordings',
      passed,
      detail: passed
        ? 'All sessions have their URL populated when a recording URL exists.'
        : `${missingUrl.length} sessions have a recording URL but a null fathom_recording_url!`,
      failures: missingUrl.slice(0, 10).map(m =>
        `  session_id=${m.sessionId.slice(0, 8)}…  rec_url=…${m.recUrl.slice(-30)}`
      ),
    });
  }

  // ── Print results ──────────────────────────────────────────────────────────
  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon}  ${r.name}`);
    console.log(`     ${r.detail}`);
    if (!r.passed && r.failures && r.failures.length > 0) {
      for (const f of r.failures) console.log(f);
      if ((r.failures.length ?? 0) < 10) {/* shown all */}
      else console.log('     … (truncated to 10)');
    }
    console.log('');
    if (!r.passed) allPassed = false;
  }

  console.log('══════════════════════════════════════════════════════════════');
  if (allPassed) {
    console.log('✅  ALL CHECKS PASSED — dedup is complete and database is clean.');
  } else {
    const failCount = results.filter(r => !r.passed).length;
    console.log(`❌  ${failCount} CHECK(S) FAILED — review output above before proceeding.`);
  }
  console.log('══════════════════════════════════════════════════════════════\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
