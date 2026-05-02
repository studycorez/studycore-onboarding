/**
 * Verify tutor-student assignments using Zoom meeting topics as the source of truth.
 *
 * Since all meetings are hosted under a single Zoom account (info@studycore.net),
 * we cannot use host_email or the participants API to identify tutors.  The only
 * reliable signal is the meeting TOPIC.  Known formats:
 *
 *   "StudyCore: {A} & {B}"                        — both names (45 meetings)
 *   "StudyCore: {A} with {B} (Makeup Session)"    — both names
 *   "StudyCore SAT Session — {Student} with {Tutor}" — both names
 *   "{Name}'s SAT StudyCore Session"              — student first name only
 *   "{Name}'s StudyCore SAT Session"              — student first name only
 *   "StudyCore Tutoring Session"                  — no names (manual review)
 *
 * Sessions whose meetings have expired (404) cannot be verified from Zoom and are
 * skipped (they show up in the "cannot verify" bucket).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/verify-assignments-from-zoom.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/verify-assignments-from-zoom.ts --live
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const LIVE    =  process.argv.includes('--live');
const DRY_RUN = !LIVE;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const HR  = '─'.repeat(80);
const HR2 = '═'.repeat(80);

// ── Types ─────────────────────────────────────────────────────────────────────

interface DbTutor   { id: string; name: string; email: string }
interface DbStudent { id: string; name: string; email: string }
interface DbSession {
  id: string;
  scheduled_at: string;
  status: string;
  zoom_meeting_id: string;
  tutor_id: string;
  student_id: string;
}
interface DbContract { id: string; tutor_id: string; student_id: string; status: string }

interface ZoomTopicResult {
  meetingId: string;
  topic: string | null;   // null = 404 or error
}

interface ParsedTopic {
  kind:
    | 'both_names'   // extracted a tutor name AND a student name
    | 'student_only' // extracted only a student/first name
    | 'no_names';    // generic topic, cannot extract
  rawA?: string;     // first extracted name token
  rawB?: string;     // second extracted name token
}

interface Mismatch {
  session: DbSession;
  topic: string;
  dbTutor: DbTutor;
  dbStudent: DbStudent;
  /** tutor we think Zoom implies (may be null if not identifiable) */
  zoomTutor: DbTutor | null;
  /** student we think Zoom implies (may be null if not identifiable) */
  zoomStudent: DbStudent | null;
  mismatchKind: 'tutor' | 'student' | 'both';
}

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

/** Fetch meeting topic for one meetingId. Returns null on 404/error. */
async function fetchTopic(token: string, meetingId: string): Promise<string | null> {
  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    // rate-limited? back-off and retry once
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 2000));
      const r2 = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r2.ok) return null;
      const d2 = await r2.json() as { topic?: string };
      return d2.topic ?? null;
    }
    return null;
  }
  const data = await data_json(res);
  const t = data.topic;
  return typeof t === 'string' ? t : null;
}

// typed wrapper to avoid casting in multiple places
async function data_json(r: Response): Promise<Record<string, unknown>> {
  return r.json() as Promise<Record<string, unknown>>;
}

/** Fetch topics for a batch of sessions, 10 concurrently. */
async function fetchTopics(token: string, meetingIds: string[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const CONCURRENCY = 10;
  for (let i = 0; i < meetingIds.length; i += CONCURRENCY) {
    const batch = meetingIds.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async mid => ({ mid, topic: await fetchTopic(token, mid) }))
    );
    for (const { mid, topic } of results) result.set(mid, topic);
    // small pause between batches to respect rate limits
    if (i + CONCURRENCY < meetingIds.length) await new Promise(r => setTimeout(r, 100));
  }
  return result;
}

// ── Topic parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a Zoom meeting topic to extract name tokens.
 *
 * Handles:
 *   "StudyCore: A & B"
 *   "StudyCore: A with B (Makeup Session)"
 *   "StudyCore SAT Session — A with B"
 *   "A's SAT StudyCore Session"
 *   "A's StudyCore SAT Session"
 *   "StudyCore Tutoring Session" → no_names
 */
function parseTopic(topic: string): ParsedTopic {
  const t = topic.trim();

  // Pattern 1: "StudyCore: A & B"
  const ampMatch = t.match(/^StudyCore:\s+(.+?)\s+&\s+(.+)$/i);
  if (ampMatch) {
    return { kind: 'both_names', rawA: ampMatch[1].trim(), rawB: ampMatch[2].trim() };
  }

  // Pattern 2: "StudyCore: A with B [...]"  or  "StudyCore SAT Session — A with B"
  const withMatch = t.match(/(?:^StudyCore:\s+|Session\s*—\s*)(.+?)\s+with\s+(.+?)(?:\s*\(.*\))?$/i);
  if (withMatch) {
    return { kind: 'both_names', rawA: withMatch[1].trim(), rawB: withMatch[2].trim() };
  }

  // Pattern 3: "X's SAT StudyCore Session" / "X's StudyCore SAT Session" / etc.
  const possessiveMatch = t.match(/^(.+?)(?:'s|'s)\s+(?:SAT\s+)?StudyCore/i);
  if (possessiveMatch) {
    return { kind: 'student_only', rawA: possessiveMatch[1].trim() };
  }

  // Pattern 4: Generic or unknown
  return { kind: 'no_names' };
}

// ── Name matching ─────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordOverlap(a: string, b: string): number {
  const wa = new Set(norm(a).split(' ').filter(w => w.length >= 2));
  const wb = new Set(norm(b).split(' ').filter(w => w.length >= 2));
  let count = 0;
  for (const w of wa) if (wb.has(w)) count++;
  return count;
}

function bestMatch<T extends { name: string }>(rawName: string, candidates: T[]): T | null {
  let best: T | null = null;
  let bestScore = 0;
  const normRaw = norm(rawName);
  for (const c of candidates) {
    const score = wordOverlap(normRaw, c.name);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  // Require at least 1 matching word-token
  return bestScore >= 1 ? best : null;
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${HR2}`);
  console.log(`  VERIFY ASSIGNMENTS FROM ZOOM — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`${HR2}\n`);

  // ── Load DB data ─────────────────────────────────────────────────────────────
  const [
    { data: tutorsRaw },
    { data: studentsRaw },
    { data: sessionsRaw },
    { data: contractsRaw },
  ] = await Promise.all([
    supabase.from('tutors').select('id, name, email'),
    supabase.from('students').select('id, name, email'),
    supabase.from('sessions')
      .select('id, scheduled_at, status, zoom_meeting_id, tutor_id, student_id')
      .not('zoom_meeting_id', 'is', null),
    supabase.from('contracts').select('id, tutor_id, student_id, status'),
  ]);

  const tutors    = (tutorsRaw    ?? []) as DbTutor[];
  const students  = (studentsRaw  ?? []) as DbStudent[];
  const sessions  = (sessionsRaw  ?? []) as DbSession[];
  const contracts = (contractsRaw ?? []) as DbContract[];

  const tutorById   = new Map(tutors.map(t => [t.id, t]));
  const studentById = new Map(students.map(s => [s.id, s]));

  console.log(`Loaded ${sessions.length} sessions with zoom_meeting_id`);
  console.log(`       ${tutors.length} tutors, ${students.length} students, ${contracts.length} contracts\n`);

  // ── Get Zoom token ────────────────────────────────────────────────────────────
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err: unknown) {
    console.error('Could not get Zoom token:', (err as Error).message);
    process.exit(1);
  }

  // ── Fetch all Zoom meeting topics ─────────────────────────────────────────────
  const uniqueIds = [...new Set(sessions.map(s => s.zoom_meeting_id))];
  console.log(`Fetching topics for ${uniqueIds.length} unique Zoom meeting IDs...`);
  const topicMap = await fetchTopics(token, uniqueIds);

  const fetched  = [...topicMap.values()].filter(v => v !== null).length;
  const expired  = [...topicMap.values()].filter(v => v === null).length;
  console.log(`  Topics fetched: ${fetched} | Expired/not found: ${expired}\n`);

  // ── Analyse each session ──────────────────────────────────────────────────────
  const mismatches:   Mismatch[]  = [];
  const studentMismatch: Mismatch[] = [];
  const cannotVerify: DbSession[] = [];  // 404 topic
  const noInfo:       DbSession[] = [];  // topic has no names
  const correct:      number[]    = []; // index placeholder

  for (const s of sessions) {
    const topic = topicMap.get(s.zoom_meeting_id);
    const dbTutor   = tutorById.get(s.tutor_id);
    const dbStudent = studentById.get(s.student_id);

    if (!dbTutor || !dbStudent) continue; // broken reference, skip

    if (topic === null) {
      cannotVerify.push(s);
      continue;
    }

    const parsed = parseTopic(topic as string);

    if (parsed.kind === 'no_names') {
      noInfo.push(s);
      continue;
    }

    if (parsed.kind === 'student_only') {
      // Only verify the student side
      const zoomStudent = bestMatch(parsed.rawA!, students);
      if (zoomStudent && zoomStudent.id !== s.student_id) {
        // student mismatch
        mismatches.push({
          session: s, topic: topic as string,
          dbTutor, dbStudent,
          zoomTutor: null,
          zoomStudent,
          mismatchKind: 'student',
        });
      } else {
        correct.push(1);
      }
      continue;
    }

    // both_names: rawA and rawB — determine which is tutor and which is student
    const rawA = parsed.rawA!;
    const rawB = parsed.rawB!;

    // Try to match each token against tutors and students
    const tutorMatchA   = bestMatch(rawA, tutors);
    const tutorMatchB   = bestMatch(rawB, tutors);
    const studentMatchA = bestMatch(rawA, students);
    const studentMatchB = bestMatch(rawB, students);

    // Prefer the pairing where tutor+student are both identified
    let zoomTutor:   DbTutor   | null = null;
    let zoomStudent: DbStudent | null = null;

    // Pattern "StudyCore: A & B" — check order: (student & tutor) or (tutor & student)
    // Heuristic: if A matches a student better and B matches a tutor better, A=student B=tutor
    const aStudentScore = wordOverlap(rawA, dbStudent.name);
    const bStudentScore = wordOverlap(rawB, dbStudent.name);
    const aTutorScore   = wordOverlap(rawA, dbTutor.name);
    const bTutorScore   = wordOverlap(rawB, dbTutor.name);

    if (studentMatchA && tutorMatchB) {
      zoomStudent = studentMatchA;
      zoomTutor   = tutorMatchB;
    } else if (studentMatchB && tutorMatchA) {
      zoomStudent = studentMatchB;
      zoomTutor   = tutorMatchA;
    } else if (studentMatchA) {
      zoomStudent = studentMatchA;
      zoomTutor   = tutorMatchB;
    } else if (studentMatchB) {
      zoomStudent = studentMatchB;
      zoomTutor   = tutorMatchA;
    }

    const tutorOk   = !zoomTutor   || zoomTutor.id   === s.tutor_id;
    const studentOk = !zoomStudent || zoomStudent.id  === s.student_id;

    if (tutorOk && studentOk) {
      correct.push(1);
      continue;
    }

    let kind: 'tutor' | 'student' | 'both' = 'tutor';
    if (!tutorOk && !studentOk) kind = 'both';
    else if (!studentOk) kind = 'student';

    mismatches.push({ session: s, topic: topic as string, dbTutor, dbStudent, zoomTutor, zoomStudent, mismatchKind: kind });
  }

  // ── Dedup: same underlying tutor error repeated across many sessions ──────────
  // Group mismatches by (dbTutorId, dbStudentId, zoomTutorId, zoomStudentId)
  const groupKey = (m: Mismatch) =>
    `${m.dbTutor.id}|${m.dbStudent.id}|${m.zoomTutor?.id ?? '?'}|${m.zoomStudent?.id ?? '?'}`;

  const grouped = new Map<string, Mismatch[]>();
  for (const m of mismatches) {
    const k = groupKey(m);
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(m);
  }

  // ── PLAN SUMMARY ──────────────────────────────────────────────────────────────
  console.log(`${HR2}`);
  console.log('  RESULTS SUMMARY');
  console.log(HR2);
  console.log(`  Verified correct:    ${correct.length}`);
  console.log(`  Mismatches found:    ${mismatches.length} sessions in ${grouped.size} unique groups`);
  console.log(`  Cannot verify (404): ${cannotVerify.length}`);
  console.log(`  No name in topic:    ${noInfo.length}`);

  if (grouped.size === 0) {
    console.log('\n  ✓ No mismatches — all verifiable assignments match Zoom.\n');
    return;
  }

  // ── Per-group correction plan ─────────────────────────────────────────────────
  console.log(`\n${HR2}`);
  console.log('  CORRECTION PLAN');
  console.log(HR2);

  // Collect all actions to apply
  const sessionUpdates:   Array<{ sessionId: string; newTutorId: string }> = [];
  const contractsToVoid:  Array<{ tutorId: string; studentId: string; tutorName: string; studentName: string }> = [];
  const contractsToCreate: Array<{ tutorId: string; studentId: string; tutorName: string; studentName: string }> = [];

  for (const [, group] of grouped) {
    const m = group[0]; // representative
    console.log(`\n${HR}`);
    console.log(`  Student:       ${m.dbStudent.name}`);
    console.log(`  DB tutor:      ${m.dbTutor.name}`);
    console.log(`  Zoom tutor:    ${m.zoomTutor?.name ?? '(could not identify)'}`);
    if (m.mismatchKind === 'both') {
      console.log(`  DB student:    ${m.dbStudent.name}`);
      console.log(`  Zoom student:  ${m.zoomStudent?.name ?? '(could not identify)'}`);
    }
    console.log(`  Mismatch type: ${m.mismatchKind}`);
    console.log(`  Example topic: "${m.topic}"`);
    console.log(`  Sessions affected: ${group.length}`);
    for (const s of group) {
      console.log(`    - ${s.session.id} | ${fmtDate(s.session.scheduled_at)} | status: ${s.session.status}`);
    }

    // Contract analysis
    const correctTutorId = m.zoomTutor?.id;
    const studentId      = m.dbStudent.id;

    if (correctTutorId) {
      const hasCorrectContract = contracts.some(
        c => c.tutor_id === correctTutorId && c.student_id === studentId && c.status === 'signed'
      );
      const hasWrongContract = contracts.some(
        c => c.tutor_id === m.dbTutor.id && c.student_id === studentId && c.status === 'signed'
      );

      console.log(`\n  Contract analysis:`);
      console.log(`    Current (wrong) contract ${m.dbTutor.name} → ${m.dbStudent.name}: ${hasWrongContract ? 'EXISTS → will void' : 'not found'}`);
      console.log(`    Correct contract ${m.zoomTutor!.name} → ${m.dbStudent.name}: ${hasCorrectContract ? 'already exists ✓' : 'MISSING → will create'}`);

      console.log(`\n  Actions:`);
      console.log(`    1. Update ${group.length} session(s): tutor_id → ${m.zoomTutor!.name} (${correctTutorId})`);
      if (hasWrongContract) {
        console.log(`    2. Void contract: ${m.dbTutor.name} → ${m.dbStudent.name}`);
      }
      if (!hasCorrectContract) {
        console.log(`    ${hasWrongContract ? 3 : 2}. Create signed contract: ${m.zoomTutor!.name} → ${m.dbStudent.name}`);
      }

      for (const s of group) {
        sessionUpdates.push({ sessionId: s.session.id, newTutorId: correctTutorId });
      }
      if (hasWrongContract) {
        contractsToVoid.push({
          tutorId: m.dbTutor.id, studentId,
          tutorName: m.dbTutor.name, studentName: m.dbStudent.name,
        });
      }
      if (!hasCorrectContract) {
        contractsToCreate.push({
          tutorId: correctTutorId, studentId,
          tutorName: m.zoomTutor!.name, studentName: m.dbStudent.name,
        });
      }
    } else {
      console.log(`\n  ⚠ Cannot identify the correct tutor from the topic — manual review required.`);
    }
  }

  // ── Adam Needleman highlight ──────────────────────────────────────────────────
  console.log(`\n${HR2}`);
  console.log('  ADAM NEEDLEMAN — SPECIFIC CHECK');
  console.log(HR2);

  const adamStudent = students.find(s => norm(s.name).includes('adam') && norm(s.name).includes('needleman'));
  if (adamStudent) {
    const adamSessions = sessions.filter(s => s.student_id === adamStudent.id);
    console.log(`  Adam Needleman id: ${adamStudent.id}`);
    console.log(`  Sessions with zoom_meeting_id: ${adamSessions.length}`);
    for (const s of adamSessions) {
      const topic = topicMap.get(s.zoom_meeting_id);
      const tutor = tutorById.get(s.tutor_id);
      console.log(`    ${fmtDate(s.scheduled_at)} | meeting ${s.zoom_meeting_id}`);
      console.log(`      DB tutor: ${tutor?.name ?? '?'}`);
      console.log(`      Zoom topic: "${topic ?? '(expired)'}"`);
      const inMismatches = mismatches.find(m => m.session.id === s.id);
      console.log(`      Mismatch: ${inMismatches ? `YES — ${inMismatches.mismatchKind}` : 'none detected'}`);
    }
  } else {
    console.log('  Adam Needleman not found in students table.');
  }

  // ── Cannot verify ─────────────────────────────────────────────────────────────
  if (cannotVerify.length > 0) {
    console.log(`\n${HR2}`);
    console.log('  CANNOT VERIFY (Zoom meeting expired/not found)');
    console.log(HR2);
    console.log(`  ${cannotVerify.length} sessions — sorted by date:\n`);
    const sorted = [...cannotVerify].sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );
    // Group by student
    const byStudent = new Map<string, typeof sorted>();
    for (const s of sorted) {
      if (!byStudent.has(s.student_id)) byStudent.set(s.student_id, []);
      byStudent.get(s.student_id)!.push(s);
    }
    for (const [sid, ss] of byStudent) {
      const st = studentById.get(sid);
      const t  = tutorById.get(ss[0].tutor_id);
      console.log(`  ${st?.name ?? sid} (tutor: ${t?.name ?? ss[0].tutor_id}) — ${ss.length} session(s)`);
    }
  }

  // ── No-name topics ────────────────────────────────────────────────────────────
  if (noInfo.length > 0) {
    const byStudent = new Map<string, number>();
    for (const s of noInfo) byStudent.set(s.student_id, (byStudent.get(s.student_id) ?? 0) + 1);
    console.log(`\n${HR2}`);
    console.log('  NEEDS MANUAL REVIEW (topic has no names — "StudyCore Tutoring Session" etc.)');
    console.log(HR2);
    for (const [sid, count] of byStudent) {
      const st = studentById.get(sid);
      console.log(`  ${st?.name ?? sid}: ${count} session(s) with generic topic`);
    }
  }

  if (DRY_RUN) {
    console.log(`\n${HR2}`);
    console.log(`  *** DRY RUN — run with --live to apply ${sessionUpdates.length} session updates, ` +
      `${contractsToVoid.length} contract voids, ${contractsToCreate.length} contract creates ***`);
    console.log(`${HR2}\n`);
    return;
  }

  // ── APPLY ─────────────────────────────────────────────────────────────────────
  console.log(`\n${HR}`);
  console.log('  APPLYING FIXES');
  console.log(HR);

  let sessUpdated = 0, sessErrors = 0;
  let contractsVoided = 0, contractsCreated = 0;

  // 1. Update sessions
  for (const u of sessionUpdates) {
    const { error } = await supabase.from('sessions')
      .update({ tutor_id: u.newTutorId })
      .eq('id', u.sessionId);
    if (error) { console.error(`  ✗ session ${u.sessionId}: ${error.message}`); sessErrors++; }
    else sessUpdated++;
  }
  console.log(`  Sessions updated: ${sessUpdated} (errors: ${sessErrors})`);

  // 2. Void contracts
  for (const c of contractsToVoid) {
    const { error } = await supabase.from('contracts')
      .update({ status: 'voided' })
      .eq('tutor_id', c.tutorId)
      .eq('student_id', c.studentId)
      .eq('status', 'signed');
    if (error) console.error(`  ✗ void contract ${c.tutorName} → ${c.studentName}: ${error.message}`);
    else { contractsVoided++; console.log(`  ✓ Voided contract: ${c.tutorName} → ${c.studentName}`); }
  }

  // 3. Create correct contracts
  for (const c of contractsToCreate) {
    const { error } = await supabase.from('contracts').insert({
      tutor_id:   c.tutorId,
      student_id: c.studentId,
      status:     'signed',
      signed_at:  new Date().toISOString(),
    });
    if (error) console.error(`  ✗ create contract ${c.tutorName} → ${c.studentName}: ${error.message}`);
    else { contractsCreated++; console.log(`  ✓ Created contract: ${c.tutorName} → ${c.studentName}`); }
  }

  console.log(`\n${HR2}`);
  console.log('  DONE');
  console.log(HR2);
  console.log(`  Sessions updated:   ${sessUpdated}`);
  console.log(`  Contracts voided:   ${contractsVoided}`);
  console.log(`  Contracts created:  ${contractsCreated}`);
  console.log(`\n${HR2}\n`);
}

main().catch(err => {
  console.error('\nFatal:', (err as Error).message ?? err);
  process.exit(1);
});
