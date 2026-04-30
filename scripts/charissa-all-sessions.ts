import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, tutor:tutors(name)')
    .eq('student_id', '50f283f8-8fdf-4ad3-b22f-f1033edbab7b')
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });

  console.log(`Total future scheduled sessions: ${sessions?.length ?? 0}\n`);

  for (const s of sessions ?? []) {
    const dt = new Date(s.scheduled_at);
    const mt  = dt.toLocaleString('en-US', { timeZone: 'America/Denver',   weekday:'short', month:'2-digit', day:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true });
    const est = dt.toLocaleString('en-US', { timeZone: 'America/New_York', weekday:'short', month:'2-digit', day:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true });
    console.log(`  ${est} EST | ${mt} MT | ${s.duration_minutes}min | ${(s.tutor as any).name}`);
  }
}

main().catch(console.error);
