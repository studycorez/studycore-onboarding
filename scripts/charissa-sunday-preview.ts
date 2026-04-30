import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const STUDENT_ID = '50f283f8-8fdf-4ad3-b22f-f1033edbab7b';

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, tutor:tutors(name)')
    .eq('student_id', STUDENT_ID)
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });

  console.log('=== ALL FUTURE SESSIONS ===');
  for (const s of sessions ?? []) {
    const dt = new Date(s.scheduled_at);
    const est = dt.toLocaleString('en-US', { timeZone: 'America/New_York', weekday:'short', month:'2-digit', day:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true });
    const mt  = dt.toLocaleString('en-US', { timeZone: 'America/Denver', hour:'2-digit', minute:'2-digit', hour12:true });
    console.log(`  ${est} (${mt} MT) | ${s.duration_minutes}min | UTC: ${s.scheduled_at}`);
  }

  // Track existing Sunday sessions by their UTC date (which will be Monday since 9PM MT = 03:00 UTC)
  const existingUTCDates: string[] = (sessions ?? []).map((s: any) => s.scheduled_at.slice(0, 10));

  // Generate every Sunday 9PM MT = 03:00 UTC (Monday UTC) from May 10 to Aug 23, 2026
  // May 10 2026 is the first Sunday after the existing May 3 session
  // Last Wednesday is Aug 19 — last Sunday should also be Aug 23 (next Sunday after Aug 19)
  const proposed: { utc: string; mt: string; est: string }[] = [];

  // Sundays at 9PM MT: UTC = that Monday at 03:00
  // May 10 Sun 9PM MT = May 11 03:00 UTC
  const sundayUTCStarts = [
    '2026-05-11T03:00:00.000Z', // May 10 Sun 9PM MT
    '2026-05-18T03:00:00.000Z',
    '2026-05-25T03:00:00.000Z',
    '2026-06-01T03:00:00.000Z',
    '2026-06-08T03:00:00.000Z',
    '2026-06-15T03:00:00.000Z',
    '2026-06-22T03:00:00.000Z',
    '2026-06-29T03:00:00.000Z',
    '2026-07-06T03:00:00.000Z',
    '2026-07-13T03:00:00.000Z',
    '2026-07-20T03:00:00.000Z',
    '2026-07-27T03:00:00.000Z',
    '2026-08-03T03:00:00.000Z',
    '2026-08-10T03:00:00.000Z',
    '2026-08-17T03:00:00.000Z',
    '2026-08-24T03:00:00.000Z', // Aug 23 Sun 9PM MT
  ];

  for (const utc of sundayUTCStarts) {
    const dt = new Date(utc);
    const mtLabel  = dt.toLocaleString('en-US', { timeZone: 'America/Denver',   weekday:'short', month:'2-digit', day:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true });
    const estLabel = dt.toLocaleString('en-US', { timeZone: 'America/New_York', weekday:'short', month:'2-digit', day:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true });

    // Verify it's actually Sunday in MT
    const mtDow = new Date(dt.toLocaleString('en-US', { timeZone: 'America/Denver' })).getDay();
    const dayCheck = mtDow === 0 ? 'Sun✓' : `WRONG DOW=${mtDow}`;

    proposed.push({ utc, mt: mtLabel, est: estLabel });

    const skip = existingUTCDates.includes(utc.slice(0, 10));
    console.log(`  ${skip ? '[SKIP existing]' : '[NEW]          '} ${mtLabel} MT | ${estLabel} EST | ${dayCheck}`);
  }

  const newCount = proposed.filter(p => !existingUTCDates.includes(p.utc.slice(0, 10))).length;
  console.log(`\nTotal to create: ${newCount} new Sunday sessions`);
  console.log('Duration: 90 min | Tutor: Navya Pichika | Zoom: yes');
}

main().catch(console.error);
