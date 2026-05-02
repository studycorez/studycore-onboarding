/**
 * Audit session times: compare Supabase scheduled_at with Zoom start_time.
 * Prints each session's local time in EST and PST so you can visually verify
 * there are no AM/PM inversions.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/audit-session-times.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const HR  = '─'.repeat(80);
const HR2 = '═'.repeat(80);

async function getZoomMeeting(meetingId: string): Promise<{ start_time: string; duration: number; topic: string } | null> {
  if (!process.env.ZOOM_CLIENT_ID || !process.env.ZOOM_CLIENT_SECRET || !process.env.ZOOM_ACCOUNT_ID) {
    return null;
  }
  try {
    const creds = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
    const tokenRes = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
      { method: 'POST', headers: { Authorization: `Basic ${creds}` } },
    );
    if (!tokenRes.ok) return null;
    const { access_token } = await tokenRes.json() as { access_token: string };

    const meetRes = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!meetRes.ok) return null;
    const data = await meetRes.json() as any;
    return { start_time: data.start_time, duration: data.duration, topic: data.topic };
  } catch {
    return null;
  }
}

function fmtInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  }).format(new Date(iso));
}

async function main() {
  console.log(`\n${HR2}`);
  console.log('  SESSION TIME AUDIT — Supabase vs Zoom');
  console.log(`${HR2}\n`);

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, status, zoom_meeting_id, tutor:tutors(name), student:students(name, timezone)')
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(20);

  if (error) { console.error('Supabase error:', error.message); process.exit(1); }
  if (!sessions?.length) { console.log('No upcoming sessions found.'); return; }

  console.log(`Checking ${sessions.length} upcoming session(s)...\n`);
  console.log(HR);

  let mismatches = 0;
  let noZoom = 0;

  for (const s of sessions) {
    const tutor   = (s.tutor   as any)?.name ?? '—';
    const student = (s.student as any)?.name ?? '—';
    const studentTz = (s.student as any)?.timezone ?? 'America/New_York';

    const estTime = fmtInTz(s.scheduled_at, 'America/New_York');
    const pstTime = fmtInTz(s.scheduled_at, 'America/Los_Angeles');
    const studentLocalTime = fmtInTz(s.scheduled_at, studentTz);

    console.log(`Session: ${tutor} → ${student}`);
    console.log(`  DB (UTC):      ${s.scheduled_at}`);
    console.log(`  EST:           ${estTime}`);
    console.log(`  PST:           ${pstTime}`);
    if (studentTz !== 'America/New_York' && studentTz !== 'America/Los_Angeles') {
      console.log(`  Student TZ:    ${studentLocalTime} (${studentTz})`);
    }

    if (!s.zoom_meeting_id) {
      console.log(`  Zoom:          [no meeting ID]`);
      noZoom++;
    } else {
      process.stdout.write(`  Zoom:          fetching meeting ${s.zoom_meeting_id}...`);
      const zm = await getZoomMeeting(s.zoom_meeting_id);
      if (!zm) {
        console.log(` [could not fetch]`);
        noZoom++;
      } else {
        // Zoom start_time is ISO 8601, usually UTC or with offset
        const zoomUtc = new Date(zm.start_time).toISOString();
        const dbUtc   = new Date(s.scheduled_at).toISOString();
        const diffMs  = Math.abs(new Date(zoomUtc).getTime() - new Date(dbUtc).getTime());
        const diffMin = Math.round(diffMs / 60000);

        if (diffMin > 1) {
          console.log(`\n  ⚠ MISMATCH — DB: ${dbUtc} | Zoom: ${zoomUtc} (off by ${diffMin} min)`);
          mismatches++;
        } else {
          console.log(` ✓ matches (${fmtInTz(zm.start_time, 'America/New_York')} EST)`);
        }
      }
    }

    // Flag potential AM/PM issues: if the hour is between 1-6 AM local time, warn
    const localHour = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: studentTz, hour: 'numeric', hour12: false }).format(new Date(s.scheduled_at)),
      10,
    );
    if (localHour >= 1 && localHour <= 6) {
      console.log(`  ⚠ WARNING: session is at ${localHour}:xx AM in student's timezone — verify this is correct`);
    }

    console.log(HR);
  }

  console.log(`\n${HR2}`);
  console.log('  SUMMARY');
  console.log(HR2);
  console.log(`  Sessions checked:     ${sessions.length}`);
  console.log(`  Zoom mismatches:      ${mismatches}`);
  console.log(`  No Zoom meeting ID:   ${noZoom}`);
  if (mismatches > 0) {
    console.log(`\n  ⚠ ${mismatches} mismatch(es) found — investigate these sessions`);
  } else {
    console.log(`\n  ✓ All Zoom times match Supabase`);
  }
  console.log(`\n${HR2}\n`);
}

main().catch(err => {
  console.error('\nFatal:', err.message ?? err);
  process.exit(1);
});
