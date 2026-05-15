/**
 * audit-zoom-dupes-step-b.ts
 *
 * Step B investigation: characterize the 77 same-(zoom_meeting_id, student_id,
 * scheduled_at) duplicate groups that survived May-13 dedup (different tutor_id).
 *
 * Makes ZERO writes. Dry-run/audit only.
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/audit-zoom-dupes-step-b.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log('\n=== Step B: Zoom Duplicate Group Audit ===\n');

  // ── PART 1: Fetch all sessions with a zoom_meeting_id ──────────────────────
  const { data: allSessions, error } = await supabase
    .from('sessions')
    .select('id, zoom_meeting_id, student_id, tutor_id, scheduled_at, status, created_at, payment_status')
    .not('zoom_meeting_id', 'is', null)
    .order('scheduled_at');

  if (error) { console.error('Error fetching sessions:', error.message); process.exit(1); }

  // Group by (zoom_meeting_id, student_id, scheduled_at)
  const groupMap = new Map<string, typeof allSessions>();
  for (const s of allSessions ?? []) {
    const key = `${s.zoom_meeting_id}|${s.student_id}|${s.scheduled_at}`;
    const arr = groupMap.get(key) ?? [];
    arr.push(s);
    groupMap.set(key, arr);
  }

  // Filter to only duplicate groups (cnt > 1)
  const dupeGroups = [...groupMap.values()].filter(g => g.length > 1);

  console.log(`Total duplicate groups: ${dupeGroups.length}`);

  // ── Size distribution ──────────────────────────────────────────────────────
  const sizeDist: Record<number, number> = {};
  for (const g of dupeGroups) sizeDist[g.length] = (sizeDist[g.length] ?? 0) + 1;
  console.log('\nGroup size distribution:');
  for (const [size, count] of Object.entries(sizeDist).sort()) {
    console.log(`  ${size}-row groups: ${count}`);
  }

  // ── Tutor-id pattern distribution ─────────────────────────────────────────
  let patternNullNonNull = 0;   // one null, one+ non-null
  let patternAllNonNull  = 0;   // all non-null, but differ
  let patternIdentical   = 0;   // all tutor_ids identical (should be 0)
  let patternAllNull     = 0;   // all null

  for (const g of dupeGroups) {
    const tutor_ids = g.map(s => s.tutor_id);
    const nonNulls = tutor_ids.filter(t => t !== null);
    const unique   = new Set(tutor_ids.filter(t => t !== null));

    if (nonNulls.length === 0) {
      patternAllNull++;
    } else if (nonNulls.length === g.length && unique.size === 1) {
      patternIdentical++;
    } else if (nonNulls.length < g.length) {
      patternNullNonNull++;
    } else {
      patternAllNonNull++;
    }
  }

  console.log('\nTutor-id pattern breakdown:');
  console.log(`  null + non-null mix     : ${patternNullNonNull}`);
  console.log(`  all non-null but differ : ${patternAllNonNull}`);
  console.log(`  identical tutor_id      : ${patternIdentical}  ← should be 0`);
  console.log(`  all null                : ${patternAllNull}`);

  // ── created_at gap distribution ───────────────────────────────────────────
  const gaps: number[] = []; // seconds between first and last in each group
  for (const g of dupeGroups) {
    const ts = g.map(s => new Date(s.created_at).getTime()).sort((a, b) => a - b);
    const gapSec = (ts[ts.length - 1] - ts[0]) / 1000;
    gaps.push(gapSec);
  }
  const gapBuckets = { seconds: 0, minutes: 0, hours: 0, days: 0 };
  for (const g of gaps) {
    if      (g < 60)      gapBuckets.seconds++;
    else if (g < 3600)    gapBuckets.minutes++;
    else if (g < 86400)   gapBuckets.hours++;
    else                  gapBuckets.days++;
  }
  console.log('\ncreated_at gap within groups:');
  console.log(`  < 1 minute  : ${gapBuckets.seconds}`);
  console.log(`  1-60 min    : ${gapBuckets.minutes}`);
  console.log(`  1-24 h      : ${gapBuckets.hours}`);
  console.log(`  > 1 day     : ${gapBuckets.days}`);

  // ── PART 2: Policy — pick canonical row ───────────────────────────────────
  // Rule: prefer non-null tutor_id; among ties, earliest created_at; tiebreak lowest id.
  interface CanonicalResult {
    canonicalId: string;
    deleteIds: string[];
    reason: string;
  }

  type SessionRow = NonNullable<typeof allSessions>[number];

  function pickCanonical(group: SessionRow[]): CanonicalResult {
    const sorted = [...group].sort((a, b) => {
      // Non-null tutor_id wins
      const aN = a.tutor_id === null ? 1 : 0;
      const bN = b.tutor_id === null ? 1 : 0;
      if (aN !== bN) return aN - bN;
      // Earlier created_at wins
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      if (ta !== tb) return ta - tb;
      // Lowest UUID tiebreak
      return a.id < b.id ? -1 : 1;
    });
    const canonical = sorted[0];
    const deleteIds = sorted.slice(1).map(s => s.id);

    const tutor_ids = group.map(s => s.tutor_id);
    const hasNull   = tutor_ids.some(t => t === null);
    const reason    = hasNull ? 'non-null tutor_id preferred' : 'earliest created_at';
    return { canonicalId: canonical.id, deleteIds, reason };
  }

  const allDeleteIds: string[] = [];
  const canonicalResults: CanonicalResult[] = [];
  for (const g of dupeGroups) {
    const r = pickCanonical(g);
    canonicalResults.push(r);
    allDeleteIds.push(...r.deleteIds);
  }

  // ── Status conflicts ───────────────────────────────────────────────────────
  let statusConflicts = 0;
  for (const g of dupeGroups) {
    const statuses = new Set(g.map(s => s.status));
    if (statuses.size > 1) statusConflicts++;
  }
  console.log(`\nStatus conflicts (mixed status within group): ${statusConflicts}`);

  // Print sample of status-conflicted groups
  const conflictedGroups = dupeGroups.filter(g => new Set(g.map(s => s.status)).size > 1);
  if (conflictedGroups.length > 0) {
    console.log('  Examples (first 5):');
    for (const g of conflictedGroups.slice(0, 5)) {
      const r = pickCanonical(g);
      console.log(`    zoom=${g[0].zoom_meeting_id} student=${g[0].student_id} scheduled=${g[0].scheduled_at?.slice(0,16)}`);
      for (const s of g) {
        console.log(`      id=${s.id} status=${s.status} tutor=${s.tutor_id} created=${s.created_at?.slice(0,19)} ${s.id === r.canonicalId ? '← KEEP' : '← DELETE'}`);
      }
    }
  }

  // ── PART 3: FK dependency check ───────────────────────────────────────────
  console.log(`\n── FK Dependency Audit (${allDeleteIds.length} non-canonical session_ids) ──`);

  // Check in batches of 100 to avoid URL length limits
  async function countIn(table: string, column: string, ids: string[]): Promise<number> {
    let total = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { count } = await supabase.from(table).select('id', { count: 'exact', head: true }).in(column, chunk);
      total += count ?? 0;
    }
    return total;
  }

  const srCount        = await countIn('session_recordings', 'session_id', allDeleteIds);
  const reschedCount   = await countIn('reschedule_requests', 'session_id', allDeleteIds);
  const npsCount       = await countIn('nps_surveys', 'session_id', allDeleteIds);

  // xp_events: linked by description containing session id? Check actual column.
  // Try session_id column directly first.
  const xpDirect = await countIn('xp_events', 'session_id', allDeleteIds).catch(() => -1);

  console.log(`  session_recordings rows pointing at non-canonical sessions : ${srCount}`);
  console.log(`  reschedule_requests rows                                   : ${reschedCount}`);
  console.log(`  nps_surveys rows                                           : ${npsCount}`);
  console.log(`  xp_events rows (session_id column)                        : ${xpDirect === -1 ? 'column not found' : xpDirect}`);

  // ── PART 4: Summary ───────────────────────────────────────────────────────
  console.log('\n── Summary ──────────────────────────────────────────────────');
  console.log(`  Total duplicate groups  : ${dupeGroups.length}`);
  console.log(`  Non-canonical rows (to delete) : ${allDeleteIds.length}`);
  console.log(`  session_recordings to re-point : ${srCount}`);

  // ── Sample 5 groups for spot-check ───────────────────────────────────────
  console.log('\n── Sample groups (first 5) ──────────────────────────────────');
  for (let i = 0; i < Math.min(5, dupeGroups.length); i++) {
    const g = dupeGroups[i];
    const r = pickCanonical(g);
    console.log(`  Group ${i + 1}: zoom=${g[0].zoom_meeting_id} student=${g[0].student_id} scheduled=${g[0].scheduled_at?.slice(0,16)}`);
    for (const s of g) {
      const label = s.id === r.canonicalId ? 'KEEP   ' : 'DELETE ';
      console.log(`    [${label}] id=${s.id} tutor=${s.tutor_id ?? 'NULL'} status=${s.status} created=${s.created_at?.slice(0,19)}`);
    }
    console.log(`    Policy reason: ${r.reason}`);
  }

  console.log('\n=== Audit complete ===\n');
}

main().catch(err => { console.error(err); process.exit(1); });
