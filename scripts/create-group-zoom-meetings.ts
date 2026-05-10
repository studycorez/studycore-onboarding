/**
 * Create two permanent (type:3) Zoom meetings for David Zhu's group sessions.
 * type:3 = Recurring meeting with no fixed time → same meeting ID reused forever.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

async function getZoomToken(): Promise<string> {
  const creds = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    { method: 'POST', headers: { Authorization: `Basic ${creds}` } }
  );
  if (!res.ok) throw new Error(`Zoom token error: ${await res.text()}`);
  const d = await res.json();
  return d.access_token;
}

async function createPermanentMeeting(token: string, topic: string): Promise<{ id: number; join_url: string; start_url: string }> {
  const res = await fetch(`https://api.zoom.us/v2/users/me/meetings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic,
      type: 3, // Recurring meeting, no fixed time — same join link forever
      settings: {
        host_video: true,
        participant_video: true,
        waiting_room: false,
        join_before_host: true,
        jbh_time: 0,
        mute_upon_entry: false,
      },
    }),
  });
  if (!res.ok) throw new Error(`Create meeting failed: ${await res.text()}`);
  return res.json();
}

async function verifyMeeting(token: string, meetingId: number): Promise<{ type: number; topic: string }> {
  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Verify meeting failed: ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log('═══ Creating Permanent Zoom Meetings ═══\n');

  if (!process.env.ZOOM_CLIENT_ID) {
    throw new Error('ZOOM_CLIENT_ID not set in .env.local');
  }

  const token = await getZoomToken();
  console.log('  Zoom token acquired ✓\n');

  const meetings = [
    'StudyCore Group Session — Mondays 7–8pm EST',
    'StudyCore Group Session — Saturdays 4:30–5:30pm EST',
  ];

  const results: { id: number; join_url: string; topic: string }[] = [];

  for (const topic of meetings) {
    process.stdout.write(`  Creating: "${topic}" … `);
    const meeting = await createPermanentMeeting(token, topic);
    console.log(`✓  ID: ${meeting.id}`);

    // Verify
    const verified = await verifyMeeting(token, meeting.id);
    const isType3 = verified.type === 3;
    console.log(`    type: ${verified.type} (${isType3 ? '✓ no-fixed-time recurring' : '✗ WRONG TYPE'})`);
    if (!isType3) throw new Error(`Meeting ${meeting.id} is not type:3!`);

    results.push({ id: meeting.id, join_url: meeting.join_url, topic });
    console.log(`    join_url: ${meeting.join_url}\n`);
  }

  console.log('═══ RESULT — copy these values ═══\n');
  console.log(`MONDAY_ZOOM_MEETING_ID=${results[0].id}`);
  console.log(`MONDAY_ZOOM_JOIN_URL=${results[0].join_url}`);
  console.log(`\nSATURDAY_ZOOM_MEETING_ID=${results[1].id}`);
  console.log(`SATURDAY_ZOOM_JOIN_URL=${results[1].join_url}`);
  console.log('\n═══ Both meetings verified as type:3 ✓ ═══\n');

  // Write to a temp file so the next script can read them
  const fs = await import('fs');
  fs.writeFileSync(
    resolve(process.cwd(), 'scripts/.group-session-zoom.json'),
    JSON.stringify({
      monday: { id: results[0].id, join_url: results[0].join_url },
      saturday: { id: results[1].id, join_url: results[1].join_url },
    }, null, 2)
  );
  console.log('Saved to scripts/.group-session-zoom.json\n');
}

main().catch(err => { console.error(err); process.exit(1); });
