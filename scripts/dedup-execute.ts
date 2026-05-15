/**
 * Checkpoint 3(b) — Dedup executor.
 * Default: DRY-RUN (prints every SQL operation, makes no writes).
 * Pass --commit to actually apply changes.
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/dedup-execute.ts          # dry-run
 *   npx ts-node --project tsconfig.scripts.json scripts/dedup-execute.ts --commit # live
 *
 * Operation order (idempotent):
 *   1. Re-point session_recordings.session_id → canonical  (UPDATE)
 *   2. COALESCE fathom_recording_url onto canonicals        (UPDATE sessions)
 *   3. pickPrimaryRecording on affected canonicals          (UPDATE session_recordings + sessions)
 *   4. Defensive DELETE duplicate sessions                  (skips any dup with non-null tutor_notes)
 *   5. Recompute students.used_hours (sync-hours formula)   (UPDATE students)
 *   6. Reset students.low_hours_alerted → false where safe  (UPDATE students)
 *   7. Auto-flip students.status 'completed' → 'active' where hours remain post-dedup
 *   8. ENUMERATE badge over-grants for Mary (no writes — xp_events append-only)
 *   9. ENUMERATE xp inflation (no writes — noted for Mary awareness)
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

// ── pickPrimaryRecording — mirrors route.ts exactly ──────────────────────────
function sortForPrimary(recs: Row[]): Row[] {
  return [...recs].sort((a, b) => {
    const aIsPlaceholder = a.fathom_recording_id < 0 ? 1 : 0;
    const bIsPlaceholder = b.fathom_recording_id < 0 ? 1 : 0;
    if (aIsPlaceholder !== bIsPlaceholder) return aIsPlaceholder - bIsPlaceholder;
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

function computeUsedHours(totalMinutes: number): number {
  return Math.round((totalMinutes / 60) * 2) / 2;
}

function log(msg: string) { console.log(msg); }
function dryLog(msg: string) { if (!COMMIT) console.log(`  [DRY-RUN] ${msg}`); }
function commitLog(msg: string) { if (COMMIT) console.log(`  [COMMIT]  ${msg}`); }

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`CHECKPOINT 3(b) — DEDUP EXECUTE  [mode: ${COMMIT ? '🔴 COMMIT' : '🟡 DRY-RUN'}]`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (!COMMIT) {
    console.log('Running in DRY-RUN mode. Pass --commit to apply changes.\n');
  } else {
    console.log('⚠️  COMMIT MODE — writes will be applied to the database.\n');
  }

  // ── Load data ──────────────────────────────────────────────────────────────
  log('Step 0: Loading data…');
  const [sessions, recordings, students] = await Promise.all([
    fetchAll('sessions', 'id, student_id, tutor_id, scheduled_at, created_at, status, duration_minutes, fathom_recording_url, tutor_notes, homework_assigned, session_rating, notes_submitted_at, session_report_sent'),
    fetchAll('session_recordings', 'id, session_id, fathom_recording_id, fathom_recording_url, is_primary, duration_seconds, recording_start_time'),
    fetchAll('students', 'id, name, used_hours, purchased_hours, status, low_hours_alerted, badges, xp_points'),
  ]);

  log(`  ${sessions.length} sessions | ${recordings.length} recordings | ${students.length} students`);

  const studentMap = new Map<string, Row>(students.map(s => [s.id, s]));
  const recsBySession = new Map<string, Row[]>();
  for (const r of recordings) {
    if (!recsBySession.has(r.session_id)) recsBySession.set(r.session_id, []);
    recsBySession.get(r.session_id)!.push(r);
  }

  // ── Build duplicate groups ─────────────────────────────────────────────────
  const groups = new Map<string, Row[]>();
  for (const s of sessions) {
    const key = `${s.student_id}|${s.tutor_id ?? 'NULL'}|${s.scheduled_at}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  const dupGroups = [...groups.values()].filter(rows => rows.length > 1);
  dupGroups.forEach(rows => rows.sort((a, b) => a.created_at < b.created_at ? -1 : 1));

  const dupeIdToCanonical = new Map<string, string>();
  for (const rows of dupGroups) {
    const canonical = rows[0];
    for (const dup of rows.slice(1)) dupeIdToCanonical.set(dup.id, canonical.id);
  }

  const totalDupeRows = dupeIdToCanonical.size;
  log(`  Duplicate groups: ${dupGroups.length} | Rows to delete: ${totalDupeRows}`);

  // ── Step 1: Re-point session_recordings ──────────────────────────────────
  log('\nStep 1: Re-pointing session_recordings to canonical sessions…');

  const canonicalsToPickPrimary = new Set<string>();
  let repointCount = 0;
  let repointSkipped = 0;

  for (const rec of recordings) {
    const canonicalId = dupeIdToCanonical.get(rec.session_id);
    if (!canonicalId) continue; // already on canonical or not a dupe

    // Check for fathom_recording_id conflict on canonical
    const canonicalRecs = recsBySession.get(canonicalId) ?? [];
    const conflict = canonicalRecs.some(cr => cr.fathom_recording_id === rec.fathom_recording_id);
    if (conflict) {
      log(`  ⚠️  SKIP re-point: rec ${rec.id.slice(0, 8)}… fathom_id=${rec.fathom_recording_id} already on canonical ${canonicalId.slice(0, 8)}…`);
      repointSkipped++;
      continue;
    }

    dryLog(`UPDATE session_recordings SET session_id='${canonicalId}' WHERE id='${rec.id}' (was on dup ${rec.session_id.slice(0, 8)}…)`);
    if (COMMIT) {
      const { error } = await supabase.from('session_recordings').update({ session_id: canonicalId }).eq('id', rec.id);
      if (error) {
        log(`  ❌ Re-point failed for rec ${rec.id}: ${error.message}`);
        continue;
      }
    }
    commitLog(`Re-pointed rec ${rec.id.slice(0, 8)}… → canonical ${canonicalId.slice(0, 8)}…`);
    canonicalsToPickPrimary.add(canonicalId);
    repointCount++;
  }

  log(`  Re-pointed: ${repointCount} | Skipped (conflict): ${repointSkipped}`);

  // ── Step 2: COALESCE fathom_recording_url onto canonicals ────────────────
  log('\nStep 2: Coalescing fathom_recording_url onto canonical sessions…');
  let urlMergeCount = 0;

  for (const rows of dupGroups) {
    const canonical = rows[0];
    if (canonical.fathom_recording_url) continue; // already has URL

    // Find best URL from duplicates
    const dupes = rows.slice(1);
    const allRecs = [
      ...(recsBySession.get(canonical.id) ?? []),
      ...dupes.flatMap(d => recsBySession.get(d.id) ?? []),
    ];

    // After step 1 re-points, these recs would now be on the canonical.
    // Pick the best URL using is_primary first, then pickPrimary sort.
    let mergeUrl: string | null = null;
    const recsWithUrl = allRecs.filter(r => r.fathom_recording_url);

    if (recsWithUrl.length > 0) {
      const primaryRec = recsWithUrl.find(r => r.is_primary);
      if (primaryRec) {
        mergeUrl = primaryRec.fathom_recording_url;
      } else {
        const sorted = sortForPrimary(recsWithUrl);
        mergeUrl = sorted[0].fathom_recording_url;
      }
    } else {
      // No session_recordings entry — URL is only on the dup session row
      const rowWithUrl = dupes.find(d => d.fathom_recording_url);
      if (rowWithUrl) mergeUrl = rowWithUrl.fathom_recording_url;
    }

    if (!mergeUrl) continue;

    dryLog(`UPDATE sessions SET fathom_recording_url='${mergeUrl.slice(-40)}' WHERE id='${canonical.id}' (was null)`);
    if (COMMIT) {
      const { error } = await supabase.from('sessions').update({ fathom_recording_url: mergeUrl }).eq('id', canonical.id);
      if (error) {
        log(`  ❌ URL merge failed for session ${canonical.id}: ${error.message}`);
        continue;
      }
    }
    canonicalsToPickPrimary.add(canonical.id);
    urlMergeCount++;
  }

  log(`  URL merges applied: ${urlMergeCount}`);

  // ── Step 3: pickPrimaryRecording on affected canonicals ───────────────────
  log(`\nStep 3: Running pickPrimaryRecording on ${canonicalsToPickPrimary.size} canonical sessions…`);
  let pickCount = 0;
  for (const sessionId of canonicalsToPickPrimary) {
    dryLog(`pickPrimaryRecording(${sessionId.slice(0, 8)}…)`);
    if (COMMIT) {
      const { primaryUrl, totalRecordings } = await pickPrimaryRecording(sessionId);
      commitLog(`pickPrimary ${sessionId.slice(0, 8)}…: ${totalRecordings} recordings, primary URL: ${primaryUrl?.slice(-30) ?? 'null'}`);
    }
    pickCount++;
  }
  log(`  pickPrimaryRecording calls: ${pickCount}`);

  // ── Step 4: DELETE duplicate sessions (defensive) ────────────────────────
  log('\nStep 4: Deleting duplicate session rows…');

  let deleteCount = 0;
  let deleteSkipped = 0;
  const skippedGroups: string[] = [];

  for (const rows of dupGroups) {
    const canonical = rows[0];
    const dupes = rows.slice(1);

    for (const dup of dupes) {
      // Safety: skip if any report field is non-null on the dup (shouldn't be after Part C, but be defensive)
      const hasReportData = !!(
        dup.tutor_notes ||
        dup.homework_assigned ||
        dup.session_rating != null ||
        dup.notes_submitted_at ||
        dup.session_report_sent
      );

      if (hasReportData) {
        log(`  ⚠️  SKIP delete: dup session ${dup.id.slice(0, 8)}… has report data — manual review needed`);
        log(`    tutor_notes=${dup.tutor_notes ? 'SET' : 'null'} rating=${dup.session_rating} submitted_at=${dup.notes_submitted_at}`);
        deleteSkipped++;
        skippedGroups.push(dup.id);
        continue;
      }

      dryLog(`DELETE FROM sessions WHERE id='${dup.id}' (canonical: ${canonical.id.slice(0, 8)}…)`);
      if (COMMIT) {
        const { error } = await supabase.from('sessions').delete().eq('id', dup.id);
        if (error) {
          log(`  ❌ Delete failed for ${dup.id}: ${error.message}`);
          deleteSkipped++;
          continue;
        }
        deleteCount++;
      } else {
        deleteCount++;
      }
    }
  }

  log(`  ${COMMIT ? 'Deleted' : 'Would delete'}: ${deleteCount} | Skipped (safety/error): ${deleteSkipped}`);
  if (skippedGroups.length > 0) {
    log(`  Skipped session IDs: ${skippedGroups.join(', ')}`);
  }

  // ── Step 5: Recompute students.used_hours ─────────────────────────────────
  log('\nStep 5: Recomputing students.used_hours (sync-hours formula)…');
  log('  Formula: ROUND(SUM(duration_minutes for completed+no_show_student) / 60 * 2) / 2');

  // After deletion, re-fetch sessions (or compute from remaining in memory)
  const survivingSessions = sessions.filter(s => !dupeIdToCanonical.has(s.id));
  const minutesByStudent = new Map<string, number>();
  for (const s of survivingSessions) {
    if (s.status !== 'completed' && s.status !== 'no_show_student') continue;
    minutesByStudent.set(s.student_id, (minutesByStudent.get(s.student_id) ?? 0) + (s.duration_minutes ?? 0));
  }

  let hoursUpdated = 0;
  let hoursUnchanged = 0;
  const statusToCheck: Row[] = [];

  for (const student of students) {
    const totalMin = minutesByStudent.get(student.id) ?? 0;
    const newUsedHours = computeUsedHours(totalMin);
    const currentUsedHours = student.used_hours ?? 0;

    if (newUsedHours === currentUsedHours) { hoursUnchanged++; continue; }

    dryLog(`UPDATE students SET used_hours=${newUsedHours} WHERE id='${student.id}' (${student.name}: ${currentUsedHours}→${newUsedHours})`);
    if (COMMIT) {
      const { error } = await supabase.from('students').update({ used_hours: newUsedHours }).eq('id', student.id);
      if (error) { log(`  ❌ used_hours update failed for ${student.name}: ${error.message}`); continue; }
    }
    hoursUpdated++;

    // Track for status check
    const purchased = student.purchased_hours ?? 0;
    if (student.status === 'completed' && newUsedHours < purchased) {
      statusToCheck.push({ ...student, newUsedHours });
    }
  }

  log(`  ${COMMIT ? 'Updated' : 'Would update'}: ${hoursUpdated} | Unchanged: ${hoursUnchanged}`);

  // ── Step 6: Reset low_hours_alerted ──────────────────────────────────────
  log('\nStep 6: Resetting low_hours_alerted where hours recovered…');
  let alertReset = 0;

  for (const student of students) {
    if (!student.low_hours_alerted) continue;
    const totalMin = minutesByStudent.get(student.id) ?? 0;
    const newUsed = computeUsedHours(totalMin);
    const purchased = student.purchased_hours ?? 0;
    const remaining = purchased - newUsed;
    if (remaining < 5) continue; // still low

    dryLog(`UPDATE students SET low_hours_alerted=false WHERE id='${student.id}' (${student.name}: remaining=${remaining.toFixed(1)}h)`);
    if (COMMIT) {
      const { error } = await supabase.from('students').update({ low_hours_alerted: false }).eq('id', student.id);
      if (error) { log(`  ❌ low_hours_alerted reset failed for ${student.name}: ${error.message}`); continue; }
    }
    alertReset++;
  }

  log(`  ${COMMIT ? 'Reset' : 'Would reset'}: ${alertReset}`);

  // ── Deduped completed sessions per student (needed for steps 7, 8, 9) ──────
  const dedupedCompleted = new Map<string, number>();
  for (const s of survivingSessions) {
    if (s.status !== 'completed') continue;
    dedupedCompleted.set(s.student_id, (dedupedCompleted.get(s.student_id) ?? 0) + 1);
  }

  // Original completed count (before dedup) per student
  const originalCompleted = new Map<string, number>();
  for (const s of sessions) {
    if (s.status !== 'completed') continue;
    originalCompleted.set(s.student_id, (originalCompleted.get(s.student_id) ?? 0) + 1);
  }

  // ── Step 7: Auto-flip status 'completed' → 'active' where hours remain ───
  log('\nStep 7: Auto-flipping students.status completed → active where hours remain post-dedup…');
  log('  (Mary: review these post-commit and re-mark completed if warranted)');

  let statusFlipped = 0;
  const statusFlipLog: string[] = [];

  for (const entry of statusToCheck) {
    const remaining = (entry.purchased_hours ?? 0) - entry.newUsedHours;
    const note = entry.used_hours === 0
      ? '⚠️  was 0h recorded — stale used_hours likely a separate bug'
      : '';

    dryLog(`UPDATE students SET status='active' WHERE id='${entry.id}' (${entry.name}: was completed, ${remaining.toFixed(1)}h remaining)`);
    if (COMMIT) {
      const { error } = await supabase.from('students').update({ status: 'active' }).eq('id', entry.id);
      if (error) {
        log(`  ❌ status flip failed for ${entry.name}: ${error.message}`);
        continue;
      }
    }
    statusFlipped++;
    const line = `    ${entry.name.padEnd(28)} purchased=${String(entry.purchased_hours ?? 0).padStart(3)}h  dedupedUsed=${String(entry.newUsedHours).padStart(5)}h  remaining=${remaining.toFixed(1).padStart(5)}h  ${note}`;
    statusFlipLog.push(line);
    log(line);
  }

  if (statusFlipped === 0) log('  None — no status flips needed.');
  log(`  ${COMMIT ? 'Flipped' : 'Would flip'}: ${statusFlipped}`);

  // ── Step 8: ENUMERATE badge over-grants for Mary (no writes) ─────────────
  log('\nStep 8: Enumerating badge over-grants for Mary review (NO auto-revoke — xp_events is append-only)…');

  let badgeCount = 0;
  for (const student of students) {
    const badges: string[] = student.badges ?? [];
    const deduped = dedupedCompleted.get(student.id) ?? 0;
    const issues: string[] = [];
    if (badges.includes('team_player') && deduped < 10) issues.push(`team_player (needs 10, has ${deduped})`);
    if (badges.includes('veteran') && deduped < 25) issues.push(`veteran (needs 25, has ${deduped})`);
    if (issues.length > 0) {
      log(`    ${student.name}: ${issues.join(', ')} | total_xp_points=${student.xp_points ?? 0}`);
      badgeCount++;
    }
  }
  if (badgeCount === 0) log('  None — no over-granted badges found.');
  log(`  Total for Mary review: ${badgeCount}  (xp_points NOT touched — each revocation is a deliberate per-student decision)`);

  // ── Step 9: ENUMERATE xp inflation (no writes) ───────────────────────────
  log('\nStep 9: Enumerating XP inflation from phantom sessions (NOT auto-corrected — xp_events append-only)…');

  let xpInflationCount = 0;
  for (const student of students) {
    const origCount = originalCompleted.get(student.id) ?? 0;
    const dedupCount = dedupedCompleted.get(student.id) ?? 0;
    const phantomSessions = origCount - dedupCount;
    if (phantomSessions <= 0 || (student.xp_points ?? 0) === 0) continue;
    log(`    ${student.name.padEnd(28)} phantom_sessions=${phantomSessions}  total_xp_points=${student.xp_points ?? 0}  deduped_real_sessions=${dedupCount}`);
    xpInflationCount++;
  }
  if (xpInflationCount === 0) log('  None — no XP inflation detected.');
  log(`  Total students with XP inflation noted: ${xpInflationCount}  (no writes — Mary to decide per student)`);

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`DEDUP ${COMMIT ? 'EXECUTE' : 'DRY-RUN'} COMPLETE`);
  console.log('──────────────────────────────────────────────────────────────');
  console.log(`  session_recordings re-pointed : ${repointCount}`);
  console.log(`  fathom_recording_url merges   : ${urlMergeCount}`);
  console.log(`  pickPrimaryRecording calls    : ${pickCount}`);
  console.log(`  sessions deleted              : ${deleteCount}  (skipped: ${deleteSkipped})`);
  console.log(`  used_hours updated            : ${hoursUpdated}`);
  console.log(`  low_hours_alerted reset       : ${alertReset}`);
  console.log(`  status auto-flipped → active  : ${statusFlipped}  (Mary review — re-mark if wrong)`);
  console.log(`  badge over-grants (Mary)       : ${badgeCount}  (no auto-revoke)`);
  console.log(`  xp inflation noted (Mary)      : ${xpInflationCount}  (xp_points NOT touched)`);
  if (deleteSkipped > 0) {
    console.log(`\n  ⚠️  ${deleteSkipped} dup session(s) skipped due to report data — manual review required.`);
  }
  if (!COMMIT) {
    console.log('\n  Re-run with --commit to apply changes.');
  } else {
    console.log('\n  ✅ All writes applied. Run dedup-verify.ts to confirm.');
  }
  console.log('══════════════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error(e); process.exit(1); });
