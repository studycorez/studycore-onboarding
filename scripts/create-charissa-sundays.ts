import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const STUDENT_ID = '50f283f8-8fdf-4ad3-b22f-f1033edbab7b';
const TUTOR_NAME = 'Navya Pichika';

const SUNDAY_UTC_TIMES = [
  '2026-05-11T03:00:00.000Z',
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
];

async function getZoomToken(): Promise<string> {
  const accountId    = process.env.ZOOM_ACCOUNT_ID!;
  const clientId     = process.env.ZOOM_CLIENT_ID!;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET!;
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    { method: 'POST', headers: { Authorization: `Basic ${creds}` } }
  );
  const data = await res.json() as any;
  if (!data.access_token) throw new Error(`Zoom token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function createZoomMeeting(token: string, scheduledAt: string, durationMin: number) {
  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: 'StudyCore Tutoring Session',
      type: 2,
      start_time: scheduledAt.replace('.000Z', 'Z'),
      duration: durationMin,
      timezone: 'UTC',
      settings: { join_before_host: true, waiting_room: false },
    }),
  });
  const data = await res.json() as any;
  if (!data.id) throw new Error(`Zoom meeting error: ${JSON.stringify(data)}`);
  return { id: String(data.id), join_url: data.join_url as string, host_url: data.start_url as string };
}

async function main() {
  const { data: tutor } = await supabase
    .from('tutors').select('id').ilike('name', `%${TUTOR_NAME}%`).single();
  if (!tutor) throw new Error('Tutor not found');
  console.log(`Tutor: ${TUTOR_NAME} (${tutor.id})`);

  const zoomToken = await getZoomToken();
  console.log('Zoom token acquired.\n');

  let created = 0;
  for (const utc of SUNDAY_UTC_TIMES) {
    const dt = new Date(utc);
    const mtLabel  = dt.toLocaleString('en-US', { timeZone: 'America/Denver',   weekday:'short', month:'2-digit', day:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true });
    const estLabel = dt.toLocaleString('en-US', { timeZone: 'America/New_York', hour:'2-digit', minute:'2-digit', hour12:true });

    const zoom = await createZoomMeeting(zoomToken, utc, 90);

    const { data: session, error } = await supabase
      .from('sessions')
      .insert({
        tutor_id:         tutor.id,
        student_id:       STUDENT_ID,
        scheduled_at:     utc,
        duration_minutes: 90,
        status:           'scheduled',
        payment_status:   'pending',
        zoom_meeting_id:  zoom.id,
        zoom_join_url:    zoom.join_url,
        zoom_host_url:    zoom.host_url,
      })
      .select('id')
      .single();

    if (error) {
      console.error(`  FAIL ${mtLabel}: ${error.message}`);
    } else {
      created++;
      console.log(`  ✅ ${mtLabel} MT (${estLabel} EST) | Zoom ${zoom.id} | session ${session.id}`);
    }
  }

  console.log(`\nDone. Created ${created}/${SUNDAY_UTC_TIMES.length} sessions.`);
}

main().catch(console.error);
