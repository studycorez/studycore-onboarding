/**
 * Adds tutor_rating (1-5) to the sessions table.
 * Run: npx ts-node --project tsconfig.json scripts/migrate-tutor-ratings.ts
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  console.log('Adding tutor_rating column to sessions...\n');

  // Try inserting a dummy value to see if column exists
  const { error: checkErr } = await supabase
    .from('sessions')
    .select('tutor_rating')
    .limit(1);

  if (!checkErr) {
    console.log('Column tutor_rating already exists. Nothing to do.');
    return;
  }

  console.log('Column does not exist. Run the following SQL in your Supabase SQL editor:\n');
  console.log('ALTER TABLE sessions ADD COLUMN tutor_rating smallint CHECK (tutor_rating >= 1 AND tutor_rating <= 5);');
  console.log('\nThen re-run this script to verify.');
}

main().catch(console.error);
