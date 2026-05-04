/**
 * Backfill script: update join_before_host + disable waiting_room on all
 * upcoming scheduled sessions that already have a zoom_meeting_id.
 *
 * Run with:
 *   npx ts-node --project tsconfig.json -e "$(cat scripts/backfill-zoom-settings.ts)"
 * Or:
 *   npx tsx scripts/backfill-zoom-settings.ts
 */
import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const zoomClientId = process.env.ZOOM_CLIENT_ID!;
  const zoomClientSecret = process.env.ZOOM_CLIENT_SECRET!;
  const zoomAccountId = process.env.ZOOM_ACCOUNT_ID!;

  if (!supabaseUrl || !serviceRoleKey || !zoomClientId || !zoomClientSecret || !zoomAccountId) {
    console.error('Missing required env vars. Run with: npx vercel env pull && source .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch all upcoming scheduled sessions with a zoom_meeting_id
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, zoom_meeting_id, scheduled_at')
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .not('zoom_meeting_id', 'is', null);

  if (error) {
    console.error('Failed to fetch sessions:', error);
    process.exit(1);
  }

  console.log(`Found ${sessions?.length ?? 0} upcoming sessions with Zoom meetings to update.`);

  // Get Zoom access token
  const creds = Buffer.from(`${zoomClientId}:${zoomClientSecret}`).toString('base64');
  const tokenRes = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${zoomAccountId}`,
    { method: 'POST', headers: { Authorization: `Basic ${creds}` } },
  );
  if (!tokenRes.ok) {
    console.error('Failed to get Zoom token:', await tokenRes.text());
    process.exit(1);
  }
  const { access_token: token } = await tokenRes.json() as { access_token: string };

  let ok = 0;
  let fail = 0;

  for (const session of sessions ?? []) {
    const meetingId = session.zoom_meeting_id;
    const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          join_before_host: true,
          waiting_room: false,
          jbh_time: 0,
        },
      }),
    });

    if (res.ok || res.status === 204) {
      console.log(`  ✓ Updated meeting ${meetingId} (session ${session.id}, ${session.scheduled_at})`);
      ok++;
    } else {
      const body = await res.text();
      console.error(`  ✗ Failed meeting ${meetingId} (session ${session.id}): ${res.status} ${body}`);
      fail++;
    }

    // Brief pause to avoid Zoom rate limits
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\nDone: ${ok} updated, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
