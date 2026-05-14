/**
 * sync-upcoming-zoom-sessions.ts
 *
 * Pulls all upcoming Zoom meetings, filters internal ones, and produces a
 * preview report of which sessions would be created in the DB — without
 * actually inserting anything.
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/sync-upcoming-zoom-sessions.ts
 *
 * Output:
 *   scripts/output/upcoming-zoom-preview-v5.csv
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// ── Types ─────────────────────────────────────────────────────────────────────

interface ZoomMeeting {
  id: number;
  uuid: string;
  topic: string;
  start_time: string;  // ISO 8601; absent on recurring templates
  duration: number;    // minutes
  join_url: string;
  start_url: string;
  host_id: string;
  host_email?: string;
}

interface ZoomListResponse {
  meetings: ZoomMeeting[];
  next_page_token?: string;
}

interface DbStudent {
  id: string;
  name: string;
}

interface DbTutor {
  id: string;
  name: string;
  email: string | null;
}

interface DbSession {
  id: string;
  zoom_meeting_id: string | null;
  student_id: string;
  tutor_id: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  status: string;
}

// ── Manual meeting-ID → student name mapping ──────────────────────────────────
// For meetings whose title has no student name (e.g. "StudyCore Tutoring Session").
// Add entries here once you know which student each meeting belongs to:
//   '84806563336': 'Jordan Smith'
const MANUAL_MEETING_MAP: Record<string, string> = {
  // All 14 sixty-minute "StudyCore Tutoring Session" Monday 11 PM ET meetings → Charissa Alex-Baxter
  '81024073871': 'Charissa Alex-Baxter',
  '81057433918': 'Charissa Alex-Baxter',
  '81545332646': 'Charissa Alex-Baxter',
  '81848748641': 'Charissa Alex-Baxter',
  '81892379076': 'Charissa Alex-Baxter',
  '82621980816': 'Charissa Alex-Baxter',
  '84062394099': 'Charissa Alex-Baxter',
  '84394216928': 'Charissa Alex-Baxter',
  '84873226811': 'Charissa Alex-Baxter',
  '85327285071': 'Charissa Alex-Baxter',
  '85414589518': 'Charissa Alex-Baxter',
  '86068387808': 'Charissa Alex-Baxter',
  '87312953581': 'Charissa Alex-Baxter',
  '89182599266': 'Charissa Alex-Baxter',
  // 14 ninety-minute "StudyCore Tutoring Session" Monday 11 PM ET meetings — student TBD
  // '81675452339': 'Student Name',
  // '82001286596': 'Student Name',
  // '84846368185': 'Student Name',
  // '85225496752': 'Student Name',
  // '86321406577': 'Student Name',
  // '87245908642': 'Student Name',
  // '87841937678': 'Student Name',
  // '87908486716': 'Student Name',
  // '88675240654': 'Student Name',
  // '89010593459': 'Student Name',
  // '89563015547': 'Student Name',
  // '89770417324': 'Student Name',
  // '89827449138': 'Student Name',
  // '89982422928': 'Student Name',
};

// ── Alias / not-yet-in-DB student names ───────────────────────────────────────
// Maps extracted first-name variants to ILIKE patterns used to search the DB.
// If the DB search still returns nothing, the meeting is flagged "add student first".
const ALIAS_SEARCHES: Record<string, string> = {
  'susanne':  '%susannah%',
  'susannah': '%susannah%',
  'sohum':    '%sohum%',
  'caden':    '%caden%',
};

// ── Internal-meeting filter ───────────────────────────────────────────────────

const INTERNAL_KEYWORDS = [
  'interview', 'training', 'team meeting', 'setter', 'sales',
  'onboarding', 'closer', 'cen', 'test', 'demo',
];

function isInternal(topic: string): boolean {
  const lower = topic.toLowerCase();
  return INTERNAL_KEYWORDS.some(kw => lower.includes(kw));
}

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

// ── Zoom meeting fetching ─────────────────────────────────────────────────────

async function fetchMeetingPage(
  token: string,
  pageToken?: string,
): Promise<ZoomListResponse> {
  const url = new URL('https://api.zoom.us/v2/users/me/meetings');
  url.searchParams.set('type', 'upcoming');
  url.searchParams.set('page_size', '300');
  if (pageToken) url.searchParams.set('next_page_token', pageToken);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Zoom list error: ${await res.text()}`);
  return res.json() as Promise<ZoomListResponse>;
}

async function fetchAllUpcomingMeetings(token: string): Promise<ZoomMeeting[]> {
  const results: ZoomMeeting[] = [];
  let pageToken: string | undefined;
  do {
    const page = await fetchMeetingPage(token, pageToken);
    results.push(...(page.meetings ?? []));
    pageToken = page.next_page_token || undefined;
  } while (pageToken);
  return results;
}

// ── Name extraction ───────────────────────────────────────────────────────────

/**
 * Extract a candidate first name from a Zoom meeting topic.
 * Mirrors the logic in import-zoom-sessions.ts.
 * e.g. "Kathryn's StudyCore Zoom Meeting"  → "Kathryn"
 *      "SAT Session — Jordan with Alex"     → "Jordan"
 *      "Emma & Tutor — StudyCore"           → "Emma"
 */
function extractFirstName(topic: string): string | null {
  // Pattern 1: "Name's …" (possessive).
  // Match any single non-letter before 's ' to catch all apostrophe variants
  // (straight ', curly ', backtick `, modifier letter ʼ, etc.)
  const possessive = topic.match(/^([A-Za-z]+)[^A-Za-z\d\s]s\s/i);
  if (possessive) {
    let name = possessive[1];
    // After stripping 's the captured token may still end in 's' when the
    // name itself ends in s (e.g. "Adam's" → regex sees "Adams" in group 1
    // for some apostrophe variants, "Faris's" → "Fariss", "Tanishi's" → "Tanishis").
    // Rule: if the result ends in s AND length > 3, strip the trailing s.
    if (name.length > 3 && name.endsWith('s')) name = name.slice(0, -1);
    return name;
  }

  // Pattern 2: "… — Name …" (em-dash separator)
  const dashName = topic.match(/[—–-]\s*([A-Za-z]+)/i);
  if (dashName) return dashName[1];

  // Pattern 3: "Name & …" (ampersand pair — student is usually first)
  const ampersand = topic.match(/^([A-Za-z]+)\s*[&+]/i);
  if (ampersand) return ampersand[1];

  // Pattern 4: first capitalized word that isn't a generic keyword
  const SKIP = new Set(['sat', 'act', 'study', 'zoom', 'session', 'tutoring', 'core', 'studycore', 'prep', 'meeting']);
  for (const w of topic.split(/\s+/)) {
    const clean = w.replace(/[^A-Za-z]/g, '');
    if (clean.length >= 2 && /^[A-Z]/.test(clean) && !SKIP.has(clean.toLowerCase())) {
      return clean;
    }
  }
  return null;
}

// ── Student fuzzy match ───────────────────────────────────────────────────────

function matchStudent(
  firstName: string,
  students: DbStudent[],
): DbStudent | null {
  const nameLower = firstName.toLowerCase();
  // 1. Exact first-name prefix ("Jordan Smith" starts with "jordan ")
  const exact = students.find(
    s => s.name.toLowerCase().startsWith(nameLower + ' ') || s.name.toLowerCase() === nameLower,
  );
  if (exact) return exact;
  // 2. Substring anywhere in name
  return students.find(s => s.name.toLowerCase().includes(nameLower)) ?? null;
}

// ── Duration inference ────────────────────────────────────────────────────────

function inferDuration(
  zoomDuration: number,
  pastSessions: DbSession[],
): { duration: number; source: string } {
  if (pastSessions.length === 0) {
    return { duration: zoomDuration, source: 'zoom (no history)' };
  }

  // Tally duration values
  const tally = new Map<number, number>();
  for (const s of pastSessions) {
    if (s.duration_minutes == null) continue;
    tally.set(s.duration_minutes, (tally.get(s.duration_minutes) ?? 0) + 1);
  }

  if (tally.size === 0) {
    return { duration: zoomDuration, source: 'zoom (no duration history)' };
  }

  // Find the most common duration
  let topDur = zoomDuration;
  let topCount = 0;
  for (const [dur, count] of tally) {
    if (count > topCount) { topCount = count; topDur = dur; }
  }

  if (topCount >= 3) {
    // Sanity check: history values < 30 min are corrupt (e.g. Zoom recording
    // artefacts that logged 6/9/11 min).  Fall back to Zoom's own field.
    if (topDur < 30) {
      return { duration: zoomDuration, source: `zoom (history corrupt: ${topCount}× ${topDur} min < 30 min floor)` };
    }
    return { duration: topDur, source: `history (${topCount}× ${topDur} min)` };
  }

  // Inconsistent — fall back to Zoom's own field
  return { duration: zoomDuration, source: `zoom (inconsistent history: ${[...tally.entries()].map(([d, c]) => `${d}×${c}`).join(', ')})` };
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function csvEscape(val: string | null | undefined): string {
  const s = val ?? '';
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(...cols: (string | number | null | undefined)[]): string {
  return cols.map(c => csvEscape(String(c ?? ''))).join(',');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (process.env.IMPORT_LOCKED === 'true') {
    console.error('❌  IMPORT_LOCKED=true — Zoom session import is locked while the duplicate-session investigation is in progress. Unset IMPORT_LOCKED to re-enable.');
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase env vars');

  const supabase = createClient(supabaseUrl, serviceKey);

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║       sync-upcoming-zoom-sessions  (preview only)   ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // ── Step 1: Fetch upcoming Zoom meetings ────────────────────────────────────
  console.log('Step 1 — Fetching Zoom token…');
  const zoomToken = await getZoomToken();

  console.log('Step 1 — Fetching all upcoming meetings (paginated)…');
  const rawMeetings = await fetchAllUpcomingMeetings(zoomToken);
  console.log(`         Total from Zoom: ${rawMeetings.length} meetings`);

  // Filter out meetings with no start_time (recurring templates) and internal
  const withStartTime = rawMeetings.filter(m => !!m.start_time);
  const filtered = withStartTime.filter(m => !isInternal(m.topic));
  const internalCount = withStartTime.length - filtered.length;
  console.log(`         Filtered out (internal / no start_time): ${rawMeetings.length - filtered.length} (${internalCount} internal, ${rawMeetings.length - withStartTime.length} no start_time)`);
  console.log(`         Remaining for analysis: ${filtered.length} meetings\n`);

  if (filtered.length === 0) {
    console.log('No upcoming non-internal meetings found. Done.');
    return;
  }

  // ── Step 2: Check which already exist in the DB ─────────────────────────────
  // Key: `${zoom_meeting_id}__${YYYY-MM-DD}` so a recurring meeting (same ID,
  // different dates) only matches an existing row on the *same calendar date*.
  console.log('Step 2 — Checking DB for existing sessions…');
  const meetingIds = filtered.map(m => String(m.id));

  // Fetch by date range instead of meeting ID list — avoids Supabase URL-length limits
  // with thousands of IDs in an IN clause.
  const rangeStart = filtered.reduce((min, m) => m.start_time < min ? m.start_time : min, filtered[0].start_time);
  const rangeEnd   = filtered.reduce((max, m) => m.start_time > max ? m.start_time : max, filtered[0].start_time);

  const { data: existingRaw, error: existErr } = await supabase
    .from('sessions')
    .select('id, zoom_meeting_id, student_id, tutor_id, scheduled_at, duration_minutes, status')
    .not('zoom_meeting_id', 'is', null)
    .gte('scheduled_at', rangeStart)
    .lte('scheduled_at', rangeEnd);

  if (existErr) throw new Error(`DB error fetching existing sessions: ${existErr.message}`);

  // meeting_id + date → existing session
  const existingByMeetingDate = new Map<string, DbSession>();
  for (const s of (existingRaw ?? []) as DbSession[]) {
    if (!s.zoom_meeting_id || !s.scheduled_at) continue;
    const date = s.scheduled_at.slice(0, 10); // "YYYY-MM-DD"
    const key  = `${s.zoom_meeting_id}__${date}`;
    if (!existingByMeetingDate.has(key)) existingByMeetingDate.set(key, s);
  }
  console.log(`         ${existingByMeetingDate.size} meeting+date combos already in DB\n`);

  // ── Step 3+4: Load students, tutors, and past sessions ──────────────────────
  console.log('Step 3+4 — Loading students, tutors, and past session history…');
  const [{ data: studentsRaw }, { data: tutorsRaw }] = await Promise.all([
    supabase.from('students').select('id, name'),
    supabase.from('tutors').select('id, name, email'),
  ]);

  const students = (studentsRaw ?? []) as DbStudent[];
  const tutors   = (tutorsRaw   ?? []) as DbTutor[];

  // Build tutor lookup by email
  const tutorByEmail = new Map<string, DbTutor>();
  for (const t of tutors) {
    if (t.email) tutorByEmail.set(t.email.toLowerCase(), t);
  }

  // Fetch all past sessions (completed) for meeting IDs in our list, for duration inference.
  // Batch in chunks of 500 to avoid Supabase PostgREST URL-length limits.
  const BATCH = 500;
  const pastSessionChunks: DbSession[][] = [];
  for (let i = 0; i < meetingIds.length; i += BATCH) {
    const chunk = meetingIds.slice(i, i + BATCH);
    const { data } = await supabase
      .from('sessions')
      .select('id, zoom_meeting_id, student_id, tutor_id, scheduled_at, duration_minutes, status')
      .in('zoom_meeting_id', chunk)
      .in('status', ['completed', 'cancelled', 'no_show_student', 'no_show_tutor', 'no_show_both']);
    if (data) pastSessionChunks.push(data as DbSession[]);
  }
  const pastSessionsRaw = pastSessionChunks.flat();

  const pastByMeetingId = new Map<string, DbSession[]>();
  for (const s of (pastSessionsRaw ?? []) as DbSession[]) {
    if (!s.zoom_meeting_id) continue;
    const arr = pastByMeetingId.get(s.zoom_meeting_id) ?? [];
    arr.push(s);
    pastByMeetingId.set(s.zoom_meeting_id, arr);
  }

  // Fix 4: fetch all upcoming scheduled sessions so we can detect timeslot
  // collisions: same student_id within ±30 min of a candidate start_time.
  const { data: scheduledRaw } = await supabase
    .from('sessions')
    .select('student_id, scheduled_at')
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString());

  // student_id → list of scheduled_at timestamps (ms)
  const scheduledMsByStudent = new Map<string, number[]>();
  for (const s of (scheduledRaw ?? []) as { student_id: string; scheduled_at: string }[]) {
    const arr = scheduledMsByStudent.get(s.student_id) ?? [];
    arr.push(new Date(s.scheduled_at).getTime());
    scheduledMsByStudent.set(s.student_id, arr);
  }

  // For tutor inference: most recent tutor_id per student_id across all past sessions
  const { data: recentSessionsRaw } = await supabase
    .from('sessions')
    .select('student_id, tutor_id, scheduled_at')
    .in('status', ['completed'])
    .not('tutor_id', 'is', null)
    .order('scheduled_at', { ascending: false })
    .limit(2000);

  // student_id → most-recently-seen tutor_id
  const recentTutorByStudent = new Map<string, string>();
  for (const s of (recentSessionsRaw ?? []) as { student_id: string; tutor_id: string; scheduled_at: string }[]) {
    if (!recentTutorByStudent.has(s.student_id)) {
      recentTutorByStudent.set(s.student_id, s.tutor_id);
    }
  }

  const tutorById = new Map<string, DbTutor>();
  for (const t of tutors) tutorById.set(t.id, t);

  console.log(`         ${students.length} students, ${tutors.length} tutors loaded\n`);

  // ── Step 5: Build preview rows ──────────────────────────────────────────────
  console.log('Step 5 — Building preview…\n');

  interface PreviewRow {
    meetingId:      string;
    topic:          string;
    startTime:      string;
    zoomDuration:   number;
    inferredDur:    number;
    durationSource: string;
    extractedName:  string;
    matchedStudent: string;
    matchedStudentId: string;
    matchedTutor:   string;
    matchedTutorId: string;
    tutorSource:    string;
    statusLabel:    'already exists' | 'will create' | 'no student match' | 'already exists (not scheduled)' | 'duplicate timeslot' | 'add student first';
  }

  const rows: PreviewRow[] = [];

  let countAlready        = 0;
  let countCreate         = 0;
  let countNoMatch        = 0;
  let countDupTimeslot    = 0;
  let countAddFirst       = 0;

  for (const m of filtered) {
    const midStr      = String(m.id);
    const meetingDate = m.start_time.slice(0, 10); // "YYYY-MM-DD"
    const existing    = existingByMeetingDate.get(`${midStr}__${meetingDate}`);
    const pastSessions = pastByMeetingId.get(midStr) ?? [];

    // Infer duration
    const { duration: inferredDur, source: durationSource } = inferDuration(m.duration, pastSessions);

    // Fix 1: trim whitespace before any name extraction
    const topic = (m.topic ?? '').trim();

    // Fix 3: check manual meeting-ID map first
    const manualName = MANUAL_MEETING_MAP[midStr] ?? null;

    // Extract student name (from manual map or topic)
    const firstName = manualName ?? extractFirstName(topic);

    // Normal fuzzy match
    let matchedStudent = firstName ? matchStudent(firstName, students) : null;

    // Fix 2: alias fallback for known students not yet in the DB.
    // If the fuzzy match returned nothing but the extracted name matches a
    // known alias, do a live ILIKE lookup against the DB.
    let addStudentFirst = false;
    if (!matchedStudent && firstName) {
      const aliasPattern = ALIAS_SEARCHES[firstName.toLowerCase()] ?? null;
      if (aliasPattern) {
        const { data: aliasHits } = await supabase
          .from('students')
          .select('id, name')
          .ilike('name', aliasPattern)
          .limit(1);
        if (aliasHits && aliasHits.length > 0) {
          matchedStudent = aliasHits[0] as DbStudent;
        } else {
          // Known alias but student not in DB yet — flag clearly
          addStudentFirst = true;
        }
      }
    }

    // Match tutor: prefer host email → fallback to most-recent tutor for student
    let matchedTutor: DbTutor | null = null;
    let tutorSource = '';

    const hostEmail = m.host_email?.toLowerCase() ?? null;
    if (hostEmail) {
      const byEmail = tutorByEmail.get(hostEmail) ?? null;
      if (byEmail) { matchedTutor = byEmail; tutorSource = 'host email'; }
    }

    if (!matchedTutor && matchedStudent) {
      const recentTutorId = recentTutorByStudent.get(matchedStudent.id) ?? null;
      if (recentTutorId) {
        matchedTutor = tutorById.get(recentTutorId) ?? null;
        if (matchedTutor) tutorSource = 'recent history';
      }
    }

    // Determine status
    let statusLabel: PreviewRow['statusLabel'];
    if (existing) {
      statusLabel = existing.status === 'scheduled' ? 'already exists' : 'already exists (not scheduled)';
      countAlready++;
    } else if (addStudentFirst) {
      statusLabel = 'add student first';
      countAddFirst++;
    } else if (!matchedStudent) {
      statusLabel = 'no student match';
      countNoMatch++;
    } else {
      // Check for a timeslot collision — another session for the same student
      // already exists within ±30 minutes of this start_time.
      const candidateMs = new Date(m.start_time).getTime();
      const THIRTY_MIN  = 30 * 60 * 1000;
      const hasCollision = (scheduledMsByStudent.get(matchedStudent.id) ?? [])
        .some(ts => Math.abs(ts - candidateMs) <= THIRTY_MIN);

      if (hasCollision) {
        statusLabel = 'duplicate timeslot';
        countDupTimeslot++;
      } else {
        statusLabel = 'will create';
        countCreate++;
      }
    }

    rows.push({
      meetingId:      midStr,
      topic:          topic,          // trimmed
      startTime:      m.start_time,
      zoomDuration:   m.duration,
      inferredDur,
      durationSource,
      extractedName:  firstName ?? '(none)',
      matchedStudent: matchedStudent?.name ?? '—',
      matchedStudentId: matchedStudent?.id ?? '',
      matchedTutor:   matchedTutor?.name ?? '—',
      matchedTutorId: matchedTutor?.id ?? '',
      tutorSource,
      statusLabel,
    });
  }

  // ── Print table to console ──────────────────────────────────────────────────
  const STATUS_EMOJI: Record<PreviewRow['statusLabel'], string> = {
    'will create':                   '✅ will create',
    'already exists':                '⏭  already exists',
    'already exists (not scheduled)':'⚠️  already exists (not scheduled)',
    'no student match':              '❌ no student match',
    'duplicate timeslot':            '🔁 duplicate timeslot — skip',
    'add student first':             '👤 add student first',
  };

  // Column widths
  const W = { topic: 45, time: 20, dur: 6, name: 16, student: 22, tutor: 20, status: 32 };

  function pad(s: string, w: number): string {
    return s.length >= w ? s.slice(0, w - 1) + '…' : s.padEnd(w);
  }

  const header = [
    pad('Topic', W.topic), pad('Start Time', W.time), pad('Min', W.dur),
    pad('Extracted', W.name), pad('Student', W.student), pad('Tutor', W.tutor), 'Status',
  ].join('  ');

  console.log('─'.repeat(header.length));
  console.log(header);
  console.log('─'.repeat(header.length));

  for (const r of rows) {
    const line = [
      pad(r.topic, W.topic),
      pad(r.startTime.replace('T', ' ').slice(0, 19), W.time),
      pad(String(r.inferredDur), W.dur),
      pad(r.extractedName, W.name),
      pad(r.matchedStudent, W.student),
      pad(r.matchedTutor, W.tutor),
      STATUS_EMOJI[r.statusLabel],
    ].join('  ');
    console.log(line);
  }

  console.log('─'.repeat(header.length));

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║            Preview Summary           ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  Total upcoming (non-internal): ${String(filtered.length).padStart(4)} ║`);
  console.log(`║  Already in DB (scheduled):     ${String(countAlready).padStart(4)} ║`);
  console.log(`║  Will be created:               ${String(countCreate).padStart(4)} ║`);
  console.log(`║  Duplicate timeslot (skip):     ${String(countDupTimeslot).padStart(4)} ║`);
  console.log(`║  Add student first:             ${String(countAddFirst).padStart(4)} ║`);
  console.log(`║  No student match:              ${String(countNoMatch).padStart(4)} ║`);
  console.log('╚══════════════════════════════════════╝\n');

  // ── Write CSV ───────────────────────────────────────────────────────────────
  const outputDir = path.resolve(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const csvPath = path.join(outputDir, 'upcoming-zoom-preview-v5.csv');
  const csvLines: string[] = [
    row(
      'meeting_id', 'topic', 'start_time', 'zoom_duration_min',
      'inferred_duration_min', 'duration_source',
      'extracted_name', 'matched_student', 'matched_student_id',
      'matched_tutor', 'matched_tutor_id', 'tutor_source', 'status',
    ),
    ...rows.map(r => row(
      r.meetingId, r.topic, r.startTime, r.zoomDuration,
      r.inferredDur, r.durationSource,
      r.extractedName, r.matchedStudent, r.matchedStudentId,
      r.matchedTutor, r.matchedTutorId, r.tutorSource, r.statusLabel,
    )),
  ];

  fs.writeFileSync(csvPath, csvLines.join('\n') + '\n', 'utf8');
  console.log(`CSV saved → ${csvPath}`);

  // ── Import mode ─────────────────────────────────────────────────────────────
  if (!process.argv.includes('--import')) {
    console.log('\n⚠️  No records were inserted. Review the preview and run with --import to proceed.\n');
    return;
  }

  const toInsert = rows.filter(r => r.statusLabel === 'will create');
  console.log(`\n🚀 Import mode — inserting ${toInsert.length} sessions into Supabase…\n`);

  // Build the original meeting map for join_url lookup
  const meetingJoinUrl = new Map<string, string>();
  for (const m of filtered) meetingJoinUrl.set(String(m.id), m.join_url);

  const INSERT_BATCH = 100;
  let inserted = 0;
  let skipped  = 0;

  for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
    const chunk = toInsert.slice(i, i + INSERT_BATCH);
    const records = chunk.map(r => ({
      zoom_meeting_id:   r.meetingId,
      zoom_join_url:     meetingJoinUrl.get(r.meetingId) ?? null,
      student_id:        r.matchedStudentId,
      tutor_id:          r.matchedTutorId || null,
      scheduled_at:      r.startTime,
      duration_minutes:  r.inferredDur,
      status:            'scheduled',
      uses_permanent_link: false,
    }));

    const { error } = await supabase.from('sessions').insert(records);
    if (error) {
      console.error(`  ❌ Batch ${Math.floor(i / INSERT_BATCH) + 1} failed: ${error.message}`);
      skipped += chunk.length;
    } else {
      inserted += chunk.length;
      process.stdout.write(`  ✅ ${inserted}/${toInsert.length} inserted\r`);
    }
  }

  console.log(`\n\n╔══════════════════════════════════════╗`);
  console.log(`║            Import Results            ║`);
  console.log(`╠══════════════════════════════════════╣`);
  console.log(`║  Inserted:                      ${String(inserted).padStart(4)} ║`);
  console.log(`║  Failed (batch errors):         ${String(skipped).padStart(4)} ║`);
  console.log(`║  Skipped (no match / dup):      ${String(rows.length - toInsert.length).padStart(4)} ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
}

main().catch(err => {
  console.error('[sync-upcoming-zoom-sessions] Fatal error:', err);
  process.exit(1);
});
