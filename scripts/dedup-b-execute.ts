/**
 * dedup-b-execute.ts — Step B dedup executor.
 *
 * Default: DRY-RUN (prints every operation, makes no writes).
 * Pass --commit to apply changes.
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/dedup-b-execute.ts          # dry-run
 *   npx ts-node --project tsconfig.scripts.json scripts/dedup-b-execute.ts --commit # live
 *
 * Operation order (idempotent):
 *   1. Re-point session_recordings.session_id → canonical
 *   2. pickPrimaryRecording on affected canonicals (updates is_primary + sessions.fathom_recording_url)
 *   3. DELETE 348 non-canonical session rows
 *   4. Recompute students.used_hours for all affected students
 *      Formula: ROUND(SUM(duration_minutes for completed+no_show_student) / 60 * 2) / 2
 *   5. Verification SELECTs:
 *        a. 0 duplicate groups on (zoom_meeting_id, student_id, scheduled_at)
 *        b. All re-pointed recordings point at canonical sessions
 *        c. Each affected canonical has exactly 1 is_primary=true recording
 *        d. sessions.fathom_recording_url matches primary recording URL
 *        e. used_hours for affected students matches recomputed value
 *
 * Policy:
 *   Rule 1 — null + non-null tutor_id: keep the non-null row
 *   Rule 2 — both non-null, different: keep earliest created_at
 *   Tiebreak: lowest UUID
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

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

async function pickPrimaryRecording(sessionId: string): Promise<{ primaryUrl: string | null; totalRecordings: number }> {
  const { data: recs } = await supabase
    .from('session_recordings')
    .select('id, fathom_recording_id, fathom_recording_url, duration_seconds, recording_start_time')
    .eq('session_id', sessionId);

  if (!recs || recs.length === 0) return { primaryUrl: null, totalRecordings: 0 };

  const sorted = sortForPrimary(recs);
  const primary = sorted[0];

  if (COMMIT) {
    await supabase.from('session_recordings').update({ is_primary: false }).eq('session_id', sessionId);
    await supabase.from('session_recordings').update({ is_primary: true }).eq('id', primary.id);
    await supabase.from('sessions').update({ fathom_recording_url: primary.fathom_recording_url }).eq('id', sessionId);
  }

  return { primaryUrl: primary.fathom_recording_url, totalRecordings: recs.length };
}

function computeUsedHours(totalMinutes: number): number {
  return Math.round((totalMinutes / 60) * 2) / 2;
}

function log(msg: string)       { console.log(msg); }
function dryLog(msg: string)    { if (!COMMIT) console.log(`  [DRY-RUN] ${msg}`); }
function commitLog(msg: string) { if (COMMIT)  console.log(`  [COMMIT]  ${msg}`); }

// ── Canonical-row policy ──────────────────────────────────────────────────────

interface GroupResult {
  zoom_meeting_id: string;
  student_id: string;
  scheduled_at: string;
  canonicalId: string;
  deleteId: string;
  policy: string;
}

function pickCanonical(group: Row[]): GroupResult {
  const sorted = [...group].sort((a, b) => {
    const aN = a.tutor_id === null ? 1 : 0;
    const bN = b.tutor_id === null ? 1 : 0;
    if (aN !== bN) return aN - bN;
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : 1;
  });
  const hasNull = group.some(r => r.tutor_id === null);
  return {
    zoom_meeting_id: group[0].zoom_meeting_id,
    student_id:      group[0].student_id,
    scheduled_at:    group[0].scheduled_at,
    canonicalId:     sorted[0].id,
    deleteId:        sorted[1].id,
    policy:          hasNull ? 'Rule1:non-null-tutor' : 'Rule2:earliest-created',
  };
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`STEP B — DEDUP EXECUTE  [mode: ${COMMIT ? '🔴 COMMIT' : '🟡 DRY-RUN'}]`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (!COMMIT) {
    console.log('Running in DRY-RUN mode. Pass --commit to apply changes.\n');
  } else {
    console.log('⚠️  COMMIT MODE — writes will be applied to the database.\n');
  }

  // ── Step 0: Load sessions + recordings + students ────────────────────────
  log('Step 0: Loading data…');
  const [sessions, recordings, students] = await Promise.all([
    fetchAll('sessions', 'id, zoom_meeting_id, student_id, tutor_id, scheduled_at, created_at, status, duration_minutes'),
    fetchAll('session_recordings', 'id, session_id, fathom_recording_id, fathom_recording_url, is_primary, duration_seconds, recording_start_time'),
    fetchAll('students', 'id, name, used_hours, purchased_hours, status'),
  ]);
  log(`  ${sessions.length} sessions | ${recordings.length} recordings | ${students.length} students\n`);

  // ── Step 1: Identify duplicate groups ────────────────────────────────────
  log('Step 1: Identifying duplicate groups…');
  const groupMap = new Map<string, Row[]>();
  for (const s of sessions) {
    if (!s.zoom_meeting_id) continue;
    const key = `${s.zoom_meeting_id}|${s.student_id}|${s.scheduled_at}`;
    const arr = groupMap.get(key) ?? [];
    arr.push(s);
    groupMap.set(key, arr);
  }
  const dupeGroups = [...groupMap.values()].filter(g => g.length > 1);
  log(`  Duplicate groups: ${dupeGroups.length}`);

  if (dupeGroups.length === 0) {
    log('\nNo duplicates found. Nothing to do.');
    return;
  }

  // Apply policy
  const groups: GroupResult[] = dupeGroups.map(g => pickCanonical(g));
  const deleteIds    = groups.map(g => g.deleteId);
  const deleteIdSet  = new Set(deleteIds);

  log(`  Non-canonical rows to delete: ${deleteIds.length}\n`);

  // ── Step 2: Re-point session_recordings ──────────────────────────────────
  log('Step 2: Re-pointing session_recordings to canonical sessions…');

  // Build map: deleteId → canonicalId
  const dupeToCanonical = new Map<string, string>(groups.map(g => [g.deleteId, g.canonicalId]));

  const recsToRepoint = recordings.filter(r => deleteIdSet.has(r.session_id));
  log(`  session_recordings to re-point: ${recsToRepoint.length}`);

  // Pre-populate ALL canonical IDs that have recordings affected (not just those
  // re-pointed in this run). This ensures pickPrimaryRecording is called for all
  // 90 affected canonicals even if the script is re-run after a partial failure.
  // pickPrimaryRecording is idempotent, so extra calls are safe.
  const affectedCanonicals = new Set<string>(
    groups
      .filter(g => recordings.some(r => r.session_id === g.deleteId || r.session_id === g.canonicalId))
      .map(g => g.canonicalId),
  );
  let repointCount = 0;

  for (const rec of recsToRepoint) {
    const canonicalId = dupeToCanonical.get(rec.session_id)!;
    dryLog(`UPDATE session_recordings SET session_id='${canonicalId.slice(0,8)}…' WHERE id='${rec.id.slice(0,8)}…'`);
    if (COMMIT) {
      const { error } = await supabase
        .from('session_recordings')
        .update({ session_id: canonicalId })
        .eq('id', rec.id);
      if (error) {
        console.error(`  ERROR re-pointing rec ${rec.id}: ${error.message}`);
        process.exit(1);
      }
      commitLog(`Re-pointed recording ${rec.id.slice(0,8)}… → session ${canonicalId.slice(0,8)}…`);
    }
    repointCount++;
  }
  log(`  Re-pointed: ${repointCount}\n`);

  // ── Step 3: pickPrimaryRecording on affected canonicals ──────────────────
  log(`Step 3: pickPrimaryRecording on ${affectedCanonicals.size} affected canonical sessions…`);
  let primaryUpdated = 0;
  for (const sessionId of affectedCanonicals) {
    const { primaryUrl, totalRecordings } = await pickPrimaryRecording(sessionId);
    dryLog(`pickPrimaryRecording(${sessionId.slice(0,8)}…) → ${totalRecordings} recs, primary URL: ${primaryUrl?.slice(-40) ?? 'null'}`);
    if (COMMIT) {
      commitLog(`pickPrimaryRecording(${sessionId.slice(0,8)}…) → ${totalRecordings} recs`);
    }
    primaryUpdated++;
  }
  log(`  Sessions processed: ${primaryUpdated}\n`);

  // ── Step 4: DELETE non-canonical sessions ────────────────────────────────
  log('Step 4: Deleting non-canonical sessions…');
  let deleted = 0;
  let skipped = 0;

  for (const g of groups) {
    dryLog(`DELETE sessions WHERE id='${g.deleteId}' (zoom=${g.zoom_meeting_id}, ${g.policy})`);
    if (COMMIT) {
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', g.deleteId);
      if (error) {
        console.error(`  ERROR deleting session ${g.deleteId}: ${error.message}`);
        skipped++;
        continue;
      }
      deleted++;
    }
  }

  if (COMMIT) {
    log(`  Deleted: ${deleted} | Errors/skipped: ${skipped}\n`);
  } else {
    log(`  Would delete: ${groups.length}\n`);
  }

  // ── Step 5: Recompute used_hours for affected students ───────────────────
  log('Step 5: Recomputing used_hours for affected students…');
  log('  Formula: ROUND(SUM(duration_minutes for completed+no_show_student) / 60 * 2) / 2');

  // Identify which students are affected (had a non-canonical session deleted)
  const affectedStudentIds = new Set(groups.map(g => g.student_id));
  log(`  Affected students: ${affectedStudentIds.size}`);

  // Compute correct hours from surviving sessions (exclude deleted ids)
  const survivingMinutesByStudent = new Map<string, number>();
  for (const s of sessions) {
    if (deleteIdSet.has(s.id)) continue; // this row is being deleted
    if (s.status !== 'completed' && s.status !== 'no_show_student') continue;
    survivingMinutesByStudent.set(
      s.student_id,
      (survivingMinutesByStudent.get(s.student_id) ?? 0) + (s.duration_minutes ?? 0),
    );
  }

  const studentById = new Map(students.map(s => [s.id, s]));
  let hoursUpdated = 0;
  let hoursUnchanged = 0;
  const hoursVerifyData: { id: string; name: string; oldHours: number; newHours: number }[] = [];

  for (const studentId of affectedStudentIds) {
    const student = studentById.get(studentId);
    if (!student) continue;
    const totalMin    = survivingMinutesByStudent.get(studentId) ?? 0;
    const newHours    = computeUsedHours(totalMin);
    const currentHours = student.used_hours ?? 0;

    hoursVerifyData.push({ id: studentId, name: student.name, oldHours: currentHours, newHours });

    if (newHours === currentHours) { hoursUnchanged++; continue; }

    dryLog(`UPDATE students SET used_hours=${newHours} WHERE id='${studentId}' (${student.name}: ${currentHours}→${newHours})`);
    if (COMMIT) {
      const { error } = await supabase.from('students').update({ used_hours: newHours }).eq('id', studentId);
      if (error) {
        console.error(`  ERROR updating used_hours for ${student.name}: ${error.message}`);
        continue;
      }
      commitLog(`used_hours: ${student.name} ${currentHours}→${newHours}`);
    }
    hoursUpdated++;
  }
  log(`  ${COMMIT ? 'Updated' : 'Would update'}: ${hoursUpdated} | Unchanged: ${hoursUnchanged}\n`);

  // ── Step 6: Verification ─────────────────────────────────────────────────
  log('Step 6: Verification checks…');

  if (COMMIT) {
    // 6a: 0 duplicate groups remaining
    const allRemaining = await fetchAll('sessions', 'zoom_meeting_id, student_id, scheduled_at', q => q.not('zoom_meeting_id', 'is', null));
    const remGroupMap = new Map<string, number>();
    for (const s of allRemaining) {
      const key = `${s.zoom_meeting_id}|${s.student_id}|${s.scheduled_at}`;
      remGroupMap.set(key, (remGroupMap.get(key) ?? 0) + 1);
    }
    const remainingDupes = [...remGroupMap.values()].filter(c => c > 1).length;
    const v1 = remainingDupes === 0 ? '✅ PASS' : `❌ FAIL (${remainingDupes} duplicate groups remain)`;
    log(`  Check 1 — 0 duplicate groups remaining                   : ${v1}`);

    // 6b: All re-pointed recordings point at canonical sessions
    if (recsToRepoint.length > 0) {
      const repointedIds = recsToRepoint.map(r => r.id);
      let orphanCount = 0;
      for (let i = 0; i < repointedIds.length; i += 100) {
        const chunk = repointedIds.slice(i, i + 100);
        const { data: rechk } = await supabase
          .from('session_recordings')
          .select('id, session_id')
          .in('id', chunk);
        for (const r of rechk ?? []) {
          if (!groups.some(g => g.canonicalId === r.session_id)) orphanCount++;
        }
      }
      const v2 = orphanCount === 0 ? '✅ PASS' : `❌ FAIL (${orphanCount} still pointing at non-canonicals)`;
      log(`  Check 2 — Re-pointed recordings all on canonical sessions: ${v2}`);
    } else {
      log(`  Check 2 — Re-pointed recordings all on canonical sessions: ✅ PASS (none to re-point)`);
    }

    // 6c: Each affected canonical has exactly 1 is_primary=true
    let primaryFailures = 0;
    for (const sessionId of affectedCanonicals) {
      const { data: recs } = await supabase
        .from('session_recordings')
        .select('id, is_primary')
        .eq('session_id', sessionId);
      const primaryCount = (recs ?? []).filter(r => r.is_primary).length;
      if (primaryCount !== 1) primaryFailures++;
    }
    const v3 = primaryFailures === 0 ? '✅ PASS' : `❌ FAIL (${primaryFailures} sessions with wrong primary count)`;
    log(`  Check 3 — Each affected session has exactly 1 primary rec : ${v3}`);

    // 6d: fathom_recording_url matches primary recording
    let urlMismatches = 0;
    for (const sessionId of affectedCanonicals) {
      const { data: sess } = await supabase.from('sessions').select('fathom_recording_url').eq('id', sessionId).maybeSingle();
      const { data: primaryRec } = await supabase.from('session_recordings').select('fathom_recording_url').eq('session_id', sessionId).eq('is_primary', true).maybeSingle();
      if (sess?.fathom_recording_url !== primaryRec?.fathom_recording_url) urlMismatches++;
    }
    const v4 = urlMismatches === 0 ? '✅ PASS' : `❌ FAIL (${urlMismatches} URL mismatches)`;
    log(`  Check 4 — sessions.fathom_recording_url matches primary   : ${v4}`);

    // 6e: used_hours for affected students matches recomputed value
    let hoursMismatches = 0;
    for (const { id, name, newHours } of hoursVerifyData) {
      const { data: live } = await supabase.from('students').select('used_hours').eq('id', id).maybeSingle();
      if ((live?.used_hours ?? 0) !== newHours) {
        hoursMismatches++;
        log(`    ❌ ${name}: expected ${newHours}h, got ${live?.used_hours}h`);
      }
    }
    const v5 = hoursMismatches === 0 ? '✅ PASS' : `❌ FAIL (${hoursMismatches} students with wrong used_hours)`;
    log(`  Check 5 — used_hours matches recomputed value             : ${v5}`);

  } else {
    log('  [DRY-RUN] Verification checks will run automatically after --commit.');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n── Summary ──────────────────────────────────────────────────');
  console.log(`  Mode                          : ${COMMIT ? 'COMMIT' : 'DRY-RUN'}`);
  console.log(`  Duplicate groups processed    : ${groups.length}`);
  console.log(`  session_recordings re-pointed : ${repointCount}`);
  console.log(`  Canonicals primary re-elected : ${affectedCanonicals.size}`);
  if (COMMIT) {
    console.log(`  Sessions deleted              : ${deleted}`);
    console.log(`  Errors / skipped              : ${skipped}`);
    console.log(`  used_hours updated            : ${hoursUpdated}`);
    console.log(`  used_hours unchanged          : ${hoursUnchanged}`);
  } else {
    console.log(`  Sessions to delete            : ${groups.length}`);
    console.log(`  Students with hours to update : ${hoursUpdated + hoursUnchanged}`);
  }
  console.log('');

  if (!COMMIT) {
    console.log('═══ Dry-run complete. Run with --commit to apply. ═══\n');
  } else {
    console.log('═══ Step B dedup complete. ═══\n');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
