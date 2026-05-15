/**
 * Post-dedup Mary review data pull.
 * 1. Builds mary-review-post-dedup-2026-05-13.csv (XP inflation + badge over-grants)
 * 2. Spot-checks: canonical with re-pointed recordings, URL-merge session, status-flip student
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/post-dedup-mary-review.ts
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

function csvEscape(v: any): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function csvRow(...vals: any[]): string { return vals.map(csvEscape).join(','); }

function pad(s: any, n: number): string { return String(s ?? '').padEnd(n); }
function lpad(s: any, n: number): string { return String(s ?? '').padStart(n); }
function hr(n: number, c = '─'): string { return c.repeat(n); }

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('POST-DEDUP MARY REVIEW DATA PULL');
  console.log('══════════════════════════════════════════════════════════════\n');

  // Load current DB state (post-dedup)
  const [sessions, students] = await Promise.all([
    fetchAll('sessions', 'id, student_id, status, duration_minutes'),
    fetchAll('students', 'id, name, used_hours, purchased_hours, status, badges, xp_points'),
  ]);

  console.log(`  sessions: ${sessions.length} | students: ${students.length}\n`);

  const studentMap = new Map<string, Row>(students.map(s => [s.id, s]));

  // ── Compute real completed session counts per student ─────────────────────
  const completedCount = new Map<string, number>();
  for (const s of sessions) {
    if (s.status !== 'completed') continue;
    completedCount.set(s.student_id, (completedCount.get(s.student_id) ?? 0) + 1);
  }

  // ── Known XP-inflated students from execute output ────────────────────────
  // (name → phantom count, from execute step 9)
  const xpInflatedPhantoms: Record<string, number> = {
    'Muzammil': 6,
    'Adam Hamid': 78,
    'Alec Toledo': 8,
    'Roopkatha Bagchi': 11,
    'Brittany Lilly': 18,
    'Askari Hussain': 19,
    'Sara Kalangi': 2,
    'Milana Labkovich': 12,
    'Suhani Laddha': 11,
    'Nitant Handa': 18,
    'Vijay Vanaparthy': 8,
    'Vishnu': 17,
    'Nicolai Defreest': 32,
  };

  // ── Build unified Mary-review dataset ─────────────────────────────────────
  const BADGE_THRESHOLDS: Record<string, number> = { team_player: 10, veteran: 25 };

  const reviewRows: {
    studentId: string;
    name: string;
    xpPoints: number;
    realCompletedSessions: number;
    phantomSessions: number;
    badgesHeld: string;
    badgesLikelyInvalid: string;
    reason: string;
  }[] = [];

  // Union of XP-inflated names + badge over-grant names
  const allNames = new Set([
    ...Object.keys(xpInflatedPhantoms),
    // badge over-grants from execute (some overlap with xp)
    'Brittany Lilly', 'Askari Hussain', 'Nitant Handa', 'Milana Labkovich', 'Vijay Vanaparthy',
  ]);

  for (const name of allNames) {
    const student = students.find(s => s.name === name);
    if (!student) {
      console.warn(`  ⚠️  Student not found by name: ${name}`);
      continue;
    }

    const realSessions = completedCount.get(student.id) ?? 0;
    const phantomSessions = xpInflatedPhantoms[name] ?? 0;
    const badges: string[] = student.badges ?? [];

    const invalidBadges = badges.filter(b => {
      const threshold = BADGE_THRESHOLDS[b];
      return threshold !== undefined && realSessions < threshold;
    });

    const reasons: string[] = [];
    if (phantomSessions > 0) reasons.push(`xp_inflation(${phantomSessions}_phantom_sessions)`);
    if (invalidBadges.length > 0) reasons.push(`badge_over_grant(${invalidBadges.join('+')}_below_threshold)`);

    reviewRows.push({
      studentId: student.id,
      name: student.name,
      xpPoints: student.xp_points ?? 0,
      realCompletedSessions: realSessions,
      phantomSessions,
      badgesHeld: badges.join('; '),
      badgesLikelyInvalid: invalidBadges.join('; '),
      reason: reasons.join(' | '),
    });
  }

  // Sort: badge issues first, then by phantom count desc
  reviewRows.sort((a, b) => {
    const aBadge = a.badgesLikelyInvalid ? 1 : 0;
    const bBadge = b.badgesLikelyInvalid ? 1 : 0;
    if (aBadge !== bBadge) return bBadge - aBadge;
    return b.phantomSessions - a.phantomSessions;
  });

  // ── Print Mary review table ───────────────────────────────────────────────
  console.log('══════════════════════════════════════════════════════════════');
  console.log('MARY REVIEW: XP INFLATION + BADGE OVER-GRANTS (post-dedup)');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(
    pad('Student', 28) + lpad('XP', 6) + lpad('RealSess', 10) + lpad('Phantom', 9) +
    '  BadgesHeld              BadgesInvalid'
  );
  console.log(hr(100));
  for (const r of reviewRows) {
    console.log(
      pad(r.name, 28) +
      lpad(r.xpPoints, 6) +
      lpad(r.realCompletedSessions, 10) +
      lpad(r.phantomSessions, 9) +
      '  ' + pad(r.badgesHeld || '—', 24) +
      (r.badgesLikelyInvalid || '—')
    );
  }
  console.log('');

  // ── Write CSV ─────────────────────────────────────────────────────────────
  const csvPath = 'scripts/output/mary-review-post-dedup-2026-05-13.csv';
  const lines = [
    'student_id,student_name,current_xp_points,real_completed_sessions,phantom_sessions_removed,badges_held,badges_likely_invalid,reason',
    ...reviewRows.map(r => csvRow(
      r.studentId, r.name, r.xpPoints, r.realCompletedSessions,
      r.phantomSessions, r.badgesHeld, r.badgesLikelyInvalid, r.reason,
    )),
  ];
  fs.writeFileSync(csvPath, lines.join('\n'));
  console.log(`  ✅ CSV written: ${csvPath}  (${reviewRows.length} rows)\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // SPOT-CHECK A: Canonical with re-pointed recordings
  // Using canonical 880a6947-… (had 3 recordings consolidated from duplicates)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('══════════════════════════════════════════════════════════════');
  console.log('SPOT-CHECK A: Canonical session with re-pointed recordings');
  console.log('  (880a6947 — had 3 recordings consolidated from duplicates)');
  console.log('══════════════════════════════════════════════════════════════\n');

  const canonicalIdA = '880a6947'; // prefix — find full id
  const { data: sessA } = await supabase
    .from('sessions')
    .select('id, student_id, tutor_id, scheduled_at, status, duration_minutes, fathom_recording_url, created_at')
    .ilike('id', `${canonicalIdA}%`)
    .limit(1);

  const sessionA = sessA?.[0];
  if (!sessionA) { console.log('  ⚠️  Session not found'); }
  else {
    const student = studentMap.get(sessionA.student_id);
    console.log('  sessions row:');
    console.log(`    id               : ${sessionA.id}`);
    console.log(`    student          : ${student?.name ?? sessionA.student_id}`);
    console.log(`    scheduled_at     : ${sessionA.scheduled_at}`);
    console.log(`    status           : ${sessionA.status}`);
    console.log(`    duration_minutes : ${sessionA.duration_minutes}`);
    console.log(`    fathom_url       : ${sessionA.fathom_recording_url ?? 'null'}`);
    console.log(`    created_at       : ${sessionA.created_at}`);

    const { data: recsA } = await supabase
      .from('session_recordings')
      .select('id, fathom_recording_id, fathom_recording_url, is_primary, duration_seconds, match_method')
      .eq('session_id', sessionA.id);

    console.log(`\n  session_recordings (${recsA?.length ?? 0} rows):`);
    console.log('  ' + hr(96));
    console.log('  ' + pad('rec_id (short)', 12) + pad('fathom_rec_id', 16) + pad('is_primary', 12) + pad('duration_s', 12) + pad('match_method', 16) + 'url (tail-30)');
    console.log('  ' + hr(96));
    for (const r of recsA ?? []) {
      const urlTail = r.fathom_recording_url?.slice(-30) ?? 'null';
      const primaryStr = r.is_primary ? '✅ TRUE ' : 'false  ';
      console.log('  ' + pad(r.id.slice(0, 8) + '…', 12) + lpad(r.fathom_recording_id, 16) + '  ' + pad(primaryStr, 10) + lpad(r.duration_seconds ?? '—', 12) + '  ' + pad(r.match_method ?? '—', 14) + '  ' + urlTail);
    }

    // Cross-check
    const primaryRec = (recsA ?? []).find(r => r.is_primary);
    const urlMatch = primaryRec?.fathom_recording_url === sessionA.fathom_recording_url;
    console.log(`\n  Cross-check: sessions.fathom_recording_url matches is_primary row → ${urlMatch ? '✅ YES' : '❌ NO — MISMATCH'}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SPOT-CHECK B: URL-merge session (Arnav Mishra — d77015d0)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('SPOT-CHECK B: URL-merge session');
  console.log('  (Arnav Mishra — d77015d0, canonical had null url, merged from dup)');
  console.log('══════════════════════════════════════════════════════════════\n');

  const { data: sessB } = await supabase
    .from('sessions')
    .select('id, student_id, scheduled_at, status, fathom_recording_url, created_at')
    .ilike('id', 'd77015d0%')
    .limit(1);

  const sessionB = sessB?.[0];
  if (!sessionB) { console.log('  ⚠️  Session not found'); }
  else {
    const student = studentMap.get(sessionB.student_id);
    console.log('  sessions row (post-dedup):');
    console.log(`    id               : ${sessionB.id}`);
    console.log(`    student          : ${student?.name ?? sessionB.student_id}`);
    console.log(`    scheduled_at     : ${sessionB.scheduled_at}`);
    console.log(`    status           : ${sessionB.status}`);
    console.log(`    fathom_url       : ${sessionB.fathom_recording_url ?? '⚠️ still null'}`);
    console.log(`    before (pre-dedup): null (canonical had no URL; URL lived on duplicate)`);

    const { data: recsB } = await supabase
      .from('session_recordings')
      .select('id, fathom_recording_id, fathom_recording_url, is_primary, duration_seconds, match_method')
      .eq('session_id', sessionB.id);

    console.log(`\n  session_recordings (${recsB?.length ?? 0} rows):`);
    console.log('  ' + hr(96));
    console.log('  ' + pad('rec_id (short)', 12) + pad('fathom_rec_id', 16) + pad('is_primary', 12) + pad('duration_s', 12) + pad('match_method', 16) + 'url (tail-35)');
    console.log('  ' + hr(96));
    for (const r of recsB ?? []) {
      const urlTail = r.fathom_recording_url?.slice(-35) ?? 'null';
      const primaryStr = r.is_primary ? '✅ TRUE ' : 'false  ';
      console.log('  ' + pad(r.id.slice(0, 8) + '…', 12) + lpad(r.fathom_recording_id, 16) + '  ' + pad(primaryStr, 10) + lpad(r.duration_seconds ?? '—', 12) + '  ' + pad(r.match_method ?? '—', 14) + '  ' + urlTail);
    }

    const primaryRec = (recsB ?? []).find(r => r.is_primary);
    const urlMatch = primaryRec?.fathom_recording_url === sessionB.fathom_recording_url;
    console.log(`\n  Cross-check: sessions.fathom_recording_url matches is_primary row → ${urlMatch ? '✅ YES' : '❌ NO — MISMATCH'}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SPOT-CHECK C: Status-flip student — Lauren Streck
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('SPOT-CHECK C: Status-flip student — Lauren Streck');
  console.log('  (was status=completed, 0h recorded; now active, 15.5h used, 5.5h remaining)');
  console.log('══════════════════════════════════════════════════════════════\n');

  const { data: laurenRows } = await supabase
    .from('students')
    .select('id, name, status, used_hours, purchased_hours, low_hours_alerted, badges, xp_points')
    .eq('name', 'Lauren Streck')
    .limit(1);

  const lauren = laurenRows?.[0];
  if (!lauren) { console.log('  ⚠️  Student not found'); }
  else {
    const remaining = (lauren.purchased_hours ?? 0) - (lauren.used_hours ?? 0);

    console.log('  students row (post-dedup):');
    console.log(`    id                  : ${lauren.id}`);
    console.log(`    name                : ${lauren.name}`);
    console.log(`    status              : ${lauren.status}  ${lauren.status === 'active' ? '✅ (was: completed)' : '⚠️  unexpected value'}`);
    console.log(`    used_hours          : ${lauren.used_hours}h  (was: 0h before recompute)`);
    console.log(`    purchased_hours     : ${lauren.purchased_hours}h`);
    console.log(`    remaining           : ${remaining.toFixed(1)}h  ${remaining >= 5 ? '✅' : '⚠️  < 5h'}`);
    console.log(`    low_hours_alerted   : ${lauren.low_hours_alerted}`);
    console.log(`    xp_points           : ${lauren.xp_points ?? 0}`);
    console.log(`    badges              : ${(lauren.badges ?? []).join(', ') || '—'}`);

    // Count her real completed sessions
    const { data: laurenSessions } = await supabase
      .from('sessions')
      .select('id, status, duration_minutes, scheduled_at')
      .eq('student_id', lauren.id)
      .eq('status', 'completed');

    const totalMin = (laurenSessions ?? []).reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
    const expectedUsed = computeUsedHours(totalMin);

    console.log(`\n  Completed sessions: ${laurenSessions?.length ?? 0}  (total_minutes=${totalMin})`)
    console.log(`  Formula check: computeUsedHours(${totalMin}) = ${expectedUsed}h  → matches stored ${lauren.used_hours}h? ${expectedUsed === lauren.used_hours ? '✅ YES' : '❌ NO'}`);
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('SPOT-CHECKS COMPLETE.');
  console.log('══════════════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error(e); process.exit(1); });
