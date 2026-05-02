/**
 * Fix Zoom meeting start times for all upcoming sessions.
 *
 * Background: Zoom meetings were created without an explicit timezone, so Zoom
 * treated the UTC start_time as PDT (UTC-7), storing the time 7 hours too late.
 * This script patches each meeting's start_time to the correct UTC value from
 * Supabase and verifies the fix.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/fix-zoom-times.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/fix-zoom-times.ts --live
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const DRY_RUN = !process.argv.includes('--live');
const LIVE    =  process.argv.includes('--live');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const HR  = '─'.repeat(80);
const HR2 = '═'.repeat(80);

// ── Zoom helpers ──────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const creds = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    { method: 'POST', headers: { Authorization: `Basic ${creds}` } },
  );
  if (!res.ok) throw new Error(`Zoom token error: ${await res.text()}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

async function getZoomMeeting(token: string, meetingId: string): Promise<{ start_time: string; duration: number; topic: string } | null> {
  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Zoom GET ${meetingId}: ${await res.text()}`);
  return res.json() as Promise<{ start_time: string; duration: number; topic: string }>;
}

async function patchZoomMeeting(token: string, meetingId: string, startTimeUtc: string, durationMinutes: number): Promise<boolean> {
  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_time: startTimeUtc,   // already Z-suffix UTC ISO
      duration: durationMinutes,
      timezone: 'UTC',
    }),
  });
  if (!res.ok) {
    console.error(`  ✗ PATCH failed: ${await res.text()}`);
    return false;
  }
  return true;
}

function fmtInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  }).format(new Date(iso));
}

function diffMinutes(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 60000);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${HR2}`);
  console.log(`  FIX ZOOM MEETING TIMES — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`${HR2}\n`);

  if (!process.env.ZOOM_CLIENT_ID || !process.env.ZOOM_CLIENT_SECRET || !process.env.ZOOM_ACCOUNT_ID) {
    console.error('Missing Zoom credentials (ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET / ZOOM_ACCOUNT_ID)');
    process.exit(1);
  }

  // Fetch all upcoming sessions with a zoom_meeting_id
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, zoom_meeting_id, tutor:tutors(name), student:students(name, timezone)')
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .not('zoom_meeting_id', 'is', null)
    .order('scheduled_at', { ascending: true });

  if (error) { console.error('Supabase error:', error.message); process.exit(1); }
  if (!sessions?.length) { console.log('No upcoming sessions with zoom_meeting_id found.\n'); return; }

  console.log(`Found ${sessions.length} session(s) to check.\n`);

  let token: string;
  try {
    token = await getAccessToken();
  } catch (err: any) {
    console.error('Could not get Zoom access token:', err.message);
    process.exit(1);
  }

  interface Plan {
    sessionId: string;
    meetingId: string;
    supabaseUtc: string;
    zoomCurrentUtc: string;
    durationMinutes: number;
    diffMin: number;
    tutorName: string;
    studentName: string;
  }

  const toFix: Plan[] = [];
  const alreadyCorrect: string[] = [];
  const notFound: string[] = [];

  // ── Inspect phase ───────────────────────────────────────────────────────────
  for (const s of sessions) {
    const tutor   = (s.tutor   as any)?.name ?? '—';
    const student = (s.student as any)?.name ?? '—';
    const studentTz = (s.student as any)?.timezone ?? 'America/New_York';
    const supabaseUtc = new Date(s.scheduled_at).toISOString();

    process.stdout.write(`  ${tutor} → ${student} | meeting ${s.zoom_meeting_id}... `);
    const zm = await getZoomMeeting(token, s.zoom_meeting_id!);

    if (!zm) {
      console.log('[meeting not found]');
      notFound.push(s.id);
      continue;
    }

    const zoomUtc = new Date(zm.start_time).toISOString();
    const diff    = diffMinutes(zoomUtc, supabaseUtc);

    if (Math.abs(diff) <= 1) {
      console.log(`✓ correct (${fmtInTz(supabaseUtc, studentTz)})`);
      alreadyCorrect.push(s.id);
    } else {
      const sign = diff > 0 ? '+' : '';
      console.log(`⚠ off by ${sign}${diff} min`);
      console.log(`    Supabase: ${supabaseUtc}  →  ${fmtInTz(supabaseUtc, studentTz)}`);
      console.log(`    Zoom:     ${zoomUtc}  →  ${fmtInTz(zoomUtc, studentTz)}`);
      toFix.push({
        sessionId:      s.id,
        meetingId:      s.zoom_meeting_id!,
        supabaseUtc,
        zoomCurrentUtc: zoomUtc,
        durationMinutes: s.duration_minutes,
        diffMin: diff,
        tutorName: tutor,
        studentName: student,
      });
    }
  }

  // ── Plan summary ────────────────────────────────────────────────────────────
  console.log(`\n${HR2}`);
  console.log('  PLAN SUMMARY');
  console.log(HR2);
  console.log(`  Already correct: ${alreadyCorrect.length}`);
  console.log(`  Not found:       ${notFound.length}`);
  console.log(`  Need fixing:     ${toFix.length}`);

  if (toFix.length === 0) {
    console.log('\n  ✓ Nothing to fix — all Zoom meetings match Supabase.\n');
    return;
  }

  console.log(`\n  Meetings to patch:`);
  for (const p of toFix) {
    console.log(`    ${p.tutorName.padEnd(24)} → ${p.studentName.padEnd(24)} | meeting ${p.meetingId}`);
    console.log(`      Zoom now:  ${p.zoomCurrentUtc} (off by ${p.diffMin > 0 ? '+' : ''}${p.diffMin} min)`);
    console.log(`      Will set:  ${p.supabaseUtc}`);
  }

  if (DRY_RUN) {
    console.log(`\n  *** DRY RUN — run with --live to apply ***\n`);
    console.log(`${HR2}\n`);
    return;
  }

  // ── Apply phase (--live only) ────────────────────────────────────────────────
  console.log(`\n${HR}`);
  console.log('  APPLYING PATCHES');
  console.log(HR);

  let patched = 0;
  let failed  = 0;

  for (const p of toFix) {
    process.stdout.write(`  Patching ${p.meetingId} (${p.tutorName} → ${p.studentName})... `);
    const ok = await patchZoomMeeting(token, p.meetingId, p.supabaseUtc, p.durationMinutes);
    if (!ok) { failed++; continue; }

    // Verify
    const updated = await getZoomMeeting(token, p.meetingId);
    if (!updated) {
      console.log('✓ patched (could not re-fetch to verify)');
      patched++;
      continue;
    }
    const newUtc  = new Date(updated.start_time).toISOString();
    const newDiff = diffMinutes(newUtc, p.supabaseUtc);
    if (Math.abs(newDiff) <= 1) {
      console.log(`✓ verified (${p.supabaseUtc})`);
      patched++;
    } else {
      console.log(`⚠ still off by ${newDiff} min after patch — Zoom returned: ${newUtc}`);
      failed++;
    }
  }

  console.log(`\n${HR2}`);
  console.log('  DONE');
  console.log(HR2);
  console.log(`  Patched successfully: ${patched}`);
  console.log(`  Failed:               ${failed}`);
  console.log(`\n${HR2}\n`);
}

main().catch(err => {
  console.error('\nFatal:', err.message ?? err);
  process.exit(1);
});
