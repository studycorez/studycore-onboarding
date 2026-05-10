/**
 * Group Sessions DB migration via pg pooler
 * Tries various connection formats with the service role key
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { Client } from 'pg';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ref = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MIGRATIONS = [
  {
    label: 'students columns',
    sql: `ALTER TABLE students
      ADD COLUMN IF NOT EXISTS group_sessions_enabled boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS group_session_hours_allocated numeric DEFAULT 0,
      ADD COLUMN IF NOT EXISTS group_session_hours_used numeric DEFAULT 0`,
  },
  {
    label: 'sessions columns',
    sql: `ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS is_group_session boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS max_students integer DEFAULT 1`,
  },
  {
    label: 'group_session_attendance table',
    sql: `CREATE TABLE IF NOT EXISTS group_session_attendance (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
      student_id uuid REFERENCES students(id) ON DELETE CASCADE,
      attended boolean DEFAULT false,
      hours_deducted numeric DEFAULT 0,
      created_at timestamptz DEFAULT now()
    )`,
  },
];

const CONNECTIONS = [
  // Try pooler with service role key as password
  {
    host: `aws-0-us-east-1.pooler.supabase.com`,
    port: 6543,
    user: `postgres.${ref}`,
    password: serviceRoleKey,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    label: 'Pooler (transaction mode)',
  },
  {
    host: `aws-0-us-east-1.pooler.supabase.com`,
    port: 5432,
    user: `postgres.${ref}`,
    password: serviceRoleKey,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    label: 'Pooler (session mode)',
  },
  // Direct connection
  {
    host: `db.${ref}.supabase.co`,
    port: 5432,
    user: 'postgres',
    password: serviceRoleKey,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    label: 'Direct (postgres user, service role key as pwd)',
  },
];

async function tryConnection(connConfig: typeof CONNECTIONS[0]): Promise<Client | null> {
  const client = new Client(connConfig);
  try {
    await client.connect();
    return client;
  } catch {
    return null;
  }
}

async function main() {
  console.log('═══ Group Sessions Migration ═══\n');
  console.log('Trying database connections…\n');

  let connectedClient: Client | null = null;
  for (const connConfig of CONNECTIONS) {
    process.stdout.write(`  ${connConfig.label} … `);
    const client = await tryConnection(connConfig);
    if (client) {
      console.log('✓ connected');
      connectedClient = client;
      break;
    }
    console.log('✗');
  }

  if (!connectedClient) {
    console.error([
      '\nAll connection attempts failed.',
      'Please run the following SQL in the Supabase SQL editor:',
      'https://supabase.com/dashboard/project/' + ref + '/sql/new',
      '',
      '--- COPY BELOW ---',
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
      '',
      '--- COPY ABOVE ---',
      '',
      'After running in the dashboard, set SUPABASE_DB_PASSWORD in .env.local',
      'and re-run: npx tsx scripts/group-sessions-migrate-pg.ts',
    ].join('\n'));
    process.exit(1);
  }

  console.log('\nRunning migrations…');
  for (const { label, sql } of MIGRATIONS) {
    process.stdout.write(`  ${label} … `);
    try {
      await connectedClient.query(sql);
      console.log('✓');
    } catch (err: any) {
      console.log(`✗ ${err.message}`);
      await connectedClient.end();
      process.exit(1);
    }
  }

  // Verify
  console.log('\nVerifying schema…');
  const checks: [string, string][] = [
    ['students', 'group_sessions_enabled'],
    ['students', 'group_session_hours_allocated'],
    ['students', 'group_session_hours_used'],
    ['sessions', 'is_group_session'],
    ['sessions', 'max_students'],
  ];
  for (const [tbl, col] of checks) {
    const res = await connectedClient.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
      [tbl, col]
    );
    const ok = res.rows.length > 0;
    console.log(`  ${ok ? '✓' : '✗'} ${tbl}.${col}`);
  }
  const tblRes = await connectedClient.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='group_session_attendance'`
  );
  console.log(`  ${tblRes.rows.length > 0 ? '✓' : '✗'} group_session_attendance table`);

  await connectedClient.end();
  console.log('\n═══ Done ═══\n');
}

main().catch(err => { console.error(err); process.exit(1); });
