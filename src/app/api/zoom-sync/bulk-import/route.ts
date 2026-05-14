import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Internal-call filter ──────────────────────────────────────────────────────

const INTERNAL_KEYWORDS = [
  'interview', 'training', 'team meeting', 'setter', 'sales',
  'onboarding', 'closer', 'cen',
];

function isInternal(topic: string): boolean {
  const t = topic.toLowerCase();
  return INTERNAL_KEYWORDS.some(kw => t.includes(kw));
}

// ── Name extraction ───────────────────────────────────────────────────────────

const SKIP_FIRST_WORDS = new Set(['studycore', 'study', 'interview', 'zoom', 'sat', 'act']);
const NOISE_WORDS_RE = /\b(sat|act|prep|session|tutoring|class|review|practice|test|math|reading|writing|studycore|study|zoom|core)\b.*/i;

function extractStudentName(topic: string): string {
  let t = topic
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g, "'")
    .trim();

  // Take everything before the first possessive 's:
  // "Zara Ali's Study Core's Zoom Meeting" → "Zara Ali"
  // "Pierre's SAT Session"                 → "Pierre"
  t = t.replace(/'s\b.*/i, '').trim();

  // Strip from delimiter onwards
  t = t.replace(/\s*(&|–|-)\s.*/i, '').trim();
  t = t.replace(/\bwith\b.*/i, '').trim();

  // Strip trailing noise words
  t = t.replace(NOISE_WORDS_RE, '').trim();

  // Strip trailing apostrophes and other trailing punctuation:
  // "Pierre'" → "Pierre", "Nicholas'" → "Nicholas"
  t = t.replace(/[''`'´\u2018\u2019\u02BC\u0060\u00B4\u2032.,;:!?]+$/, '').trim();

  const firstWord = t.split(/\s+/)[0] ?? '';
  if (!firstWord || SKIP_FIRST_WORDS.has(firstWord.toLowerCase())) return '';

  return t;
}

// ── Student matching ──────────────────────────────────────────────────────────

interface Student { id: string; name: string }

function normStr(s: string): string {
  return s
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Returns all students that plausibly match `token` (a single cleaned name fragment).
 *
 * Two modes based on token length:
 *
 * Short token (≤4 chars, e.g. "Eli"):
 *   Only match students whose FIRST NAME STARTS WITH the token.
 *   Prevents "Eli" from matching via a mid-string hit on "Elizabeth" while still
 *   matching "Elijah". Tiebreak by most-recent session resolves ambiguous cases.
 *
 * Long token (>4 chars, e.g. "Pierre", "Susanne", "Abisola"):
 *   Tier 1 — student name CONTAINS token  ("Pierre" → "Pierre DeFelice", "Abi" → "Abisola")
 *   Tier 2 — shared prefix ≥6 chars with student first name
 *             ("Susanne" → "Susannah" via shared "Susann"; 6-char bar prevents
 *              false positives like "susanne" catching "ann" via reverse-substring)
 *
 * Tier 3 (token contains student first name) is intentionally omitted — it caused
 * "susanne".includes("ann") → "Ann Sherman" false matches.
 */
function candidatesForToken(token: string, students: Student[]): Student[] {
  if (token.length < 3) return [];
  const results: Student[] = [];

  for (const s of students) {
    const sn  = normStr(s.name);
    const sFn = sn.split(' ')[0]; // student first name

    if (token.length <= 4) {
      // Short token: only accept students whose first name starts with it
      if (sFn.startsWith(token)) results.push(s);
    } else {
      // Long token — Tier 1: student name contains the full token
      if (sn.includes(token)) {
        results.push(s);
        continue;
      }
      // Tier 2: shared prefix ≥6 chars between token and student first name
      // (raised from 4 to fix "susanne" → "ann sherman" via "susanne".includes("ann"))
      if (sFn.length >= 6) {
        const prefixLen = Math.min(token.length, sFn.length);
        if (prefixLen >= 6 && token.slice(0, prefixLen) === sFn.slice(0, prefixLen)) {
          results.push(s);
        }
      }
    }
  }

  return results;
}

/**
 * Given multiple student candidates, return the one with the most recent session.
 * Falls back to first candidate if no sessions exist for any.
 */
async function pickMostRecent(candidates: Student[]): Promise<Student> {
  if (candidates.length === 1) return candidates[0];

  const ids = candidates.map(c => c.id);
  const { data } = await supabase
    .from('sessions')
    .select('student_id, scheduled_at')
    .in('student_id', ids)
    .order('scheduled_at', { ascending: false })
    .limit(ids.length * 5); // fetch a few per student

  if (!data || data.length === 0) return candidates[0];

  // Find which candidate has the latest session
  const latestByStudent = new Map<string, string>();
  for (const row of data) {
    if (!latestByStudent.has(row.student_id)) {
      latestByStudent.set(row.student_id, row.scheduled_at);
    }
  }

  let best = candidates[0];
  let bestTs = latestByStudent.get(best.id) ?? '';
  for (const c of candidates.slice(1)) {
    const ts = latestByStudent.get(c.id) ?? '';
    if (ts > bestTs) { best = c; bestTs = ts; }
  }
  return best;
}

/**
 * Fuzzy-match an extracted name string against the student list.
 *
 * Strategy — try tokens in priority order, accumulate candidates per tier:
 *   1. Full extracted name (e.g. "Zara Ali")
 *   2. First word  (e.g. "Zara")
 *   3. Last word   (e.g. "Ali")
 *
 * For each token, use candidatesForToken (substring + prefix + reverse-contains).
 * If exactly one candidate, return it. If multiple, tiebreak by most recent session.
 */
async function matchStudentByName(extracted: string, students: Student[]): Promise<Student | null> {
  const n = normStr(extracted);
  if (!n) return null;

  const parts = n.split(' ');
  const tokens: string[] = [n];
  if (parts.length > 1) {
    tokens.push(parts[0]);                   // first word
    tokens.push(parts[parts.length - 1]);    // last word
  }

  for (const token of tokens) {
    if (token.length < 3) continue;
    const candidates = candidatesForToken(token, students);
    if (candidates.length === 0) continue;
    return await pickMostRecent(candidates);
  }

  return null;
}

// ── Tutor-meeting detection ───────────────────────────────────────────────────

interface Tutor { id: string; name: string }

/**
 * Returns true if the extracted name matches any tutor in the DB.
 * Uses the same candidatesForToken logic so "Joseph" catches "Joseph Valenti" etc.
 */
function isTutorMeeting(extracted: string, tutors: Tutor[]): boolean {
  if (!extracted) return false;
  const token = normStr(extracted).split(' ')[0]; // use first word only for speed
  if (token.length < 3) return false;
  return tutors.some(t => {
    const tn  = normStr(t.name);
    const tFn = tn.split(' ')[0];
    if (token.length <= 4) return tFn.startsWith(token);
    return tn.includes(token) || (tFn.length >= 6 && tFn.startsWith(token.slice(0, Math.min(token.length, tFn.length))));
  });
}

// ── Tutor resolution (same cascade as auto-match) ────────────────────────────

async function resolveTutorId(studentId: string): Promise<string | null> {
  const { data: signed } = await supabase
    .from('contracts').select('tutor_id')
    .eq('student_id', studentId).eq('status', 'signed')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (signed?.tutor_id) return signed.tutor_id;

  const { data: session } = await supabase
    .from('sessions').select('tutor_id')
    .eq('student_id', studentId).not('tutor_id', 'is', null)
    .order('scheduled_at', { ascending: false }).limit(1).maybeSingle();
  if (session?.tutor_id) return session.tutor_id;

  const { data: anyContract } = await supabase
    .from('contracts').select('tutor_id')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (anyContract?.tutor_id) return anyContract.tutor_id;

  return null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImportPreviewItem {
  meetingId: string;
  topic: string;
  startTime: string;
  duration: number;
  extractedName: string;
  studentId: string | null;
  studentName: string | null;
  willImport: boolean;
  skipReason: string | null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (process.env.IMPORT_LOCKED === 'true') {
    return NextResponse.json(
      { error: 'Zoom import locked: duplicate-session investigation in progress. Contact an admin to re-enable.' },
      { status: 503 },
    );
  }

  try {
    const body = await req.json();
    const meetings: { meetingId: string; topic: string; startTime: string; duration: number }[] =
      body.meetings ?? [];
    const preview: boolean = body.preview === true;

    if (meetings.length === 0) {
      return NextResponse.json({ preview: [], created: 0, skipped: 0 });
    }

    // Load students and tutors once
    const [{ data: students }, { data: tutors }] = await Promise.all([
      supabase.from('students').select('id, name'),
      supabase.from('tutors').select('id, name'),
    ]);
    const studentList: Student[] = students ?? [];
    const tutorList:  Tutor[]   = tutors   ?? [];

    // Build preview
    const previewItems: ImportPreviewItem[] = [];
    for (const m of meetings) {
      const topic = m.topic ?? '';
      const duration = m.duration ?? 0;

      // Filter: too short (raised to 20 min to cut connection-test false positives)
      if (duration < 20) {
        previewItems.push({
          meetingId: m.meetingId, topic, startTime: m.startTime, duration,
          extractedName: '', studentId: null, studentName: null,
          willImport: false, skipReason: 'too short (< 20 min)',
        });
        continue;
      }

      // Filter: internal call
      if (isInternal(topic)) {
        previewItems.push({
          meetingId: m.meetingId, topic, startTime: m.startTime, duration,
          extractedName: '', studentId: null, studentName: null,
          willImport: false, skipReason: 'internal call',
        });
        continue;
      }

      // Extract name
      const extractedName = extractStudentName(topic);

      // Skip if the extracted name matches a tutor (tutor-only meeting)
      if (extractedName && isTutorMeeting(extractedName, tutorList)) {
        previewItems.push({
          meetingId: m.meetingId, topic, startTime: m.startTime, duration,
          extractedName, studentId: null, studentName: null,
          willImport: false, skipReason: 'tutor meeting — skipped',
        });
        continue;
      }

      // Fuzzy-match student
      const student = extractedName
        ? await matchStudentByName(extractedName, studentList)
        : null;

      if (!student) {
        previewItems.push({
          meetingId: m.meetingId, topic, startTime: m.startTime, duration,
          extractedName: extractedName || '(none)',
          studentId: null, studentName: null,
          willImport: false, skipReason: 'no student match',
        });
        continue;
      }

      previewItems.push({
        meetingId: m.meetingId, topic, startTime: m.startTime, duration,
        extractedName,
        studentId: student.id, studentName: student.name,
        willImport: true, skipReason: null,
      });
    }

    if (preview) {
      return NextResponse.json({ preview: previewItems });
    }

    // ── Actual import ─────────────────────────────────────────────────────────
    let created = 0;
    let skipped = 0;
    const toImport = previewItems.filter(p => p.willImport);

    for (const item of toImport) {
      const tutorId = await resolveTutorId(item.studentId!);

      const { error } = await supabase.from('sessions').insert({
        student_id:       item.studentId,
        tutor_id:         tutorId,
        scheduled_at:     item.startTime,
        duration_minutes: item.duration || null,
        zoom_meeting_id:  item.meetingId,
        zoom_join_url:    null,
        status:           'completed',
        payment_status:   'pending',
      });

      if (error) {
        console.error(`[bulk-import] insert failed for ${item.meetingId}:`, error.message);
        skipped++;
      } else {
        created++;
      }
    }

    skipped += previewItems.filter(p => !p.willImport).length;

    return NextResponse.json({ preview: previewItems, created, skipped });
  } catch (err: any) {
    console.error('[bulk-import] error:', err);
    return NextResponse.json({ error: err.message ?? 'Bulk import failed' }, { status: 500 });
  }
}
