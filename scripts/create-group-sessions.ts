/**
 * Create 12 weekly Monday + 12 weekly Saturday group session records in Supabase.
 * Run AFTER DB migration has been applied.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DAVID_ZHU_ID = '3f2ab4fe-74a9-453a-9037-4739889547a9';

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log('═══ Creating Group Session Records ═══\n');

  // Load Zoom info
  const zoomPath = resolve(process.cwd(), 'scripts/.group-session-zoom.json');
  let zoomInfo: { monday: { id: number; join_url: string }; saturday: { id: number; join_url: string } };
  try {
    zoomInfo = JSON.parse(readFileSync(zoomPath, 'utf8'));
  } catch {
    throw new Error('scripts/.group-session-zoom.json not found — run create-group-zoom-meetings.ts first');
  }

  console.log(`  Monday Zoom ID:   ${zoomInfo.monday.id}`);
  console.log(`  Saturday Zoom ID: ${zoomInfo.saturday.id}\n`);

  // Verify David Zhu exists
  const { data: tutor } = await supabase.from('tutors').select('id, name').eq('id', DAVID_ZHU_ID).single();
  if (!tutor) throw new Error(`Tutor ${DAVID_ZHU_ID} not found`);
  console.log(`  Tutor: ${tutor.name} (${tutor.id})\n`);

  const sessions: any[] = [];

  // 12 Mondays starting 2026-05-11, 23:00 UTC (= 7pm EST / 7pm EDT approx)
  const mondayStart = '2026-05-11';
  for (let i = 0; i < 12; i++) {
    const date = addWeeks(mondayStart, i);
    sessions.push({
      tutor_id: DAVID_ZHU_ID,
      student_id: null,
      scheduled_at: `${date}T23:00:00Z`,
      duration_minutes: 60,
      status: 'scheduled',
      payment_status: 'waived',
      is_group_session: true,
      max_students: 20,
      zoom_join_url: zoomInfo.monday.join_url,
      zoom_meeting_id: String(zoomInfo.monday.id),
    });
  }

  // 12 Saturdays starting 2026-05-10, 21:30 UTC (= 4:30pm EST)
  const saturdayStart = '2026-05-10';
  for (let i = 0; i < 12; i++) {
    const date = addWeeks(saturdayStart, i);
    sessions.push({
      tutor_id: DAVID_ZHU_ID,
      student_id: null,
      scheduled_at: `${date}T21:30:00Z`,
      duration_minutes: 60,
      status: 'scheduled',
      payment_status: 'waived',
      is_group_session: true,
      max_students: 20,
      zoom_join_url: zoomInfo.saturday.join_url,
      zoom_meeting_id: String(zoomInfo.saturday.id),
    });
  }

  console.log(`  Inserting ${sessions.length} sessions…`);

  const { data: inserted, error } = await supabase
    .from('sessions')
    .insert(sessions)
    .select('id, scheduled_at, is_group_session, max_students');

  if (error) {
    console.error('Insert error:', error.message);
    if (error.message.includes('column') && error.message.includes('does not exist')) {
      console.error('\nDB migration has not been applied yet!');
      console.error('Run the SQL in the Supabase dashboard first, then re-run this script.');
    }
    process.exit(1);
  }

  console.log(`  Inserted: ${inserted?.length ?? 0} sessions ✓\n`);

  // Verify
  const { data: verify } = await supabase
    .from('sessions')
    .select('id, scheduled_at, is_group_session')
    .eq('tutor_id', DAVID_ZHU_ID)
    .eq('is_group_session', true)
    .order('scheduled_at');

  const mondayCount = verify?.filter(s => new Date(s.scheduled_at).getUTCDay() === 1).length ?? 0;
  const satCount = verify?.filter(s => new Date(s.scheduled_at).getUTCDay() === 6).length ?? 0;

  console.log(`  Monday sessions:   ${mondayCount}`);
  console.log(`  Saturday sessions: ${satCount}`);
  console.log(`  Total:             ${verify?.length ?? 0}`);

  if ((verify?.length ?? 0) >= 24) {
    console.log('\n✓ All 24 group sessions verified in Supabase\n');
  } else {
    console.log('\n⚠ Expected 24 sessions, found', verify?.length);
  }

  console.log('═══ Done ═══\n');
}

main().catch(err => { console.error(err); process.exit(1); });
