/**
 * Backfill script: populate start_utc, end_utc, source_timezone on all
 * tutor_availability rows that were created before the UTC migration.
 *
 * Idempotent — safe to re-run. Rows are updated unconditionally so that
 * stale UTC values are refreshed if the tutor's timezone has changed.
 *
 * Run with:
 *   npx tsx scripts/backfill-tutor-availability-utc.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { deriveAvailabilityUTC } from '../src/lib/availability-utc';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // Fetch all availability rows
  const { data: slots, error: slotsErr } = await supabase
    .from('tutor_availability')
    .select('id, tutor_id, day_of_week, start_time, end_time');

  if (slotsErr || !slots) {
    console.error('Failed to fetch tutor_availability:', slotsErr?.message);
    process.exit(1);
  }

  // Fetch all tutors with their timezones
  const { data: tutors, error: tutorsErr } = await supabase
    .from('tutors')
    .select('id, timezone');

  if (tutorsErr) {
    console.error('Failed to fetch tutors:', tutorsErr.message);
    process.exit(1);
  }

  const tzMap: Record<string, string> = {};
  for (const t of (tutors ?? [])) {
    tzMap[t.id] = t.timezone ?? 'America/Los_Angeles';
  }

  const total = slots.length;
  console.log(`Backfilling ${total} tutor_availability rows…`);

  let done = 0;
  let failed = 0;

  for (const slot of slots) {
    const tz = tzMap[slot.tutor_id] ?? 'America/Los_Angeles';

    let utcFields: { start_utc: string; end_utc: string; source_timezone: string };
    try {
      utcFields = deriveAvailabilityUTC(slot.day_of_week, slot.start_time, slot.end_time, tz);
    } catch (err) {
      console.warn(`  SKIP id=${slot.id} (${slot.start_time}–${slot.end_time} ${tz}): ${err}`);
      failed++;
      continue;
    }

    const { error: updateErr } = await supabase
      .from('tutor_availability')
      .update(utcFields)
      .eq('id', slot.id);

    if (updateErr) {
      console.warn(`  FAIL id=${slot.id}: ${updateErr.message}`);
      failed++;
    } else {
      done++;
    }

    if ((done + failed) % 50 === 0) {
      console.log(`  Backfilled ${done} / ${total} rows (${failed} failed)`);
    }
  }

  console.log(`\nDone. ${done} updated, ${failed} failed out of ${total} total.`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
