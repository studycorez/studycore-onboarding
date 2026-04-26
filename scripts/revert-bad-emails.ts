import { resolve } from 'path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const BAD_EMAILS = ['ayonimiaraba@gmail.com', 'celyroser@hotmail.com'];

async function main() {
  const { data: students, error } = await supabase
    .from('students')
    .select('id, name, email')
    .in('email', BAD_EMAILS)
    .order('name');

  if (error) throw new Error(error.message);
  if (!students?.length) { console.log('No students with bad emails found.'); return; }

  console.log(`Found ${students.length} students to revert:\n`);

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const placeholder = `student-${i + 1}@studycore.import`;
    const { error: upErr } = await supabase
      .from('students')
      .update({ email: placeholder })
      .eq('id', s.id);

    if (upErr) {
      console.log(`  ✗ ${s.name} (${s.email}) → ERROR: ${upErr.message}`);
    } else {
      console.log(`  ✓ ${s.name}  ${s.email}  →  ${placeholder}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
