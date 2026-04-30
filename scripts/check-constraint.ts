import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Try inserting a known-bad value to see the constraint message, then a known-good one
  // First, let's try to read the constraint via pg_catalog through a raw query
  const { data, error } = await supabase.rpc('get_constraint_def', {});
  console.log('rpc:', JSON.stringify(data), JSON.stringify(error));

  // Try a test insert to see what the constraint actually is
  const testCases = [
    { start: '07:00:00', end: '08:00:00', label: '7am-8am' },
    { start: '22:00:00', end: '23:00:00', label: '10pm-11pm' },
    { start: '23:00:00', end: '23:30:00', label: '11pm-11:30pm' },
    { start: '23:30:00', end: '00:00:00', label: '11:30pm-midnight' },
    { start: '06:00:00', end: '07:00:00', label: '6am-7am' },
  ];

  // Use a dummy tutor_id that won't conflict — just to test constraint
  const dummyTutorId = '00000000-0000-0000-0000-000000000000';
  for (const tc of testCases) {
    const { error: e } = await supabase.from('tutor_availability').insert({
      tutor_id: dummyTutorId,
      day_of_week: 0,
      start_time: tc.start,
      end_time: tc.end,
      is_active: true,
    });
    if (e) {
      console.log(`FAIL ${tc.label}: ${e.message}`);
    } else {
      console.log(`PASS ${tc.label}`);
      // clean up
      await supabase.from('tutor_availability').delete()
        .eq('tutor_id', dummyTutorId).eq('day_of_week', 0);
    }
  }
}
main().catch(console.error);
