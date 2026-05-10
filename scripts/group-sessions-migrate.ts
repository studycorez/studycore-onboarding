/**
 * Group Sessions DB migration
 * Adds columns to students/sessions and creates group_session_attendance table.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').replace('.supabase.co', '');

async function runSQL(sql: string): Promise<void> {
  // Try exec_sql RPC first (exists if the helper function was created)
  const { error: rpcErr } = await (supabase as any).rpc('exec_sql', { q: sql });
  if (!rpcErr) return;

  // Fallback: Supabase Management REST API (requires SUPABASE_ACCESS_TOKEN env var)
  const pat = process.env.SUPABASE_ACCESS_TOKEN;
  if (pat) {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pat}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      },
    );
    if (res.ok) return;
    const body = await res.text();
    throw new Error(`Management API failed: ${body}`);
  }

  throw new Error(
    `Cannot execute DDL: exec_sql RPC not found (${rpcErr.message}) and SUPABASE_ACCESS_TOKEN not set.\n` +
    `Please run the following SQL in the Supabase dashboard SQL editor:\n\n${sql}`,
  );
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const { data } = await supabase
    .from('information_schema.columns' as any)
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', table)
    .eq('column_name', column);
  return (data?.length ?? 0) > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const { data } = await supabase
    .from('information_schema.tables' as any)
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_name', table);
  return (data?.length ?? 0) > 0;
}

async function main() {
  console.log('═══ Group Sessions Migration ═══\n');

  // ── Students columns ──────────────────────────────────────────────────────
  const studentsAlter = `
    ALTER TABLE students
      ADD COLUMN IF NOT EXISTS group_sessions_enabled boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS group_session_hours_allocated numeric DEFAULT 0,
      ADD COLUMN IF NOT EXISTS group_session_hours_used numeric DEFAULT 0;
  `.trim();

  // ── Sessions columns ──────────────────────────────────────────────────────
  const sessionsAlter = `
    ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS is_group_session boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS max_students integer DEFAULT 1;
  `.trim();

  // ── Attendance table ──────────────────────────────────────────────────────
  const attendanceCreate = `
    CREATE TABLE IF NOT EXISTS group_session_attendance (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
      student_id uuid REFERENCES students(id) ON DELETE CASCADE,
      attended boolean DEFAULT false,
      hours_deducted numeric DEFAULT 0,
      created_at timestamptz DEFAULT now()
    );
  `.trim();

  // Run each migration
  for (const [label, sql] of [
    ['students columns', studentsAlter],
    ['sessions columns', sessionsAlter],
    ['group_session_attendance table', attendanceCreate],
  ] as [string, string][]) {
    process.stdout.write(`  Running: ${label} … `);
    try {
      await runSQL(sql);
      console.log('✓');
    } catch (err: any) {
      console.log('✗');
      console.error('\n' + err.message);
      process.exit(1);
    }
  }

  // ── Verify ────────────────────────────────────────────────────────────────
  console.log('\n  Verifying schema…');

  const checks: [string, string][] = [
    ['students', 'group_sessions_enabled'],
    ['students', 'group_session_hours_allocated'],
    ['students', 'group_session_hours_used'],
    ['sessions', 'is_group_session'],
    ['sessions', 'max_students'],
  ];

  let allOk = true;
  for (const [tbl, col] of checks) {
    const ok = await columnExists(tbl, col);
    console.log(`    ${ok ? '✓' : '✗'} ${tbl}.${col}`);
    if (!ok) allOk = false;
  }

  const attOk = await tableExists('group_session_attendance');
  console.log(`    ${attOk ? '✓' : '✗'} group_session_attendance table`);
  if (!attOk) allOk = false;

  if (!allOk) {
    console.error('\n  Some checks failed. Please verify the migrations ran correctly.');
    process.exit(1);
  }

  console.log('\n═══ Migration complete ✓ ═══\n');
}

main().catch(err => { console.error(err); process.exit(1); });
