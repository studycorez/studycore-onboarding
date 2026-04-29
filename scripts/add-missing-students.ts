/**
 * Inserts 6 missing students if they don't already exist.
 * Run: npx ts-node --project tsconfig.json scripts/add-missing-students.ts
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

const STUDENTS = [
  { name: 'Aadhya Ganatra',  email: 'adhyaganatra1@gmail.com',          parent_email: 'ishaganatra1@gmail.com' },
  { name: 'Aanya Sheth',     email: 'aanyasheth@gmail.com',             parent_email: null },
  { name: 'Javyn',           email: 'jj4196@pleasantonusd.net',         parent_email: null },
  { name: 'Snehansh',        email: 'snehanshb@gmail.com',              parent_email: null },
  { name: 'Maz',             email: '4maaz.k00@gmail.com',              parent_email: null },
  { name: 'Kara Harris',     email: 'kkcrumblecookie@gmail.com',        parent_email: null },
];

async function main() {
  console.log('Checking for missing students...\n');

  for (const s of STUDENTS) {
    const { data: existing } = await supabase
      .from('students')
      .select('id, name, email')
      .ilike('email', s.email)
      .maybeSingle();

    if (existing) {
      console.log(`SKIP  ${s.name} <${s.email}> — already exists (id: ${existing.id})`);
      continue;
    }

    const payload: Record<string, string | null> = {
      name:         s.name,
      email:        s.email,
      parent_email: s.parent_email,
      status:       'active',
    };

    const { data: inserted, error } = await supabase
      .from('students')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      console.error(`ERROR ${s.name}: ${error.message}`);
    } else {
      console.log(`INSERT ${s.name} <${s.email}> → id: ${inserted.id}`);
    }
  }

  console.log('\nDone.');
}

main().catch(console.error);
