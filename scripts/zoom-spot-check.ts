/**
 * Spot-check Zoom /past_meetings for a recent session (<30d) to confirm
 * the API works, then check the oldest session in the DB.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getToken(): Promise<string> {
  const creds = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    { method: 'POST', headers: { Authorization: `Basic ${creds}` } }
  );
  const d = await res.json() as any;
  return d.access_token;
}

async function check(token: string, meetingId: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`https://api.zoom.us/v2/past_meetings/${meetingId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.text();
  return { status: res.status, body };
}

async function main() {
  const token = await getToken();
  console.log('Zoom token OK\n');

  // 1. Most recent session with zoom_meeting_id
  const { data: recent } = await supabase
    .from('sessions')
    .select('id, scheduled_at, zoom_meeting_id, student_id')
    .not('zoom_meeting_id', 'is', null)
    .eq('status', 'completed')
    .order('scheduled_at', { ascending: false })
    .limit(3);

  console.log('=== RECENT sessions (last completed with zoom_id) ===');
  for (const s of recent ?? []) {
    const r = await check(token, String(s.zoom_meeting_id));
    const age = Math.round((Date.now() - new Date(s.scheduled_at).getTime()) / 86400000);
    console.log(`  ${s.scheduled_at.slice(0, 10)} (${age}d ago)  zoom_id=${s.zoom_meeting_id}  → HTTP ${r.status}  body=${r.body.slice(0, 120)}`);
    await new Promise(r => setTimeout(r, 300));
  }

  // 2. Sessions right at the 60-day boundary
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: boundary } = await supabase
    .from('sessions')
    .select('id, scheduled_at, zoom_meeting_id')
    .not('zoom_meeting_id', 'is', null)
    .eq('status', 'completed')
    .gte('scheduled_at', sixtyDaysAgo)
    .lte('scheduled_at', thirtyDaysAgo)
    .order('scheduled_at', { ascending: true })
    .limit(3);

  console.log('\n=== BOUNDARY sessions (30-60d ago) ===');
  for (const s of boundary ?? []) {
    const r = await check(token, String(s.zoom_meeting_id));
    const age = Math.round((Date.now() - new Date(s.scheduled_at).getTime()) / 86400000);
    console.log(`  ${s.scheduled_at.slice(0, 10)} (${age}d ago)  zoom_id=${s.zoom_meeting_id}  → HTTP ${r.status}  body=${r.body.slice(0, 120)}`);
    await new Promise(r => setTimeout(r, 300));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
