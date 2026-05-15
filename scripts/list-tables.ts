/**
 * Lists all public tables and checks for session_id FKs in each.
 * Run: npx ts-node --project tsconfig.scripts.json scripts/list-tables.ts
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
  // 1. Use RPC to run raw SQL for information_schema queries
  const PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').replace('.supabase.co', '');
  const pat = process.env.SUPABASE_ACCESS_TOKEN;

  async function runSQL(sql: string): Promise<any[] | null> {
    if (pat) {
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: sql }),
        },
      );
      if (res.ok) return res.json() as Promise<any[]>;
      throw new Error(`Management API failed: ${await res.text()}`);
    }
    // fallback: try rpc
    const { data, error } = await (supabase as any).rpc('exec_sql', { q: sql });
    if (error) throw new Error(error.message);
    return data as any[];
  }

  let tables: any[] | null = null;
  let cols: any[] | null = null;
  try {
    tables = await runSQL(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
    cols = await runSQL(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('session_id','resolved_session_id') ORDER BY table_name`);
  } catch (e: any) {
    console.error('Cannot run raw SQL (no SUPABASE_ACCESS_TOKEN or exec_sql RPC):', e.message);
    console.log('Skipping information_schema queries — will rely on migration analysis.');
  }

  console.log('\n=== PUBLIC TABLES (from information_schema) ===');
  if (tables) {
    for (const t of tables) console.log(' ', t.table_name);
  } else {
    console.log('  (unavailable — no direct SQL access)');
  }

  console.log('\n=== TABLES WITH session_id (or resolved_session_id) COLUMN ===');
  if (cols) {
    for (const c of cols) console.log(`  ${c.table_name}.${c.column_name}`);
  } else {
    console.log('  (unavailable — no direct SQL access)');
  }

  // 3. For nps_surveys: count rows and check any with session_id set
  console.log('\n=== NPS_SURVEYS: session_id usage ===');
  const { count: npsTotal } = await supabase
    .from('nps_surveys')
    .select('id', { count: 'exact', head: true });
  const { count: npsWithSession } = await supabase
    .from('nps_surveys')
    .select('id', { count: 'exact', head: true })
    .not('session_id', 'is', null);
  console.log(`  total rows: ${npsTotal}, rows with session_id set: ${npsWithSession}`);

  // 4. Check reschedule_requests: count total and with session_id
  console.log('\n=== RESCHEDULE_REQUESTS: session_id usage ===');
  const { count: rrTotal } = await supabase
    .from('reschedule_requests')
    .select('id', { count: 'exact', head: true });
  const { count: rrWithSession } = await supabase
    .from('reschedule_requests')
    .select('id', { count: 'exact', head: true })
    .not('session_id', 'is', null);
  console.log(`  total rows: ${rrTotal}, rows with session_id set: ${rrWithSession}`);

  // 5. Check group_session_attendance
  console.log('\n=== GROUP_SESSION_ATTENDANCE: session_id usage ===');
  const { count: gsaTotal } = await supabase
    .from('group_session_attendance')
    .select('id', { count: 'exact', head: true });
  console.log(`  total rows: ${gsaTotal}`);

  // 6. Check if any nps_surveys or reschedule_requests point to non-earliest duplicate sessions
  // First get all non-earliest session IDs (duplicate check)
  console.log('\n=== CHECKING IF MISSING FKs POINT TO NON-EARLIEST DUPES ===');

  // Get duplicate groups (same student_id, tutor_id, scheduled_at) — keep earliest per group
  let allNonEarliest: string[] = [];
  let page = 0;
  while (true) {
    const { data: sessionPage } = await supabase
      .from('sessions')
      .select('id, student_id, tutor_id, scheduled_at, created_at')
      .not('tutor_id', 'is', null)
      .order('student_id')
      .order('tutor_id')
      .order('scheduled_at')
      .order('created_at')
      .range(page * 1000, page * 1000 + 999);
    if (!sessionPage || sessionPage.length === 0) break;

    // Group by (student_id, tutor_id, scheduled_at)
    const groups = new Map<string, typeof sessionPage>();
    for (const s of sessionPage) {
      const key = `${s.student_id}|${s.tutor_id}|${s.scheduled_at}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    for (const [, rows] of groups) {
      if (rows.length > 1) {
        // Sort by created_at asc, earliest is canonical
        rows.sort((a, b) => a.created_at < b.created_at ? -1 : 1);
        for (const r of rows.slice(1)) allNonEarliest.push(r.id);
      }
    }
    if (sessionPage.length < 1000) break;
    page++;
  }

  console.log(`  Total non-earliest duplicate session IDs: ${allNonEarliest.length}`);

  if (allNonEarliest.length > 0) {
    // Check nps_surveys
    const { count: npsDupeRefs } = await supabase
      .from('nps_surveys')
      .select('id', { count: 'exact', head: true })
      .in('session_id', allNonEarliest.slice(0, 500)); // PostgREST .in() limit
    console.log(`  nps_surveys pointing to non-earliest dupes: ${npsDupeRefs}`);

    // Check reschedule_requests
    const { count: rrDupeRefs } = await supabase
      .from('reschedule_requests')
      .select('id', { count: 'exact', head: true })
      .in('session_id', allNonEarliest.slice(0, 500));
    console.log(`  reschedule_requests pointing to non-earliest dupes: ${rrDupeRefs}`);

    // Check group_session_attendance
    const { count: gsaDupeRefs } = await supabase
      .from('group_session_attendance')
      .select('id', { count: 'exact', head: true })
      .in('session_id', allNonEarliest.slice(0, 500));
    console.log(`  group_session_attendance pointing to non-earliest dupes: ${gsaDupeRefs}`);
  }

  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
