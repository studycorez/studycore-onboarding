/**
 * Smoke test: verifies fetchAllPaginated returns the same count as Supabase exact count.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/test-paginated.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { fetchAllPaginated } from '../src/lib/supabase-helpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const sessions = await fetchAllPaginated(
    supabase.from('sessions').select('id').order('id'),
  );
  console.log(`fetchAllPaginated returned ${sessions.length} sessions`);

  // Compare against raw count
  const { count } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true });
  console.log(`Supabase count exact: ${count}`);

  if (sessions.length !== count) {
    console.error('MISMATCH: pagination returned wrong count');
    process.exit(1);
  } else {
    console.log('✓ Pagination matches exact count');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
