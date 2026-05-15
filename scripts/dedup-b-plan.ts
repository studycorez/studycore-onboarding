/**
 * dedup-b-plan.ts — Step B dry-run dedup plan reporter.
 *
 * Makes ZERO writes. Reads the full database state, computes every action
 * the execute script will take, and prints a complete plan + CSV.
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/dedup-b-plan.ts
 *
 * Outputs:
 *   - Console summary with per-group canonical selection
 *   - scripts/output/dedup-b-plan-groups.csv    (all 250 groups)
 *   - scripts/output/dedup-b-plan-repoints.csv  (70 session_recording re-points)
 *   - scripts/output/dedup-b-plan-hours.csv     (used_hours impact per student)
 *
 * Context: 250 duplicate (zoom_meeting_id, student_id, scheduled_at) groups
 * that survived May-13 dedup because they had different tutor_id values.
 * All are 2-row groups created by two separate import runs (April vs May-12).
 *
 * Policy:
 *   Rule 1 — If one row has tutor_id=null: keep the non-null row.
 *   Rule 2 — Both non-null tutor_id: keep earliest created_at.
 *   Tiebreak: lowest UUID.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

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

function sortForPrimary(recs: Row[]): Row[] {
  return [...recs].sort((a, b) => {
    const aP = (a.fathom_recording_id ?? 0) < 0 ? 1 : 0;
    const bP = (b.fathom_recording_id ?? 0) < 0 ? 1 : 0;
    if (aP !== bP) return aP - bP;
    const da = Math.max(0, a.duration_seconds ?? 0);
    const db = Math.max(0, b.duration_seconds ?? 0);
    if (db !== da) return db - da;
    const ta = a.recording_start_time ? new Date(a.recording_start_time).getTime() : Infinity;
    const tb = b.recording_start_time ? new Date(b.recording_start_time).getTime() : Infinity;
    return ta - tb;
  });
}

function escape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function csvRow(cols: unknown[]): string {
  return cols.map(escape).join(',');
}

// ── Canonical-row policy ──────────────────────────────────────────────────────

interface GroupResult {
  key: string;
  zoom_meeting_id: string;
  student_id: string;
  scheduled_at: string;
  canonical: Row;
  deleteRow: Row;
  policy: string;
}

function pickCanonical(group: Row[]): GroupResult {
  const sorted = [...group].sort((a, b) => {
    // Non-null tutor_id wins (Rule 1)
    const aN = a.tutor_id === null ? 1 : 0;
    const bN = b.tutor_id === null ? 1 : 0;
    if (aN !== bN) return aN - bN;
    // Earliest created_at wins (Rule 2)
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    // Lowest UUID tiebreak
    return a.id < b.id ? -1 : 1;
  });

  const canonical  = sorted[0];
  const deleteRow  = sorted[1];
  const hasNull    = group.some(r => r.tutor_id === null);
  const policy     = hasNull ? 'Rule1: keep non-null tutor_id' : 'Rule2: keep earliest created_at';

  return {
    key: `${group[0].zoom_meeting_id}|${group[0].student_id}|${group[0].scheduled_at}`,
    zoom_meeting_id: group[0].zoom_meeting_id,
    student_id: group[0].student_id,
    scheduled_at: group[0].scheduled_at,
    canonical,
    deleteRow,
    policy,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('STEP B — DEDUP PLAN  [DRY-RUN ONLY — zero writes]');
  console.log('══════════════════════════════════════════════════════════════\n');

  // ── Step 0: Load data ─────────────────────────────────────────────────────
  console.log('Step 0: Loading data…');
  const [sessions, recordings, students] = await Promise.all([
    fetchAll('sessions', 'id, zoom_meeting_id, student_id, tutor_id, scheduled_at, created_at, status, duration_minutes, fathom_recording_url'),
    fetchAll('session_recordings', 'id, session_id, fathom_recording_id, fathom_recording_url, is_primary, duration_seconds, recording_start_time'),
    fetchAll('students', 'id, name, used_hours, purchased_hours, status'),
  ]);
  console.log(`  ${sessions.length} sessions | ${recordings.length} recordings | ${students.length} students\n`);

  // ── Step 1: Identify duplicate groups ────────────────────────────────────
  console.log('Step 1: Identifying duplicate (zoom_meeting_id, student_id, scheduled_at) groups…');
  const groupMap = new Map<string, Row[]>();
  for (const s of sessions) {
    if (!s.zoom_meeting_id) continue;
    const key = `${s.zoom_meeting_id}|${s.student_id}|${s.scheduled_at}`;
    const arr = groupMap.get(key) ?? [];
    arr.push(s);
    groupMap.set(key, arr);
  }
  const dupeGroups = [...groupMap.values()].filter(g => g.length > 1);
  console.log(`  Duplicate groups found: ${dupeGroups.length}\n`);

  if (dupeGroups.length === 0) {
    console.log('No duplicates found. Nothing to do.');
    return;
  }

  // ── Step 2: Apply policy to each group ────────────────────────────────────
  console.log('Step 2: Applying canonical-row policy…');
  const groups: GroupResult[] = dupeGroups.map(g => pickCanonical(g));
  const deleteIds  = new Set(groups.map(g => g.deleteRow.id));
  const deleteIdsArr = [...deleteIds];
  const canonicalIds = new Set(groups.map(g => g.canonical.id));

  let rule1Count = 0, rule2Count = 0;
  for (const g of groups) {
    if (g.policy.startsWith('Rule1')) rule1Count++;
    else rule2Count++;
  }
  console.log(`  Rule 1 (keep non-null tutor_id): ${rule1Count} groups`);
  console.log(`  Rule 2 (keep earliest created):  ${rule2Count} groups`);
  console.log(`  Non-canonical rows to delete:    ${deleteIdsArr.length}\n`);

  // ── Step 3: session_recordings re-points ──────────────────────────────────
  console.log('Step 3: session_recordings that need re-pointing…');
  const recsBySession = new Map<string, Row[]>();
  for (const r of recordings) {
    const arr = recsBySession.get(r.session_id) ?? [];
    arr.push(r);
    recsBySession.set(r.session_id, arr);
  }

  const repoints: { rec: Row; oldSessionId: string; newSessionId: string }[] = [];
  for (const g of groups) {
    const recs = recsBySession.get(g.deleteRow.id) ?? [];
    for (const rec of recs) {
      repoints.push({ rec, oldSessionId: g.deleteRow.id, newSessionId: g.canonical.id });
    }
  }
  console.log(`  session_recordings to re-point: ${repoints.length}\n`);

  for (const rp of repoints.slice(0, 10)) {
    console.log(`  [DRY-RUN] UPDATE session_recordings SET session_id='${rp.newSessionId.slice(0,8)}…' WHERE id='${rp.rec.id.slice(0,8)}…' (was on ${rp.oldSessionId.slice(0,8)}…)`);
  }
  if (repoints.length > 10) console.log(`  … and ${repoints.length - 10} more`);

  // ── Step 4: pickPrimaryRecording plan ────────────────────────────────────
  console.log('\nStep 4: pickPrimaryRecording on affected canonicals…');
  const affectedCanonicals = new Set(repoints.map(r => r.newSessionId));
  console.log(`  Canonical sessions that will have primary re-elected: ${affectedCanonicals.size}`);

  for (const sessionId of [...affectedCanonicals].slice(0, 5)) {
    // Simulate: combine recordings currently on canonical + the re-pointed ones
    const currentRecs = recsBySession.get(sessionId) ?? [];
    const incomingRecs = repoints.filter(r => r.newSessionId === sessionId).map(r => r.rec);
    const allRecs = [...currentRecs, ...incomingRecs];
    if (allRecs.length === 0) continue;
    const primary = sortForPrimary(allRecs)[0];
    console.log(`  [DRY-RUN] Session ${sessionId.slice(0,8)}… → primary recording ${primary.id.slice(0,8)}… (${allRecs.length} total recs)`);
  }

  // ── Step 5: DELETE plan ───────────────────────────────────────────────────
  console.log('\nStep 5: DELETE non-canonical sessions…');
  for (const g of groups.slice(0, 5)) {
    console.log(`  [DRY-RUN] DELETE sessions WHERE id='${g.deleteRow.id}' (zoom=${g.zoom_meeting_id}, ${g.policy})`);
  }
  if (groups.length > 5) console.log(`  … and ${groups.length - 5} more`);

  // ── Step 6: used_hours impact ─────────────────────────────────────────────
  console.log('\nStep 6: used_hours impact (informational — not auto-corrected by this script)…');
  const studentById = new Map(students.map(s => [s.id, s]));
  const minutesByStudent = new Map<string, number>();
  for (const g of groups) {
    const dur = g.deleteRow.duration_minutes ?? 0;
    if (!dur) continue;
    const sid = g.deleteRow.student_id;
    minutesByStudent.set(sid, (minutesByStudent.get(sid) ?? 0) + dur);
  }
  const impactedStudents = [...minutesByStudent.entries()].map(([sid, mins]) => ({
    student: studentById.get(sid),
    excessMinutes: mins,
    excessHours: Math.round((mins / 60) * 2) / 2,
  })).filter(e => e.student).sort((a, b) => b.excessMinutes - a.excessMinutes);

  console.log(`  Students with used_hours inflation from these duplicates: ${impactedStudents.length}`);
  for (const e of impactedStudents.slice(0, 10)) {
    console.log(`    ${e.student!.name.padEnd(30)} excess: +${e.excessHours}h  (current used: ${e.student!.used_hours}h)`);
  }
  if (impactedStudents.length > 10) console.log(`  … and ${impactedStudents.length - 10} more`);
  console.log('  NOTE: Run a sync-hours pass after dedup to correct used_hours.');

  // ── Step 7: Verification preview ─────────────────────────────────────────
  console.log('\nStep 7: Post-execute verification checks (will run automatically after --commit)…');
  console.log('  ✓ 0 duplicate groups on (zoom_meeting_id, student_id, scheduled_at)');
  console.log('  ✓ All re-pointed session_recordings point at canonical sessions');
  console.log('  ✓ Each affected session has exactly 1 is_primary=true recording');
  console.log('  ✓ sessions.fathom_recording_url matches primary recording URL');

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n── Summary ──────────────────────────────────────────────────');
  console.log(`  Duplicate groups              : ${groups.length}`);
  console.log(`  Non-canonical rows to DELETE  : ${deleteIdsArr.length}`);
  console.log(`  session_recordings to re-point: ${repoints.length}`);
  console.log(`  Canonicals needing primary re-elect: ${affectedCanonicals.size}`);
  console.log(`  Students with hours inflation  : ${impactedStudents.length}`);

  // ── CSV export ────────────────────────────────────────────────────────────
  const outputDir = path.resolve(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // Groups CSV
  const groupsCsv = [
    ['zoom_meeting_id', 'student_id', 'scheduled_at', 'policy',
     'canonical_id', 'canonical_tutor_id', 'canonical_created_at',
     'delete_id', 'delete_tutor_id', 'delete_created_at'].join(','),
    ...groups.map(g => csvRow([
      g.zoom_meeting_id, g.student_id, g.scheduled_at, g.policy,
      g.canonical.id, g.canonical.tutor_id, g.canonical.created_at,
      g.deleteRow.id, g.deleteRow.tutor_id, g.deleteRow.created_at,
    ])),
  ].join('\n');
  const groupsCsvPath = path.resolve(outputDir, `dedup-b-plan-groups-${new Date().toISOString().slice(0, 10)}.csv`);
  fs.writeFileSync(groupsCsvPath, groupsCsv, 'utf8');
  console.log(`\nCSV: groups → ${groupsCsvPath}`);

  // Repoints CSV
  const repointsCsv = [
    ['recording_id', 'old_session_id', 'new_session_id', 'fathom_recording_url'].join(','),
    ...repoints.map(r => csvRow([r.rec.id, r.oldSessionId, r.newSessionId, r.rec.fathom_recording_url])),
  ].join('\n');
  const repointsCsvPath = path.resolve(outputDir, `dedup-b-plan-repoints-${new Date().toISOString().slice(0, 10)}.csv`);
  fs.writeFileSync(repointsCsvPath, repointsCsv, 'utf8');
  console.log(`CSV: repoints → ${repointsCsvPath}`);

  // Hours impact CSV
  const hoursCsv = [
    ['student_id', 'student_name', 'current_used_hours', 'excess_hours_to_subtract'].join(','),
    ...impactedStudents.map(e => csvRow([e.student!.id, e.student!.name, e.student!.used_hours, e.excessHours])),
  ].join('\n');
  const hoursCsvPath = path.resolve(outputDir, `dedup-b-plan-hours-${new Date().toISOString().slice(0, 10)}.csv`);
  fs.writeFileSync(hoursCsvPath, hoursCsv, 'utf8');
  console.log(`CSV: hours impact → ${hoursCsvPath}`);

  console.log('\n═══ Dry-run complete. Review CSVs, then run dedup-b-execute.ts --commit ═══\n');
}

main().catch(err => { console.error(err); process.exit(1); });
