/**
 * import-zoom-sessions.ts
 *
 * Pulls Zoom meetings for today from the StudyCore Zoom account,
 * matches them to Supabase tutors/students, and creates session rows
 * for any meetings not already in the DB.
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/import-zoom-sessions.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// ---------------------------------------------------------------------------
// Zoom auth
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Zoom meeting list
// ---------------------------------------------------------------------------

interface ZoomMeeting {
  id: number;           // meeting ID (used as zoom_meeting_id)
  uuid: string;
  topic: string;
  start_time: string;   // ISO 8601
  duration: number;     // minutes
  join_url: string;
  start_url: string;    // host URL
  host_id: string;
  host_email?: string;  // present on some plan responses; we'll resolve separately
}

interface ZoomListResponse {
  meetings: ZoomMeeting[];
  next_page_token?: string;
}

/** Fetch a page of meetings by type, optionally continuing with a page token. */
async function fetchMeetingPage(
  token: string,
  type: 'live' | 'upcoming',
  pageToken?: string,
): Promise<ZoomListResponse> {
  const url = new URL(`https://api.zoom.us/v2/users/me/meetings`);
  url.searchParams.set('type', type);
  url.searchParams.set('page_size', '300');
  if (pageToken) url.searchParams.set('next_page_token', pageToken);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Zoom list error (${type}): ${await res.text()}`);
  return res.json() as Promise<ZoomListResponse>;
}

/** Exhaust all pages for a given meeting type. */
async function fetchAllMeetings(token: string, type: 'live' | 'upcoming'): Promise<ZoomMeeting[]> {
  const results: ZoomMeeting[] = [];
  let pageToken: string | undefined;
  do {
    const page = await fetchMeetingPage(token, type, pageToken);
    results.push(...(page.meetings ?? []));
    pageToken = page.next_page_token || undefined;
  } while (pageToken);
  return results;
}

/** Resolve the host's email from their Zoom user ID (only needed if host_email is absent). */
async function resolveHostEmail(token: string, hostId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.zoom.us/v2/users/${hostId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if the ISO date string falls on today (UTC). */
function isTodayUTC(isoString: string, todayUTC: string): boolean {
  return isoString.startsWith(todayUTC);
}

/**
 * Extract a candidate first name from a Zoom meeting topic.
 * e.g. "Kathryn's Study Core's Zoom Meeting"  → "Kathryn"
 *      "SAT Session — Jordan with Alex"        → "Jordan" (first word)
 *      "Study Core session"                    → null
 */
function extractFirstName(topic: string): string | null {
  // Pattern 1: "Name's …" (possessive)
  const possessive = topic.match(/^([A-Za-z]+)['']s\s/i);
  if (possessive) return possessive[1];

  // Pattern 2: "Session — Name with …" or "… — Name …"
  const dashName = topic.match(/—\s*([A-Za-z]+)/i);
  if (dashName) return dashName[1];

  // Pattern 3: first capitalized word that isn't a generic keyword
  const SKIP = new Set(['sat', 'act', 'study', 'zoom', 'session', 'tutoring', 'core', 'studycore']);
  const words = topic.split(/\s+/);
  for (const w of words) {
    const clean = w.replace(/[^A-Za-z]/g, '');
    if (clean.length >= 2 && /^[A-Z]/.test(clean) && !SKIP.has(clean.toLowerCase())) {
      return clean;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase env vars');

  const supabase = createClient(supabaseUrl, serviceKey);

  // Today's date in UTC ("YYYY-MM-DD")
  const todayUTC = new Date().toISOString().slice(0, 10);
  console.log(`\n[import-zoom-sessions] Today (UTC): ${todayUTC}`);

  // --- 1. Fetch Zoom meetings (live + upcoming) ---
  console.log('[import-zoom-sessions] Fetching Zoom token…');
  const zoomToken = await getZoomToken();

  console.log('[import-zoom-sessions] Fetching meetings (live + upcoming)…');
  const [liveMeetings, upcomingMeetings] = await Promise.all([
    fetchAllMeetings(zoomToken, 'live'),
    fetchAllMeetings(zoomToken, 'upcoming'),
  ]);

  // Deduplicate by meeting ID
  const seenIds = new Set<number>();
  const allMeetings: ZoomMeeting[] = [];
  for (const m of [...liveMeetings, ...upcomingMeetings]) {
    if (!seenIds.has(m.id)) {
      seenIds.add(m.id);
      allMeetings.push(m);
    }
  }
  console.log(`[import-zoom-sessions] Total unique meetings fetched: ${allMeetings.length}`);

  // Filter to today (skip meetings with no start_time — e.g. recurring templates)
  const todayMeetings = allMeetings.filter(m => m.start_time && isTodayUTC(m.start_time, todayUTC));
  console.log(`[import-zoom-sessions] Meetings on ${todayUTC}: ${todayMeetings.length}`);

  if (todayMeetings.length === 0) {
    console.log('\nNo Zoom meetings found for today. Done.');
    return;
  }

  // Print them out
  for (const m of todayMeetings) {
    console.log(`  [${m.id}] "${m.topic}" — ${m.start_time} (${m.duration} min)`);
  }

  // --- 2. Load all tutors and students for matching ---
  const [{ data: tutors }, { data: students }] = await Promise.all([
    supabase.from('tutors').select('id, name, email'),
    supabase.from('students').select('id, name'),
  ]);

  const tutorByEmail = new Map<string, { id: string; name: string }>();
  for (const t of tutors ?? []) {
    if (t.email) tutorByEmail.set(t.email.toLowerCase(), t);
  }

  // --- 3. Check which meetings already have a session ---
  const meetingIds = todayMeetings.map(m => String(m.id));
  const { data: existingSessions } = await supabase
    .from('sessions')
    .select('zoom_meeting_id')
    .in('zoom_meeting_id', meetingIds);

  const existingMeetingIds = new Set((existingSessions ?? []).map(s => s.zoom_meeting_id));

  // --- 4. Process each new meeting ---
  let alreadyInDB   = 0;
  let created       = 0;
  let unmatched     = 0;

  for (const meeting of todayMeetings) {
    const meetingIdStr = String(meeting.id);

    if (existingMeetingIds.has(meetingIdStr)) {
      console.log(`\n[${meeting.id}] Already in DB — skipping`);
      alreadyInDB++;
      continue;
    }

    console.log(`\n[${meeting.id}] New meeting: "${meeting.topic}"`);

    // Resolve host email
    let hostEmail = meeting.host_email?.toLowerCase() ?? null;
    if (!hostEmail && meeting.host_id) {
      hostEmail = (await resolveHostEmail(zoomToken, meeting.host_id))?.toLowerCase() ?? null;
      if (hostEmail) console.log(`  Resolved host email: ${hostEmail}`);
    }

    // Match tutor by host email
    const tutor = hostEmail ? (tutorByEmail.get(hostEmail) ?? null) : null;
    if (tutor) {
      console.log(`  Tutor matched: ${tutor.name} (${tutor.id})`);
    } else {
      console.log(`  Tutor NOT matched (host email: ${hostEmail ?? 'unknown'})`);
    }

    // Match student by first name in topic
    const firstName = extractFirstName(meeting.topic);
    console.log(`  Extracted name from topic: ${firstName ?? '(none)'}`);

    let student: { id: string; name: string } | null = null;
    if (firstName) {
      const nameLower = firstName.toLowerCase();
      // First try exact first-name match, then fallback to includes
      student =
        (students ?? []).find(s => s.name.toLowerCase().startsWith(nameLower + ' ') || s.name.toLowerCase() === nameLower)
        ?? (students ?? []).find(s => s.name.toLowerCase().includes(nameLower))
        ?? null;
    }
    if (student) {
      console.log(`  Student matched: ${student.name} (${student.id})`);
    } else {
      console.log(`  Student NOT matched`);
    }

    // student_id is NOT NULL in the DB — skip if we couldn't match one
    if (!student) {
      console.log(`  SKIPPED — cannot import without a matched student`);
      unmatched++;
      continue;
    }

    // Insert session
    const { error } = await supabase.from('sessions').insert({
      zoom_meeting_id:   meetingIdStr,
      zoom_join_url:     meeting.join_url,
      zoom_host_url:     meeting.start_url,
      scheduled_at:      meeting.start_time,
      duration_minutes:  meeting.duration,
      status:            'scheduled',
      tutor_id:          tutor?.id ?? null,
      student_id:        student.id,
    });

    if (error) {
      console.error(`  ERROR inserting session: ${error.message}`);
      unmatched++;
    } else {
      console.log(`  ✓ Session created${!tutor ? ' (no tutor matched — review in admin)' : ''}`);
      created++;
      if (!tutor) unmatched++;
    }
  }

  // --- 5. Summary ---
  console.log('\n══════════════════════════════════════');
  console.log('  Import Summary');
  console.log('══════════════════════════════════════');
  console.log(`  Zoom meetings on ${todayUTC}:  ${todayMeetings.length}`);
  console.log(`  Already in DB (skipped):        ${alreadyInDB}`);
  console.log(`  New sessions created:           ${created}`);
  console.log(`  Missing tutor or student:       ${unmatched}`);
  console.log('══════════════════════════════════════\n');
}

main().catch(err => {
  console.error('[import-zoom-sessions] Fatal error:', err);
  process.exit(1);
});
