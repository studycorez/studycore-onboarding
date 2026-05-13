/**
 * create-permanent-zoom-links.ts
 *
 * For every signed contract that doesn't yet have a permanent Zoom link,
 * creates a Zoom type-3 (recurring / no fixed time) meeting and saves the
 * join URL, meeting ID, and host URL back to the contracts row.
 *
 * Run once (safe to re-run — skips contracts that already have a link):
 *   npx ts-node --project tsconfig.scripts.json scripts/create-permanent-zoom-links.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// ── Zoom auth ─────────────────────────────────────────────────────────────────

async function getZoomToken(): Promise<string> {
  const { ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_ACCOUNT_ID } = process.env;
  if (!ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET || !ZOOM_ACCOUNT_ID) {
    throw new Error('Missing ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET / ZOOM_ACCOUNT_ID');
  }
  const creds = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`,
    { method: 'POST', headers: { Authorization: `Basic ${creds}` } },
  );
  if (!res.ok) throw new Error(`Zoom token error: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ── Create permanent meeting ───────────────────────────────────────────────────

interface ZoomMeeting {
  id: number;
  join_url: string;
  start_url: string;
}

async function createPermanentMeeting(
  token: string,
  topic: string,
  zoomUserId?: string | null,
): Promise<ZoomMeeting> {
  const userId = zoomUserId ?? 'me';
  const res = await fetch(`https://api.zoom.us/v2/users/${userId}/meetings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic,
      type: 3, // Recurring with no fixed time — permanent link
      settings: {
        host_video: true,
        participant_video: true,
        waiting_room: false,
        join_before_host: true,
        jbh_time: 0,
        auto_recording: 'cloud',
      },
    }),
  });
  if (!res.ok) throw new Error(`Zoom meeting error: ${await res.text()}`);
  return res.json() as Promise<ZoomMeeting>;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase env vars');

  const supabase = createClient(supabaseUrl, serviceKey);

  console.log('\n[create-permanent-zoom-links] Fetching signed contracts without permanent link…');

  const { data: contracts, error } = await supabase
    .from('contracts')
    .select(`
      id,
      student_id,
      tutor_id,
      students:student_id ( name ),
      tutors:tutor_id ( name, zoom_user_id )
    `)
    .eq('status', 'signed')
    .is('permanent_zoom_link', null);

  if (error) throw new Error(`Supabase fetch error: ${error.message}`);
  if (!contracts || contracts.length === 0) {
    console.log('  No contracts need permanent Zoom links. Done.');
    return;
  }

  console.log(`  Found ${contracts.length} contract(s) to process.\n`);

  const token = await getZoomToken();

  let created = 0;
  let failed  = 0;

  for (const contract of contracts) {
    const studentName = (contract.students as any)?.name ?? 'Unknown Student';
    const tutorName   = (contract.tutors   as any)?.name ?? 'Unknown Tutor';
    const zoomUserId  = (contract.tutors   as any)?.zoom_user_id ?? null;
    const topic = `${studentName} & ${tutorName} — StudyCore Sessions`;

    try {
      const meeting = await createPermanentMeeting(token, topic, zoomUserId);

      const { error: updateErr } = await supabase
        .from('contracts')
        .update({
          permanent_zoom_link:       meeting.join_url,
          permanent_zoom_meeting_id: meeting.id,
          permanent_zoom_host_url:   meeting.start_url,
        })
        .eq('id', contract.id);

      if (updateErr) throw new Error(updateErr.message);

      console.log(`  ✓ [${contract.id}] ${studentName} & ${tutorName}`);
      console.log(`      join: ${meeting.join_url}`);
      created++;
    } catch (err: any) {
      console.error(`  ✗ [${contract.id}] ${studentName} & ${tutorName}: ${err.message}`);
      failed++;
    }

    // Rate-limit: Zoom allows ~30 req/s on most plans
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n══════════════════════════════════════');
  console.log('  Summary');
  console.log('══════════════════════════════════════');
  console.log(`  Contracts processed: ${contracts.length}`);
  console.log(`  Permanent links created: ${created}`);
  console.log(`  Failed: ${failed}`);
  console.log('══════════════════════════════════════\n');
}

main().catch(err => {
  console.error('[create-permanent-zoom-links] Fatal error:', err);
  process.exit(1);
});
