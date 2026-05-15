/**
 * Checkpoint 3(a) — Dry-run dedup plan reporter.
 * Reads the full database state, computes everything the dedup script will do,
 * and prints a complete plan. Makes ZERO writes.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/dedup-plan.ts
 *
 * Outputs:
 *   - Console summary
 *   - /tmp/dedup-plan-groups.csv     (all 1,003 groups with canonical + duplicates)
 *   - /tmp/dedup-plan-repoints.csv   (33 session_recordings re-pointings)
 *   - /tmp/dedup-plan-url-merge.csv  (10 fathom_recording_url merges)
 *   - /tmp/dedup-plan-hours.csv      (all students with used_hours delta)
 *   - /tmp/dedup-plan-status.csv     (students whose status may need flipping)
 *   - /tmp/dedup-plan-badges.csv     (students with over-granted badges)
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Row = Record<string, any>;

// ── pickPrimaryRecording — mirrors route.ts exactly ──────────────────────────
function pickPrimary(recs: { id: string; fathom_recording_id: number; fathom_recording_url: string; duration_seconds: number | null; recording_start_time: string | null }[]): string {
  const sorted = [...recs].sort((a, b) => {
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
  return sorted[0].id;
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

// ── used_hours formula — mirrors /api/students/sync-hours/route.ts exactly ───
// Billable: completed + no_show_student. Uses duration_minutes. Rounds to nearest 0.5h.
function computeUsedHours(totalMinutes: number): number {
  return Math.round((totalMinutes / 60) * 2) / 2;
}

function csvEscape(v: any): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function csvRow(...vals: any[]): string {
  return vals.map(csvEscape).join(',');
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('CHECKPOINT 3(a) — DEDUP DRY-RUN PLAN');
  console.log('══════════════════════════════════════════════════════════════\n');

  // ── Load all data ─────────────────────────────────────────────────────────
  console.log('Loading data…');

  const [sessions, recordings, students, tutors] = await Promise.all([
    fetchAll('sessions', 'id, student_id, tutor_id, scheduled_at, created_at, status, duration_minutes, fathom_recording_url, tutor_notes, homework_assigned, session_rating, notes_submitted_at, session_report_sent, actual_duration_minutes'),
    fetchAll('session_recordings', 'id, session_id, fathom_recording_id, fathom_recording_url, is_primary, duration_seconds, recording_start_time, match_method'),
    fetchAll('students', 'id, name, used_hours, purchased_hours, status, low_hours_alerted, badges, xp_points, xp_level'),
    fetchAll('tutors', 'id, name, hourly_rate'),
  ]);

  console.log(`  sessions: ${sessions.length} | recordings: ${recordings.length} | students: ${students.length}`);

  const studentMap = new Map<string, Row>(students.map(s => [s.id, s]));
  const tutorMap = new Map<string, Row>(tutors.map(t => [t.id, t]));

  // Index recordings by session_id
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

  console.log(`  Duplicate groups: ${dupGroups.length}`);
  const totalDupeRows = dupGroups.reduce((s, rows) => s + rows.length - 1, 0);
  console.log(`  Non-earliest duplicate rows to delete: ${totalDupeRows}`);

  // ── Plan: session_recordings re-pointing ──────────────────────────────────
  // Any session_recording.session_id that points to a non-earliest dup → re-point to canonical
  const dupeIdToCanonical = new Map<string, string>();
  for (const rows of dupGroups) {
    const canonical = rows[0];
    for (const dup of rows.slice(1)) dupeIdToCanonical.set(dup.id, canonical.id);
  }

  const repoints: { recId: string; fromSessionId: string; toSessionId: string; fathomRecId: number; url: string; isPrimary: boolean; duration: number | null; method: string | null }[] = [];
  for (const rec of recordings) {
    const canonicalId = dupeIdToCanonical.get(rec.session_id);
    if (canonicalId) {
      repoints.push({
        recId: rec.id,
        fromSessionId: rec.session_id,
        toSessionId: canonicalId,
        fathomRecId: rec.fathom_recording_id,
        url: rec.fathom_recording_url,
        isPrimary: rec.is_primary,
        duration: rec.duration_seconds,
        method: rec.match_method,
      });
    }
  }

  console.log(`  session_recordings rows to re-point: ${repoints.length}`);

  // ── Plan: fathom_recording_url COALESCE ───────────────────────────────────
  // Canonical sessions that currently have no URL but a duplicate has one
  // (or the URL on the canonical differs from the is_primary recording's URL)
  const urlMerges: { canonicalId: string; studentName: string; scheduledAt: string; currentUrl: string | null; mergeFromSessionId: string; mergeUrl: string; strategy: string }[] = [];

  for (const rows of dupGroups) {
    const canonical = rows[0];
    const dupes = rows.slice(1);

    // Collect all non-null URLs across the group (on the session row itself)
    const allUrls = rows.map(r => r.fathom_recording_url).filter(Boolean);
    if (allUrls.length === 0) continue; // no URL anywhere in this group

    // If canonical already has a URL, no merge needed for the session column itself
    // (pickPrimaryRecording will handle session_recordings after re-pointing)
    if (canonical.fathom_recording_url) continue;

    // Find best URL: prefer is_primary in session_recordings (after hypothetical re-point)
    // For now, collect all recordings that would be on the canonical after re-pointing
    const futureRecs = [
      ...(recsBySession.get(canonical.id) ?? []),
      ...dupes.flatMap(d => recsBySession.get(d.id) ?? []),
    ];

    let mergeUrl: string | null = null;
    let mergeFrom: string | null = null;
    let strategy = '';

    if (futureRecs.length > 0) {
      // Pick by is_primary first, then by pickPrimary sort
      const primaryRec = futureRecs.find(r => r.is_primary && r.fathom_recording_url);
      if (primaryRec) {
        mergeUrl = primaryRec.fathom_recording_url;
        mergeFrom = primaryRec.session_id;
        strategy = 'is_primary in session_recordings';
      } else {
        const winId = pickPrimary(futureRecs.filter(r => r.fathom_recording_url) as any[]);
        const winner = futureRecs.find(r => r.id === winId);
        if (winner) {
          mergeUrl = winner.fathom_recording_url;
          mergeFrom = winner.session_id;
          strategy = 'pickPrimaryRecording sort (real>placeholder, duration desc, start asc)';
        }
      }
    }

    if (!mergeUrl) {
      // URL is only on a session row (not in session_recordings)
      const rowWithUrl = rows.find(r => r.fathom_recording_url);
      if (rowWithUrl) {
        mergeUrl = rowWithUrl.fathom_recording_url;
        mergeFrom = rowWithUrl.id;
        strategy = 'coalesce from session row (no session_recordings entry)';
      }
    }

    if (mergeUrl) {
      const student = studentMap.get(canonical.student_id);
      urlMerges.push({
        canonicalId: canonical.id,
        studentName: student?.name ?? canonical.student_id,
        scheduledAt: canonical.scheduled_at.slice(0, 16),
        currentUrl: canonical.fathom_recording_url,
        mergeFromSessionId: mergeFrom!,
        mergeUrl,
        strategy,
      });
    }
  }

  console.log(`  fathom_recording_url COALESCE operations: ${urlMerges.length}`);

  // ── Plan: canonicals that will need pickPrimaryRecording re-run ───────────
  const canonicalsNeedingPickPrimary = new Set<string>();
  for (const rp of repoints) canonicalsNeedingPickPrimary.add(rp.toSessionId);
  for (const um of urlMerges) canonicalsNeedingPickPrimary.add(um.canonicalId);
  console.log(`  Canonical sessions needing pickPrimaryRecording re-run: ${canonicalsNeedingPickPrimary.size}`);

  // ── Plan: used_hours recompute ────────────────────────────────────────────
  // Compute what used_hours SHOULD be after dedup (deduped sessions only)
  const dedupedMinByStudent = new Map<string, number>();
  for (const s of sessions) {
    if (dupeIdToCanonical.has(s.id)) continue; // skip duplicates
    if (s.status !== 'completed' && s.status !== 'no_show_student') continue;
    dedupedMinByStudent.set(s.student_id, (dedupedMinByStudent.get(s.student_id) ?? 0) + (s.duration_minutes ?? 0));
  }

  const hoursChanges: { studentId: string; name: string; currentHours: number; dedupedHours: number; delta: number; purchased: number }[] = [];
  for (const student of students) {
    const dedupedMin = dedupedMinByStudent.get(student.id) ?? 0;
    const dedupedHours = computeUsedHours(dedupedMin);
    const currentHours = student.used_hours ?? 0;
    if (dedupedHours !== currentHours) {
      hoursChanges.push({
        studentId: student.id,
        name: student.name,
        currentHours,
        dedupedHours,
        delta: dedupedHours - currentHours,
        purchased: student.purchased_hours ?? 0,
      });
    }
  }
  hoursChanges.sort((a, b) => a.delta - b.delta); // most inflated first (most negative delta)

  console.log(`  students with used_hours changes: ${hoursChanges.length}`);

  // ── Plan: low_hours_alerted flips ─────────────────────────────────────────
  const alertFlips: { studentId: string; name: string; currentUsed: number; dedupedUsed: number; purchased: number }[] = [];
  for (const ch of hoursChanges) {
    const student = studentMap.get(ch.studentId)!;
    const remaining = ch.purchased - ch.dedupedHours;
    // Should flip back to false if: currently alerted AND remaining will be >= 5 after dedup
    if (student.low_hours_alerted && remaining >= 5) {
      alertFlips.push({ studentId: ch.studentId, name: ch.name, currentUsed: ch.currentHours, dedupedUsed: ch.dedupedHours, purchased: ch.purchased });
    }
  }
  console.log(`  students.low_hours_alerted to flip false: ${alertFlips.length}`);

  // ── Plan: status flips ────────────────────────────────────────────────────
  const statusFlips: { studentId: string; name: string; currentStatus: string; currentUsed: number; dedupedUsed: number; purchased: number; remainingAfterDedup: number }[] = [];
  for (const ch of hoursChanges) {
    const student = studentMap.get(ch.studentId)!;
    if (student.status === 'completed') {
      const remainingAfterDedup = ch.purchased - ch.dedupedHours;
      if (remainingAfterDedup > 0) {
        statusFlips.push({
          studentId: ch.studentId,
          name: ch.name,
          currentStatus: student.status,
          currentUsed: ch.currentHours,
          dedupedUsed: ch.dedupedHours,
          purchased: ch.purchased,
          remainingAfterDedup,
        });
      }
    }
  }
  console.log(`  students.status 'completed' → possibly 'active': ${statusFlips.length}`);

  // ── Plan: badge/XP over-grants ────────────────────────────────────────────
  // Count deduped completed sessions per student
  const dedupedCompletedByStudent = new Map<string, number>();
  for (const s of sessions) {
    if (dupeIdToCanonical.has(s.id)) continue;
    if (s.status !== 'completed') continue;
    dedupedCompletedByStudent.set(s.student_id, (dedupedCompletedByStudent.get(s.student_id) ?? 0) + 1);
  }

  const badgeIssues: { studentId: string; name: string; badge: string; threshold: number; currentCompleted: number; dedupedCompleted: number; xpPoints: number }[] = [];
  for (const student of students) {
    const badges: string[] = student.badges ?? [];
    const deduped = dedupedCompletedByStudent.get(student.id) ?? 0;
    const currentCompleted = (sessions.filter(s => s.student_id === student.id && s.status === 'completed').length);

    if (badges.includes('team_player') && deduped < 10) {
      badgeIssues.push({ studentId: student.id, name: student.name, badge: 'team_player', threshold: 10, currentCompleted, dedupedCompleted: deduped, xpPoints: student.xp_points ?? 0 });
    }
    if (badges.includes('veteran') && deduped < 25) {
      badgeIssues.push({ studentId: student.id, name: student.name, badge: 'veteran', threshold: 25, currentCompleted, dedupedCompleted: deduped, xpPoints: student.xp_points ?? 0 });
    }
  }
  console.log(`  students with over-granted badges for Mary review: ${badgeIssues.length}`);

  // ── Print summaries ───────────────────────────────────────────────────────

  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('PLAN TOTALS');
  console.log('──────────────────────────────────────────────────────────────');
  console.log(`  Session rows to DELETE              : ${totalDupeRows}`);
  console.log(`  session_recordings rows to RE-POINT : ${repoints.length}`);
  console.log(`  sessions fathom_url to COALESCE     : ${urlMerges.length}`);
  console.log(`  Canonicals needing pickPrimary re-run: ${canonicalsNeedingPickPrimary.size}`);
  console.log(`  students.used_hours to UPDATE        : ${hoursChanges.length}`);
  console.log(`  students.low_hours_alerted → false   : ${alertFlips.length}`);
  console.log(`  students.status → 'active' (enumerate): ${statusFlips.length}`);
  console.log(`  Badge over-grants (enumerate)         : ${badgeIssues.length}`);

  // ── Top 20 used_hours changes ─────────────────────────────────────────────
  console.log('\n── Top 20 used_hours changes (most inflated) ────────────────');
  console.log('Student'.padEnd(28) + 'Current'.padEnd(10) + 'Deduped'.padEnd(10) + 'Delta'.padEnd(10) + 'Purchased');
  console.log('─'.repeat(70));
  for (const ch of hoursChanges.slice(0, 20)) {
    console.log(
      ch.name.slice(0, 27).padEnd(28) +
      `${ch.currentHours}h`.padEnd(10) +
      `${ch.dedupedHours}h`.padEnd(10) +
      `${ch.delta}h`.padEnd(10) +
      `${ch.purchased}h`
    );
  }

  // ── Status flip list ──────────────────────────────────────────────────────
  console.log('\n── students.status possible flip to active (full list) ──────');
  if (statusFlips.length === 0) {
    console.log('  None.');
  } else {
    console.log('Student'.padEnd(28) + 'CurrUsed'.padEnd(12) + 'DedupUsed'.padEnd(12) + 'Purchased'.padEnd(12) + 'RemainingAfter');
    console.log('─'.repeat(76));
    for (const s of statusFlips) {
      console.log(
        s.name.slice(0, 27).padEnd(28) +
        `${s.currentUsed}h`.padEnd(12) +
        `${s.dedupedUsed}h`.padEnd(12) +
        `${s.purchased}h`.padEnd(12) +
        `${s.remainingAfterDedup.toFixed(1)}h`
      );
    }
  }

  // ── low_hours_alerted flips ───────────────────────────────────────────────
  console.log('\n── students.low_hours_alerted → false (full list) ───────────');
  if (alertFlips.length === 0) {
    console.log('  None.');
  } else {
    console.log('Student'.padEnd(28) + 'CurrentUsed'.padEnd(14) + 'DedupedUsed'.padEnd(14) + 'Purchased');
    for (const f of alertFlips) {
      console.log(f.name.slice(0, 27).padEnd(28) + `${f.currentUsed}h`.padEnd(14) + `${f.dedupedUsed}h`.padEnd(14) + `${f.purchased}h`);
    }
  }

  // ── Badge issues ──────────────────────────────────────────────────────────
  console.log('\n── Badge over-grants (Mary review) ──────────────────────────');
  if (badgeIssues.length === 0) {
    console.log('  None — no over-granted badges found.');
  } else {
    console.log('Student'.padEnd(28) + 'Badge'.padEnd(16) + 'Threshold'.padEnd(12) + 'CurrentSess'.padEnd(14) + 'DedupSess'.padEnd(12) + 'XP total');
    console.log('─'.repeat(94));
    for (const b of badgeIssues) {
      console.log(
        b.name.slice(0, 27).padEnd(28) +
        b.badge.padEnd(16) +
        String(b.threshold).padEnd(12) +
        String(b.currentCompleted).padEnd(14) +
        String(b.dedupedCompleted).padEnd(12) +
        String(b.xpPoints)
      );
    }
  }

  // ── fathom_recording_url merges ───────────────────────────────────────────
  console.log('\n── fathom_recording_url COALESCE operations ─────────────────');
  if (urlMerges.length === 0) {
    console.log('  None needed.');
  } else {
    for (const m of urlMerges) {
      console.log(`  canonical=${m.canonicalId.slice(0, 8)}…  ${m.studentName}  ${m.scheduledAt}`);
      console.log(`    merge: ${m.mergeUrl.slice(-40)}`);
      console.log(`    from:  ${m.mergeFromSessionId.slice(0, 8)}…  strategy: ${m.strategy}`);
    }
  }

  // ── Sample of session_recordings re-points ────────────────────────────────
  console.log(`\n── session_recordings re-points (${repoints.length} total — first 10) ──────`);
  for (const rp of repoints.slice(0, 10)) {
    console.log(`  rec ${rp.recId.slice(0, 8)}… fathom_id=${rp.fathomRecId}  is_primary=${rp.isPrimary}`);
    console.log(`    FROM session ${rp.fromSessionId.slice(0, 8)}…`);
    console.log(`    TO   session ${rp.toSessionId.slice(0, 8)}…`);
  }
  if (repoints.length > 10) console.log(`  … and ${repoints.length - 10} more (see CSV)`);

  // ── Write CSV files ───────────────────────────────────────────────────────
  console.log('\nWriting CSV files to /tmp/…');

  // groups CSV
  {
    const lines = ['group_key,canonical_id,canonical_created_at,student_id,student_name,tutor_id,scheduled_at,dupe_ids,dupe_count'];
    for (const rows of dupGroups) {
      const canonical = rows[0];
      const student = studentMap.get(canonical.student_id);
      const groupKey = `${canonical.student_id}|${canonical.tutor_id ?? 'NULL'}|${canonical.scheduled_at}`;
      lines.push(csvRow(
        groupKey,
        canonical.id,
        canonical.created_at,
        canonical.student_id,
        student?.name ?? '',
        canonical.tutor_id ?? '',
        canonical.scheduled_at,
        rows.slice(1).map((r: Row) => r.id).join(' '),
        rows.length - 1,
      ));
    }
    fs.writeFileSync('/tmp/dedup-plan-groups.csv', lines.join('\n'));
    console.log(`  /tmp/dedup-plan-groups.csv  (${dupGroups.length} groups)`);
  }

  // repoints CSV
  {
    const lines = ['rec_id,from_session_id,to_session_id,fathom_recording_id,url,is_primary,duration_seconds,match_method'];
    for (const rp of repoints) {
      lines.push(csvRow(rp.recId, rp.fromSessionId, rp.toSessionId, rp.fathomRecId, rp.url, rp.isPrimary, rp.duration, rp.method));
    }
    fs.writeFileSync('/tmp/dedup-plan-repoints.csv', lines.join('\n'));
    console.log(`  /tmp/dedup-plan-repoints.csv  (${repoints.length} rows)`);
  }

  // url-merge CSV
  {
    const lines = ['canonical_id,student_name,scheduled_at,current_url,merge_from_session_id,merge_url,strategy'];
    for (const m of urlMerges) {
      lines.push(csvRow(m.canonicalId, m.studentName, m.scheduledAt, m.currentUrl, m.mergeFromSessionId, m.mergeUrl, m.strategy));
    }
    fs.writeFileSync('/tmp/dedup-plan-url-merge.csv', lines.join('\n'));
    console.log(`  /tmp/dedup-plan-url-merge.csv  (${urlMerges.length} rows)`);
  }

  // hours CSV
  {
    const lines = ['student_id,student_name,current_used_hours,deduped_used_hours,delta,purchased_hours,low_hours_alerted_flip,status_flip'];
    for (const ch of hoursChanges) {
      const student = studentMap.get(ch.studentId)!;
      const alertFlip = alertFlips.some(f => f.studentId === ch.studentId);
      const statusFlip = statusFlips.some(s => s.studentId === ch.studentId);
      lines.push(csvRow(ch.studentId, ch.name, ch.currentHours, ch.dedupedHours, ch.delta, ch.purchased, alertFlip, statusFlip));
    }
    fs.writeFileSync('/tmp/dedup-plan-hours.csv', lines.join('\n'));
    console.log(`  /tmp/dedup-plan-hours.csv  (${hoursChanges.length} rows)`);
  }

  // status CSV
  {
    const lines = ['student_id,student_name,current_status,current_used_hours,deduped_used_hours,purchased_hours,remaining_after_dedup'];
    for (const s of statusFlips) {
      lines.push(csvRow(s.studentId, s.name, s.currentStatus, s.currentUsed, s.dedupedUsed, s.purchased, s.remainingAfterDedup.toFixed(1)));
    }
    fs.writeFileSync('/tmp/dedup-plan-status.csv', lines.join('\n'));
    console.log(`  /tmp/dedup-plan-status.csv  (${statusFlips.length} rows)`);
  }

  // badges CSV
  {
    const lines = ['student_id,student_name,badge,threshold,current_completed_sessions,deduped_completed_sessions,total_xp_points'];
    for (const b of badgeIssues) {
      lines.push(csvRow(b.studentId, b.name, b.badge, b.threshold, b.currentCompleted, b.dedupedCompleted, b.xpPoints));
    }
    fs.writeFileSync('/tmp/dedup-plan-badges.csv', lines.join('\n'));
    console.log(`  /tmp/dedup-plan-badges.csv  (${badgeIssues.length} rows)`);
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('DRY-RUN COMPLETE — zero writes made.');
  console.log('Review CSVs, then run dedup-execute.ts --commit to apply.');
  console.log('══════════════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error(e); process.exit(1); });
