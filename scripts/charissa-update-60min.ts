import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const STUDENT_ID = '50f283f8-8fdf-4ad3-b22f-f1033edbab7b';

async function getZoomToken(): Promise<string> {
  const creds = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    { method: 'POST', headers: { Authorization: `Basic ${creds}` } }
  );
  const data = await res.json() as any;
  if (!data.access_token) throw new Error(`Zoom token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function main() {
  // 1. Fetch all 32 future scheduled sessions
  const { data: sessions, error: fetchErr } = await supabase
    .from('sessions')
    .select('id, scheduled_at, zoom_meeting_id')
    .eq('student_id', STUDENT_ID)
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });

  if (fetchErr) throw fetchErr;
  console.log(`Found ${sessions?.length ?? 0} future scheduled sessions.`);

  // 2. Bulk update duration_minutes to 60
  const sessionIds = (sessions ?? []).map(s => s.id);
  const { error: updateErr } = await supabase
    .from('sessions')
    .update({ duration_minutes: 60 })
    .in('id', sessionIds);
  if (updateErr) throw updateErr;
  console.log(`✅ Updated ${sessionIds.length} sessions to 60 min.`);

  // 3. Update purchased_hours to 32
  const { error: studentErr } = await supabase
    .from('students')
    .update({ purchased_hours: 32 })
    .eq('id', STUDENT_ID);
  if (studentErr) throw studentErr;
  console.log('✅ purchased_hours set to 32.');

  // 4. PATCH each Zoom meeting
  const zoomToken = await getZoomToken();
  let zoomOk = 0, zoomFail = 0;

  for (const s of sessions ?? []) {
    if (!s.zoom_meeting_id) { console.log(`  SKIP (no Zoom) session ${s.id}`); continue; }
    const res = await fetch(`https://api.zoom.us/v2/meetings/${s.zoom_meeting_id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${zoomToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: 60 }),
    });
    if (res.status === 204) {
      zoomOk++;
    } else {
      const body = await res.json();
      console.error(`  FAIL Zoom ${s.zoom_meeting_id}: ${JSON.stringify(body)}`);
      zoomFail++;
    }
  }
  console.log(`✅ Zoom meetings updated: ${zoomOk} ok, ${zoomFail} failed.`);

  console.log('\n32 sessions updated to 60 min, purchased_hours set to 32');
}

main().catch(console.error);
