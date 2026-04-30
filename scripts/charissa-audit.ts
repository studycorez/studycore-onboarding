import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: students } = await supabase
    .from('students')
    .select('id, name, timezone')
    .ilike('name', '%Charissa%');

  if (!students?.length) { console.log('No student found'); return; }
  console.log('Students found:', JSON.stringify(students));

  for (const student of students) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Student: ${student.name} (${student.id}), tz: ${student.timezone}`);

    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, status, tutor:tutors(name)')
      .eq('student_id', student.id)
      .eq('status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true });

    const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const daySet: number[] = [];

    console.log(`\nFuture scheduled sessions (${sessions?.length ?? 0}):`);
    for (const s of sessions ?? []) {
      const dt = new Date(s.scheduled_at);
      const estStr = dt.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short', month: '2-digit', day: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
      const localDt = new Date(dt.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const dow = localDt.getDay();
      if (!daySet.includes(dow)) daySet.push(dow);
      console.log(`  ${estStr} | ${s.duration_minutes}min | ${(s.tutor as any).name}`);
    }

    console.log(`\nSession days of week: ${daySet.sort((a,b)=>a-b).map(d => DAYS[d]).join(', ')}`);

    const { data: avail } = await supabase
      .from('student_availability')
      .select('*')
      .eq('student_id', student.id)
      .order('day_of_week', { ascending: true });

    console.log(`\nstudent_availability records (${avail?.length ?? 0}):`);
    for (const a of avail ?? []) {
      console.log(`  day=${a.day_of_week} (${DAYS[a.day_of_week]}), ${a.start_time}–${a.end_time}, active=${a.is_active}`);
    }
  }
}

main().catch(console.error);
