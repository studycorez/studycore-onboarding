/**
 * Group Sessions DB migration via pg (direct Postgres connection)
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { Client } from 'pg';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// project-ref is the subdomain: https://{ref}.supabase.co
const ref = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD;

if (!dbPassword) {
  console.error([
    'ERROR: No database password found.',
    'Please set one of these env vars in .env.local:',
    '  SUPABASE_DB_PASSWORD=<your-database-password>',
    '',
    'Your database password is the one you set when creating the Supabase project.',
    'Find it at: https://supabase.com/dashboard/project/' + ref + '/settings/database',
    '',
    'Alternatively, run the following SQL in the Supabase SQL editor:',
    '',
    'ALTER TABLE students',
    '  ADD COLUMN IF NOT EXISTS group_sessions_enabled boolean DEFAULT false,',
    '  ADD COLUMN IF NOT EXISTS group_session_hours_allocated numeric DEFAULT 0,',
    '  ADD COLUMN IF NOT EXISTS group_session_hours_used numeric DEFAULT 0;',
    '',
    'ALTER TABLE sessions',
    '  ADD COLUMN IF NOT EXISTS is_group_session boolean DEFAULT false,',
    '  ADD COLUMN IF NOT EXISTS max_students integer DEFAULT 1;',
    '',
    'CREATE TABLE IF NOT EXISTS group_session_attendance (',
    '  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,',
    '  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,',
    '  student_id uuid REFERENCES students(id) ON DELETE CASCADE,',
    '  attended boolean DEFAULT false,',
    '  hours_deducted numeric DEFAULT 0,',
    '  created_at timestamptz DEFAULT now()',
    ');',
  ].join('\n'));
  process.exit(1);
}

const client = new Client({
  host: `db.${ref}.supabase.co`,
  port: 5432,
  user: 'postgres',
  password: dbPassword,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('═══ Group Sessions Migration (pg) ═══\n');
  await client.connect();
  console.log('  Connected to database ✓\n');

  const statements: [string, string][] = [
    ['students columns', `
      ALTER TABLE students
        ADD COLUMN IF NOT EXISTS group_sessions_enabled boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS group_session_hours_allocated numeric DEFAULT 0,
        ADD COLUMN IF NOT EXISTS group_session_hours_used numeric DEFAULT 0;
    `],
    ['sessions columns', `
      ALTER TABLE sessions
        ADD COLUMN IF NOT EXISTS is_group_session boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS max_students integer DEFAULT 1;
    `],
    ['group_session_attendance table', `
      CREATE TABLE IF NOT EXISTS group_session_attendance (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
        student_id uuid REFERENCES students(id) ON DELETE CASCADE,
        attended boolean DEFAULT false,
        hours_deducted numeric DEFAULT 0,
        created_at timestamptz DEFAULT now()
      );
    `],
  ];

  for (const [label, sql] of statements) {
    process.stdout.write(`  ${label} … `);
    try {
      await client.query(sql);
      console.log('✓');
    } catch (err: any) {
      console.log('✗ ' + err.message);
      await client.end();
      process.exit(1);
    }
  }

  // Verify
  console.log('\n  Verifying schema…');
  const cols: [string, string][] = [
    ['students', 'group_sessions_enabled'],
    ['students', 'group_session_hours_allocated'],
    ['students', 'group_session_hours_used'],
    ['sessions', 'is_group_session'],
    ['sessions', 'max_students'],
  ];
  for (const [tbl, col] of cols) {
    const res = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`, [tbl, col]);
    const ok = res.rows.length > 0;
    console.log(`    ${ok ? '✓' : '✗'} ${tbl}.${col}`);
    if (!ok) process.exit(1);
  }
  const tblRes = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='group_session_attendance'`);
  const tblOk = tblRes.rows.length > 0;
  console.log(`    ${tblOk ? '✓' : '✗'} group_session_attendance table`);
  if (!tblOk) process.exit(1);

  await client.end();
  console.log('\n═══ Migration complete ✓ ═══\n');
}

main().catch(async err => {
  await client.end().catch(() => {});
  console.error(err);
  process.exit(1);
});
