/**
 * sync-hours-drifted.ts — Correct used_hours drift across all students.
 *
 * Default: DRY-RUN (prints every operation, makes no writes).
 * Pass --commit to apply changes.
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/sync-hours-drifted.ts          # dry-run
 *   npx ts-node --project tsconfig.scripts.json scripts/sync-hours-drifted.ts --commit # live
 *
 * What it does:
 *   1. Fetch all students with non-null used_hours (paginated)
 *   2. Fetch all completed/no_show_student sessions (paginated)
 *   3. Compute canonical used_hours per student:
 *        Math.round(SUM(duration_minutes) / 60 * 2) / 2
 *   4. Flag drifted: |stored - computed| > 0.01
 *   5. Dry-run: print table + summary, write CSV, exit
 *   6. --commit: UPDATE each drifted student, then verify
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const COMMIT = process.argv.includes('--commit');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Row = Record<string, any>;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function computeUsedHours(totalMinutes: number): number {
  return Math.round((totalMinutes / 60) * 2) / 2;
}

function escape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function csvRow(cols: unknown[]): string {
  return cols.map(escape).join(',');
}

function log(msg: string)       { console.log(msg); }
function dryLog(msg: string)    { if (!COMMIT) console.log(`  [DRY-RUN] ${msg}`); }
function commitLog(msg: string) { if (COMMIT)  console.log(`  [COMMIT]  ${msg}`); }

// ─────────────────────────────────────────────────────────────────────────────

interface DriftEntry {
  student_id: string;
  name: string;
  stored: number;
  computed: number;
  delta: number;        // computed - stored (positive = we owe them hours back, negative = over-counted)
  direction: 'over' | 'under';
}

async function computeDrift(
  students: Row[],
  minutesByStudent: Map<string, number>,
): Promise<DriftEntry[]> {
  const drifted: DriftEntry[] = [];
  for (const student of students) {
    const totalMin  = minutesByStudent.get(student.id) ?? 0;
    const computed  = computeUsedHours(totalMin);
    const stored    = student.used_hours ?? 0;
    const delta     = computed - stored;
    if (Math.abs(delta) > 0.01) {
      drifted.push({
        student_id: student.id,
        name:       student.name,
        stored,
        computed,
        delta,
        direction: delta < 0 ? 'over' : 'under',
      });
    }
  }
  return drifted.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`SYNC HOURS — DRIFT CORRECTION  [mode: ${COMMIT ? '🔴 COMMIT' : '🟡 DRY-RUN'}]`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (!COMMIT) {
    console.log('Running in DRY-RUN mode. Pass --commit to apply changes.\n');
  } else {
    console.log('⚠️  COMMIT MODE — writes will be applied to the database.\n');
  }

  // ── Step 1: Load data ─────────────────────────────────────────────────────
  log('Step 1: Loading data…');
  const [students, sessions] = await Promise.all([
    fetchAll('students', 'id, name, used_hours', q => q.not('used_hours', 'is', null)),
    fetchAll('sessions', 'id, student_id, status, duration_minutes', q =>
      q.in('status', ['completed', 'no_show_student']),
    ),
  ]);
  log(`  ${students.length} students with non-null used_hours`);
  log(`  ${sessions.length} completed/no_show_student sessions\n`);

  // ── Step 2: Build minutes-per-student map ─────────────────────────────────
  log('Step 2: Computing canonical used_hours per student…');
  log('  Formula: Math.round(SUM(duration_minutes) / 60 * 2) / 2');
  const minutesByStudent = new Map<string, number>();
  for (const s of sessions) {
    minutesByStudent.set(s.student_id, (minutesByStudent.get(s.student_id) ?? 0) + (s.duration_minutes ?? 0));
  }

  // ── Step 3: Identify drifted students ────────────────────────────────────
  log('Step 3: Identifying drift…');
  const drifted = await computeDrift(students, minutesByStudent);
  log(`  Students checked : ${students.length}`);
  log(`  Drifted (|Δ|>0.01): ${drifted.length}\n`);

  // ── Step 4: Print drift table ─────────────────────────────────────────────
  if (drifted.length > 0) {
    const sumDelta  = drifted.reduce((s, e) => s + Math.abs(e.delta), 0);
    const maxDelta  = drifted[0]; // already sorted by |delta| desc
    const overCount  = drifted.filter(e => e.direction === 'over').length;
    const underCount = drifted.filter(e => e.direction === 'under').length;

    log('Drift table (sorted by |Δ| descending):');
    log('  ' + ['Name'.padEnd(28), 'Stored'.padStart(7), 'Computed'.padStart(9), 'Delta'.padStart(7), 'Dir'].join('  '));
    log('  ' + '-'.repeat(66));
    for (const e of drifted) {
      const sign = e.delta > 0 ? '+' : '';
      log('  ' + [
        e.name.slice(0, 28).padEnd(28),
        String(e.stored).padStart(7),
        String(e.computed).padStart(9),
        `${sign}${e.delta.toFixed(1)}`.padStart(7),
        e.direction,
      ].join('  '));
    }
    log('');

    log('── Summary ──────────────────────────────────────────────────');
    log(`  Total students checked  : ${students.length}`);
    log(`  Drifted students        : ${drifted.length}`);
    log(`  Over-counted (stored>computed)  : ${overCount}`);
    log(`  Under-counted (stored<computed) : ${underCount}`);
    log(`  Sum of |deltas|         : ${sumDelta.toFixed(1)} hours`);
    log(`  Largest single drift    : ${maxDelta.name} (${maxDelta.delta > 0 ? '+' : ''}${maxDelta.delta.toFixed(1)}h)`);
    log('');
  } else {
    log('✅ No drift detected. All stored used_hours match computed values.');
  }

  // ── Step 5: CSV export ────────────────────────────────────────────────────
  log('Step 5: Writing CSV…');
  const outputDir = path.resolve(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const csvPath = path.resolve(outputDir, 'sync-hours-drifted-2026-05-14.csv');
  const csvLines = [
    ['student_id', 'name', 'stored_before', 'computed', 'delta', 'action_taken'].join(','),
    ...drifted.map(e => csvRow([
      e.student_id,
      e.name,
      e.stored,
      e.computed,
      e.delta.toFixed(2),
      COMMIT ? 'updated' : 'dry-run',
    ])),
    // Also include non-drifted students for completeness (action_taken = none)
    ...students
      .filter(s => !drifted.some(d => d.student_id === s.id))
      .map(s => {
        const computed = computeUsedHours(minutesByStudent.get(s.id) ?? 0);
        return csvRow([s.id, s.name, s.used_hours, computed, '0.00', 'none']);
      }),
  ];
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');
  log(`  CSV written → ${csvPath}\n`);

  if (drifted.length === 0) {
    log('═══ Nothing to update. ═══\n');
    return;
  }

  if (!COMMIT) {
    log('═══ Dry-run complete. Review table above, then run with --commit to apply. ═══\n');
    return;
  }

  // ── Step 6: Apply updates ─────────────────────────────────────────────────
  log(`Step 6: Applying updates…`);
  log(`  About to update ${drifted.length} students.\n`);

  let updated = 0;
  const updateErrors: { name: string; error: string }[] = [];

  for (const e of drifted) {
    const { error } = await supabase
      .from('students')
      .update({ used_hours: e.computed })
      .eq('id', e.student_id);

    if (error) {
      console.error(`  ERROR updating ${e.name}: ${error.message}`);
      updateErrors.push({ name: e.name, error: error.message });
      continue;
    }
    commitLog(`used_hours: ${e.name} ${e.stored}→${e.computed}`);
    updated++;
  }
  log(`  Updated: ${updated} | Errors: ${updateErrors.length}\n`);

  if (updateErrors.length > 0) {
    log('Update errors:');
    for (const { name, error } of updateErrors) {
      log(`  ❌ ${name}: ${error}`);
    }
    log('');
  }

  // ── Step 7: Verification ─────────────────────────────────────────────────
  log('Step 7: Verification…');

  // Re-fetch all students (same filter: non-null used_hours)
  const studentsAfter = await fetchAll('students', 'id, name, used_hours', q => q.not('used_hours', 'is', null));
  const driftedAfter  = await computeDrift(studentsAfter, minutesByStudent);

  const v1 = drifted.length;
  const v2 = updated;
  const v3 = driftedAfter.length;

  log(`  Drifted before updates   : ${v1} (expected 97)`);
  log(`  Updates applied          : ${v2} (expected ${drifted.length})`);
  log(`  Drifted after updates    : ${v3} (expected 0)`);

  if (driftedAfter.length > 0) {
    log('\n  ❌ Verification failures:');
    for (const e of driftedAfter) {
      log(`    ${e.name}: stored=${e.stored} computed=${e.computed} delta=${e.delta.toFixed(2)}`);
    }
  } else {
    log('\n  ✅ All students verified — zero drift remaining.');
  }

  const allPassed = driftedAfter.length === 0 && updateErrors.length === 0;
  log('');
  log('── Final Summary ────────────────────────────────────────────');
  log(`  Students checked before  : ${students.length}`);
  log(`  Drifted before           : ${v1}`);
  log(`  Updates applied          : ${v2}`);
  log(`  Update errors            : ${updateErrors.length}`);
  log(`  Drifted after            : ${v3}`);
  log(`  Result                   : ${allPassed ? '✅ PASS — drift fully corrected' : '❌ FAIL — see details above'}`);
  log('');
  log('═══ Sync-hours drift correction complete. ═══\n');
}

main().catch(err => { console.error(err); process.exit(1); });
