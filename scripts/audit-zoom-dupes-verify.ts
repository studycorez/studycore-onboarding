/**
 * audit-zoom-dupes-verify.ts
 * Full policy verification + random spot-checks on the 348 duplicate groups.
 * Zero writes.
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

function pickCanonical(group: Row[]): { canonicalId: string; deleteId: string; policy: string } {
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
    canonicalId: sorted[0].id,
    deleteId: sorted[1].id,
    policy: hasNull ? 'Rule1' : 'Rule2',
  };
}

// Seeded pseudo-random for reproducible spot-checks
function seededSample<T>(arr: T[], n: number, seed: number): T[] {
  const copy = [...arr];
  let s = seed;
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

async function main() {
  console.log('\n=== Full Policy Verification + Spot-Checks ===\n');

  const sessions = await fetchAll(
    'sessions',
    'id, zoom_meeting_id, student_id, tutor_id, scheduled_at, created_at, status',
  );
  console.log(`Sessions loaded (paginated): ${sessions.length}`);

  // Build groups
  const groupMap = new Map<string, Row[]>();
  for (const s of sessions) {
    if (!s.zoom_meeting_id) continue;
    const key = `${s.zoom_meeting_id}|${s.student_id}|${s.scheduled_at}`;
    const arr = groupMap.get(key) ?? [];
    arr.push(s);
    groupMap.set(key, arr);
  }
  const dupeGroups = [...groupMap.values()].filter(g => g.length > 1);
  console.log(`Duplicate groups: ${dupeGroups.length}\n`);

  // ── CHECK 1: All 2-row groups ─────────────────────────────────────────────
  const sizeDist: Record<number, number> = {};
  for (const g of dupeGroups) sizeDist[g.length] = (sizeDist[g.length] ?? 0) + 1;
  const allTwoRow = Object.keys(sizeDist).every(k => Number(k) === 2);
  console.log('CHECK 1 — All groups are 2-row:');
  for (const [size, count] of Object.entries(sizeDist).sort()) {
    console.log(`  ${size}-row groups: ${count}`);
  }
  console.log(`  Result: ${allTwoRow ? '✅ PASS' : '❌ FAIL — 3+ row groups exist'}\n`);

  // ── CHECK 2: Zero status conflicts ───────────────────────────────────────
  const statusConflicts = dupeGroups.filter(g => new Set(g.map(s => s.status)).size > 1);
  console.log('CHECK 2 — Zero status conflicts:');
  console.log(`  Groups with mixed status: ${statusConflicts.length}`);
  console.log(`  Result: ${statusConflicts.length === 0 ? '✅ PASS' : '❌ FAIL — status conflicts exist'}\n`);

  // ── CHECK 3: Zero all-null tutor_id groups ───────────────────────────────
  const allNullGroups = dupeGroups.filter(g => g.every(r => r.tutor_id === null));
  console.log('CHECK 3 — Zero all-null tutor_id groups:');
  console.log(`  All-null groups: ${allNullGroups.length}`);
  console.log(`  Result: ${allNullGroups.length === 0 ? '✅ PASS' : '❌ FAIL — all-null tutor groups exist'}\n`);

  // ── CHECK 4: Rule 1 + Rule 2 = exactly 348, no ambiguous ────────────────
  let rule1 = 0, rule2 = 0, ambiguous = 0;
  for (const g of dupeGroups) {
    const { policy } = pickCanonical(g);
    if (policy === 'Rule1') rule1++;
    else if (policy === 'Rule2') rule2++;
    else ambiguous++;
  }
  console.log('CHECK 4 — Rule 1 + Rule 2 = exactly all groups:');
  console.log(`  Rule 1: ${rule1}`);
  console.log(`  Rule 2: ${rule2}`);
  console.log(`  Ambiguous: ${ambiguous}`);
  console.log(`  Total: ${rule1 + rule2 + ambiguous} (expected ${dupeGroups.length})`);
  const check4 = ambiguous === 0 && rule1 + rule2 === dupeGroups.length;
  console.log(`  Result: ${check4 ? '✅ PASS' : '❌ FAIL'}\n`);

  if (!allTwoRow || statusConflicts.length > 0 || allNullGroups.length > 0 || !check4) {
    console.error('❌ One or more checks failed. STOP — do not proceed with --commit.');
    process.exit(1);
  }

  console.log('All 4 checks PASSED. Proceeding to spot-checks.\n');

  // ── SPOT-CHECK: 5 random from each rule ─────────────────────────────────
  const rule1Groups = dupeGroups.filter(g => pickCanonical(g).policy === 'Rule1');
  const rule2Groups = dupeGroups.filter(g => pickCanonical(g).policy === 'Rule2');

  // Fetch tutor names for readability
  const { data: tutors } = await supabase.from('tutors').select('id, name');
  const tutorById = new Map((tutors ?? []).map(t => [t.id, t.name]));

  function tutorLabel(id: string | null): string {
    if (!id) return 'NULL';
    return `${tutorById.get(id) ?? 'unknown'} (${id.slice(0, 8)}…)`;
  }

  function printGroup(g: Row[], idx: number, rule: string) {
    const { canonicalId, deleteId, policy } = pickCanonical(g);
    console.log(`  [${rule} sample ${idx + 1}] zoom=${g[0].zoom_meeting_id} student=${g[0].student_id}`);
    console.log(`    scheduled_at: ${g[0].scheduled_at?.slice(0, 16)}`);
    for (const s of g) {
      const label = s.id === canonicalId ? 'KEEP  ' : 'DELETE';
      console.log(`    [${label}] id=${s.id.slice(0, 8)}… tutor=${tutorLabel(s.tutor_id)} status=${s.status} created=${s.created_at?.slice(0, 19)}`);
    }
    console.log(`    Policy: ${policy}`);
  }

  console.log('── Rule 1 spot-checks (5 random) ────────────────────────────');
  const r1Sample = seededSample(rule1Groups, 5, 42);
  r1Sample.forEach((g, i) => printGroup(g, i, 'Rule1'));

  console.log('\n── Rule 2 spot-checks (5 random) ────────────────────────────');
  const r2Sample = seededSample(rule2Groups, 5, 99);
  r2Sample.forEach((g, i) => printGroup(g, i, 'Rule2'));

  console.log('\n=== Verification complete ===\n');
}

main().catch(err => { console.error(err); process.exit(1); });
