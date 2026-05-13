/**
 * run-migrations.ts — adds columns for permanent Zoom links and duration tracking.
 * Run once: npx ts-node --project tsconfig.scripts.json scripts/run-migrations.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Client } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Supabase exposes Postgres directly via the pooler URL.
// Format: postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
// We derive it from the project ref + service key (which IS the postgres password for service role).
// Alternatively rely on DATABASE_URL if set.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0]; // egulthvtlfywawalcjtq
const dbPassword = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const connectionString =
  process.env.DATABASE_URL ??
  `postgresql://postgres.${projectRef}:${dbPassword}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

const migrations: { name: string; sql: string }[] = [
  {
    name: 'contracts.permanent_zoom_link',
    sql: `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS permanent_zoom_link text`,
  },
  {
    name: 'contracts.permanent_zoom_meeting_id',
    sql: `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS permanent_zoom_meeting_id bigint`,
  },
  {
    name: 'contracts.permanent_zoom_host_url',
    sql: `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS permanent_zoom_host_url text`,
  },
  {
    name: 'sessions.uses_permanent_link',
    sql: `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS uses_permanent_link boolean DEFAULT false`,
  },
  {
    name: 'sessions.actual_duration_minutes',
    sql: `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS actual_duration_minutes integer`,
  },
];

async function main() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to Supabase Postgres.\n');

    for (const { name, sql } of migrations) {
      try {
        await client.query(sql);
        console.log(`  ✓ ${name}`);
      } catch (err: any) {
        if (err.message?.includes('already exists')) {
          console.log(`  ~ ${name} (already applied)`);
        } else {
          console.error(`  ✗ ${name}: ${err.message}`);
        }
      }
    }

    console.log('\nAll migrations complete.');
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
