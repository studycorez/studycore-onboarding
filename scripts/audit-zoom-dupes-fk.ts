/**
 * audit-zoom-dupes-fk.ts
 *
 * Complete FK audit: find every table with a session_id column and count
 * how many rows point at the 250 non-canonical session_ids from Step B.
 *
 * Makes ZERO writes.
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/audit-zoom-dupes-fk.ts
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
  console.log('\n=== Complete FK Audit for Step B ===\n');

  // ── Rebuild the 250 non-canonical session_ids ─────────────────────────────
  const { data: allSessions, error } = await supabase
    .from('sessions')
    .select('id, zoom_meeting_id, student_id, tutor_id, scheduled_at, created_at')
    .not('zoom_meeting_id', 'is', null)
    .order('scheduled_at');

  if (error) { console.error('Error:', error.message); process.exit(1); }

  type SessionRow = NonNullable<typeof allSessions>[number];

  const groupMap = new Map<string, SessionRow[]>();
  for (const s of allSessions ?? []) {
    const key = `${s.zoom_meeting_id}|${s.student_id}|${s.scheduled_at}`;
    const arr = groupMap.get(key) ?? [];
    arr.push(s);
    groupMap.set(key, arr);
  }

  const dupeGroups = [...groupMap.values()].filter(g => g.length > 1);

  function pickCanonical(group: SessionRow[]): { canonicalId: string; deleteIds: string[] } {
    const sorted = [...group].sort((a, b) => {
      const aN = a.tutor_id === null ? 1 : 0;
      const bN = b.tutor_id === null ? 1 : 0;
      if (aN !== bN) return aN - bN;
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      if (ta !== tb) return ta - tb;
      return a.id < b.id ? -1 : 1;
    });
    return { canonicalId: sorted[0].id, deleteIds: sorted.slice(1).map(s => s.id) };
  }

  const deleteIds: string[] = [];
  for (const g of dupeGroups) {
    const { deleteIds: d } = pickCanonical(g);
    deleteIds.push(...d);
  }

  console.log(`Non-canonical session_ids to audit: ${deleteIds.length}\n`);

  // ── Helper: count rows in batches ─────────────────────────────────────────
  async function countIn(table: string, column: string, ids: string[]): Promise<number> {
    let total = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { count } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .in(column, chunk);
      total += count ?? 0;
    }
    return total;
  }

  // ── Tables to check (all known session_id columns) ────────────────────────
  // Found via schema inspection + codebase grep
  const checks: Array<{ table: string; column: string; note?: string }> = [
    { table: 'session_recordings',      column: 'session_id' },
    { table: 'reschedule_requests',     column: 'session_id' },
    { table: 'nps_surveys',             column: 'session_id' },
    { table: 'xp_events',              column: 'session_id' },
    { table: 'group_session_attendance', column: 'session_id' },
    // contracts violations: session_id is on contract_violations (or similar)
    // try both possible table names
    { table: 'contract_violations',     column: 'session_id',  note: 'if table exists' },
    { table: 'violations',              column: 'session_id',  note: 'if table exists' },
  ];

  console.log('Table                         | Column     | Rows pointing at non-canonicals');
  console.log('------------------------------|------------|--------------------------------');

  for (const { table, column, note } of checks) {
    try {
      const count = await countIn(table, column, deleteIds);
      const noteStr = note ? ` (${note})` : '';
      console.log(`${table.padEnd(30)}| ${column.padEnd(10)} | ${count}${noteStr}`);
    } catch {
      console.log(`${table.padEnd(30)}| ${column.padEnd(10)} | ERROR / table not found`);
    }
  }

  // ── Also check for violation_session_id on contracts ─────────────────────
  console.log('\nChecking contracts.violation_session_id...');
  try {
    let total = 0;
    for (let i = 0; i < deleteIds.length; i += 100) {
      const chunk = deleteIds.slice(i, i + 100);
      const { count } = await supabase
        .from('contracts')
        .select('id', { count: 'exact', head: true })
        .in('violation_session_id', chunk);
      total += count ?? 0;
    }
    console.log(`  contracts.violation_session_id pointing at non-canonicals: ${total}`);
  } catch {
    console.log('  contracts.violation_session_id: column not found or error');
  }

  // ── Check for session_id on student_progress ──────────────────────────────
  console.log('\nChecking student_progress.session_id...');
  try {
    const count = await countIn('student_progress', 'session_id', deleteIds);
    console.log(`  student_progress.session_id pointing at non-canonicals: ${count}`);
  } catch {
    console.log('  student_progress: table or column not found');
  }

  console.log('\n=== FK Audit complete ===\n');
}

main().catch(err => { console.error(err); process.exit(1); });
