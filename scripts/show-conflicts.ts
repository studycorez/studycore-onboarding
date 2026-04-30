import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function fmt(iso: string, tz = 'America/New_York') {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: tz, weekday:'short', month:'short', day:'numeric',
    year:'numeric', hour:'numeric', minute:'2-digit', hour12:true,
  });
}
function fmtEnd(iso: string, mins: number, tz = 'America/New_York') {
  const end = new Date(new Date(iso).getTime() + mins * 60000);
  return end.toLocaleTimeString('en-US', { timeZone: tz, hour:'numeric', minute:'2-digit', hour12:true });
}

async function main() {
  const { data } = await supabase
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, status, student_id, tutor_id, student:students(name, timezone), tutor:tutors(name)')
    .eq('status', 'scheduled')
    .gte('scheduled_at', '2026-04-30T00:00:00Z')
    .lte('scheduled_at', '2026-05-02T05:00:00Z')
    .order('scheduled_at');

  const conflictTutors = ['Minju Kim', 'Mazin Sihweil', 'Parth Patel'];
  const rows = (data ?? []).filter(s => conflictTutors.includes((s as any).tutor?.name));

  // Group by tutor
  const byTutor: Record<string, typeof rows> = {};
  for (const s of rows) {
    const t = (s as any).tutor?.name;
    if (!byTutor[t]) byTutor[t] = [];
    byTutor[t].push(s);
  }

  const LINE = '─'.repeat(80);
  for (const [tutor, sessions] of Object.entries(byTutor)) {
    console.log(`\n  ── ${tutor} ──────────────────────────────────────────────────`);
    for (const s of sessions) {
      const st = (s as any).student;
      const tz = st?.timezone ?? 'America/New_York';
      console.log(`  ID:       ${s.id}`);
      console.log(`  Student:  ${st?.name}`);
      console.log(`  Time:     ${fmt(s.scheduled_at, tz)} → ${fmtEnd(s.scheduled_at, s.duration_minutes, tz)}  (${s.duration_minutes} min)`);
      console.log('');
    }
    console.log(LINE);
  }
}
main().catch(console.error);
