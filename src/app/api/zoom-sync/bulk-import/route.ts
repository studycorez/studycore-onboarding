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
 * Matching tiers (checked in order, all candidates collected):
 *  1. Substring: student name contains token  ("Abi" → "Abisola", "Pierre" → "Pierre DeFelice")
 *  2. Prefix (≥4 chars shared): handles alternate spellings ("Susanne" → "Susannah" via "Susa")
 *  3. Token contains student first name: catches abbreviations/short DB names
 */
function candidatesForToken(token: string, students: Student[]): Student[] {
  if (token.length < 3) return [];
  const results: Student[] = [];

  for (const s of students) {
    const sn = normStr(s.name);
    const sFn = sn.split(' ')[0]; // student first name

    // Tier 1: student name contains token
    if (sn.includes(token)) {
      results.push(s);
      continue;
    }

    // Tier 2: shared prefix of ≥4 chars between token and student's first name
    if (token.length >= 4 && sFn.length >= 4) {
      const prefixLen = Math.min(token.length, sFn.length);
      if (prefixLen >= 4 && token.slice(0, prefixLen) === sFn.slice(0, prefixLen)) {
        results.push(s);
        continue;
      }
    }

    // Tier 3: token contains student first name (≥3 chars)
    if (sFn.length >= 3 && token.includes(sFn)) {
      results.push(s);
      continue;
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
  try {
    const body = await req.json();
    const meetings: { meetingId: string; topic: string; startTime: string; duration: number }[] =
      body.meetings ?? [];
    const preview: boolean = body.preview === true;

    if (meetings.length === 0) {
      return NextResponse.json({ preview: [], created: 0, skipped: 0 });
    }

    // Load students once
    const { data: students } = await supabase.from('students').select('id, name');
    const studentList: Student[] = students ?? [];

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

      // Extract name and fuzzy-match student
      const extractedName = extractStudentName(topic);
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
