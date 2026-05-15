/**
 * Part D — Zoom retention check.
 * Picks 5 sessions older than 60 days with a zoom_meeting_id, calls
 * GET /past_meetings/{id} on each, and reports whether Zoom still has the data.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/audit-zoom-retention.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SIXTY_DAYS_AGO = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

async function getZoomToken(): Promise<string> {
  const creds = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    { method: 'POST', headers: { Authorization: `Basic ${creds}` } }
  );
  if (!res.ok) throw new Error(`Zoom token error: ${await res.text()}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

async function checkZoomMeeting(
  token: string,
  meetingId: string
): Promise<{ status: number; found: boolean; topic?: string; start_time?: string; duration?: number; raw?: any }> {
  const res = await fetch(
    `https://api.zoom.us/v2/past_meetings/${meetingId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 404) return { status: 404, found: false };
  if (res.status === 200) {
    const data = await res.json() as any;
    return { status: 200, found: true, topic: data.topic, start_time: data.start_time, duration: data.duration, raw: data };
  }
  // Other status (3001 = meeting not found in some API versions, 300 = rate limit, etc.)
  const body = await res.text();
  return { status: res.status, found: false, raw: body };
}

async function main() {
  console.log(`\nFetching sessions older than 60 days (before ${SIXTY_DAYS_AGO.slice(0, 10)}) with zoom_meeting_id…`);

  // Fetch a pool of old sessions with zoom_meeting_id set, spread across time
  const { data: oldSessions, error } = await supabase
    .from('sessions')
    .select('id, student_id, tutor_id, scheduled_at, zoom_meeting_id, status, duration_minutes, created_at')
    .not('zoom_meeting_id', 'is', null)
    .lt('scheduled_at', SIXTY_DAYS_AGO)
    .eq('status', 'completed')
    .order('scheduled_at', { ascending: true })  // oldest first — hardest for retention
    .limit(100);

  if (error) { console.error('fetch error:', error.message); process.exit(1); }
  if (!oldSessions || oldSessions.length === 0) {
    console.log('No completed sessions older than 60 days with zoom_meeting_id found.');
    return;
  }

  console.log(`Found ${oldSessions.length} candidate sessions. Selecting 5 spread across time range.`);

  // Pick 5 spread across the range: oldest, 25th pct, median, 75th pct, newest-in-pool
  const n = oldSessions.length;
  const indices = [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1];
  const selected = [...new Set(indices)].map(i => oldSessions[i]);

  // Load tutor/student names
  const tutorIds = [...new Set(selected.map(s => s.tutor_id).filter(Boolean))];
  const studentIds = [...new Set(selected.map(s => s.student_id).filter(Boolean))];

  const [{ data: tutors }, { data: students }] = await Promise.all([
    supabase.from('tutors').select('id, name').in('id', tutorIds),
    supabase.from('students').select('id, name').in('id', studentIds),
  ]);
  const tutorMap = new Map((tutors ?? []).map(t => [t.id, t.name]));
  const studentMap = new Map((students ?? []).map(s => [s.id, s.name]));

  // Get Zoom token
  console.log('\nAuthenticating with Zoom…');
  let token: string;
  try {
    token = await getZoomToken();
    console.log('✅ Zoom token obtained.\n');
  } catch (e: any) {
    console.error('❌ Failed to get Zoom token:', e.message);
    process.exit(1);
  }

  // Age of selected sessions in days
  const ageInDays = (scheduledAt: string) =>
    Math.round((Date.now() - new Date(scheduledAt).getTime()) / (24 * 60 * 60 * 1000));

  console.log('══════════════════════════════════════════════════════════════════════════════');
  console.log('PART D — ZOOM RETENTION CHECK');
  console.log('══════════════════════════════════════════════════════════════════════════════\n');

  const results: {
    sessionId: string;
    student: string;
    tutor: string;
    scheduledAt: string;
    ageDays: number;
    zoomMeetingId: string;
    zoomStatus: number;
    found: boolean;
    zoomTopic?: string;
    zoomDuration?: number;
    mismatch?: string;
  }[] = [];

  for (const s of selected) {
    const age = ageInDays(s.scheduled_at);
    const student = studentMap.get(s.student_id) ?? s.student_id;
    const tutor = tutorMap.get(s.tutor_id) ?? s.tutor_id;
    const zoomId = String(s.zoom_meeting_id);

    process.stdout.write(`  [${s.scheduled_at.slice(0, 10)} — ${age}d ago] ${student} / ${tutor}  zoom_id=${zoomId}  … `);

    const result = await checkZoomMeeting(token, zoomId);

    let mismatch: string | undefined;
    if (result.found) {
      // Cross-check duration
      const zoomMin = result.duration ?? null;
      const dbMin = s.duration_minutes ?? null;
      if (zoomMin !== null && dbMin !== null && Math.abs(zoomMin - dbMin) > 5) {
        mismatch = `duration mismatch: Zoom=${zoomMin}min DB=${dbMin}min`;
      }
      console.log(`✅ FOUND  topic="${result.topic}"  duration=${result.duration}min${mismatch ? `  ⚠️ ${mismatch}` : ''}`);
    } else {
      console.log(`❌ NOT FOUND  (HTTP ${result.status})`);
    }

    results.push({
      sessionId: s.id,
      student,
      tutor,
      scheduledAt: s.scheduled_at.slice(0, 16),
      ageDays: age,
      zoomMeetingId: zoomId,
      zoomStatus: result.status,
      found: result.found,
      zoomTopic: result.topic,
      zoomDuration: result.duration,
      mismatch,
    });

    // Avoid rate-limiting
    await new Promise(r => setTimeout(r, 300));
  }

  // Summary
  const found = results.filter(r => r.found);
  const notFound = results.filter(r => !r.found);

  console.log('\n── Summary ──────────────────────────────────────────────────────────────────');
  console.log(`Sessions checked : ${results.length}`);
  console.log(`Zoom FOUND       : ${found.length}`);
  console.log(`Zoom NOT FOUND   : ${notFound.length}`);
  console.log('');

  if (notFound.length > 0) {
    console.log('⚠️  NOT FOUND sessions (Zoom data gone — cannot rebuild from Zoom):');
    for (const r of notFound) {
      console.log(`  ${r.scheduledAt}  age=${r.ageDays}d  zoom_id=${r.zoomMeetingId}  ${r.student} / ${r.tutor}`);
    }
    console.log('');
    const oldestNotFound = notFound.reduce((a, b) => a.ageDays > b.ageDays ? a : b);
    console.log(`  Oldest not-found session: ${oldestNotFound.ageDays} days ago`);
  } else {
    console.log('✅ All checked sessions are still available in Zoom past_meetings API.');
  }

  if (found.length > 0) {
    const oldestFound = found.reduce((a, b) => a.ageDays > b.ageDays ? a : b);
    console.log(`  Oldest session still in Zoom: ${oldestFound.ageDays} days ago (${oldestFound.scheduledAt})`);
  }

  console.log('\n── Implication for dedup strategy ──────────────────────────────────────────');
  if (notFound.length === 0) {
    console.log('Zoom still returns data for all checked sessions. A full Zoom-driven');
    console.log('rebuild (Strategy B) is viable for this age range.');
  } else {
    const cutoff = notFound.reduce((a, b) => a.ageDays < b.ageDays ? a : b).ageDays;
    console.log(`Zoom data is gone for sessions >${cutoff}d old. Strategy B (full Zoom rebuild)`);
    console.log('is NOT viable for the full history. Earliest missing session is ${cutoff} days old.');
    console.log('Any dedup strategy must treat existing DB records as the source of truth');
    console.log('for sessions beyond that horizon.');
  }

  console.log('\n══════════════════════════════════════════════════════════════════════════════');
  console.log('PART D COMPLETE.');
  console.log('══════════════════════════════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error(e); process.exit(1); });
