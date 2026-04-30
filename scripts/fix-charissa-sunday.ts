import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Find the session
  const { data: session, error } = await supabase
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, status, zoom_meeting_id, zoom_join_url, tutor:tutors(name), student:students(name)')
    .eq('student_id', '50f283f8-8fdf-4ad3-b22f-f1033edbab7b')
    .eq('status', 'scheduled')
    .gte('scheduled_at', '2026-05-03T00:00:00Z')
    .lt('scheduled_at', '2026-05-04T00:00:00Z')
    .single();

  if (error || !session) { console.log('Session not found:', error); return; }

  console.log('BEFORE:');
  console.log(`  ID:          ${session.id}`);
  console.log(`  Student:     ${(session.student as any).name}`);
  console.log(`  Tutor:       ${(session.tutor as any).name}`);
  console.log(`  scheduled_at: ${session.scheduled_at}  (${new Date(session.scheduled_at).toLocaleString('en-US', { timeZone: 'America/New_York', weekday:'short', month:'2-digit', day:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true })} EST)`);
  console.log(`  Duration:    ${session.duration_minutes} min`);
  console.log(`  Zoom ID:     ${session.zoom_meeting_id}`);
  console.log(`  Zoom URL:    ${session.zoom_join_url}`);

  const newTime = '2026-05-03T23:00:00Z';

  const { error: updateErr } = await supabase
    .from('sessions')
    .update({ scheduled_at: newTime })
    .eq('id', session.id);

  if (updateErr) { console.log('Update failed:', updateErr); return; }

  console.log('\nAFTER:');
  console.log(`  scheduled_at: ${newTime}  (${new Date(newTime).toLocaleString('en-US', { timeZone: 'America/New_York', weekday:'short', month:'2-digit', day:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true })} EST)`);
  console.log(`              (${new Date(newTime).toLocaleString('en-US', { timeZone: 'America/Denver', weekday:'short', month:'2-digit', day:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true })} MT)`);
  console.log(`  Duration:    ${session.duration_minutes} min (unchanged)`);
  console.log(`  Tutor:       ${(session.tutor as any).name} (unchanged)`);
  console.log(`  Zoom ID:     ${session.zoom_meeting_id} (unchanged)`);
  console.log('\n✅ Update successful.');
}

main().catch(console.error);
