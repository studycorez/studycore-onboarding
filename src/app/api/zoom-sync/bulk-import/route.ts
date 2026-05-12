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
  // Normalize apostrophe variants
  let t = topic
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g, "'")
    .trim();

  // Take everything before the first possessive 's
  // "Zara Ali's Study Core's Zoom Meeting" → "Zara Ali"
  // "Kathryn's Study Core's Zoom Meeting"  → "Kathryn"
  // "Adam Hamid's StudyCore SAT Session"   → "Adam Hamid"
  t = t.replace(/'s\b.*/i, '').trim();

  // Strip from delimiter onwards
  t = t.replace(/\s*(&|–|-)\s.*/i, '').trim();
  t = t.replace(/\bwith\b.*/i, '').trim();

  // Strip trailing noise words
  t = t.replace(NOISE_WORDS_RE, '').trim();

  const firstWord = t.split(/\s+/)[0] ?? '';
  if (!firstWord || SKIP_FIRST_WORDS.has(firstWord.toLowerCase())) return '';

  return t;
}

// ── Student matching ─────────────────────────────────────────────────────────

interface Student { id: string; name: string }

function normName(s: string): string {
  return s.replace(/[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g, "'")
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function matchStudentByName(extracted: string, students: Student[]): Student | null {
  const n = normName(extracted);
  if (!n) return null;

  // 1. Exact full name
  const exact = students.find(s => normName(s.name) === n);
  if (exact) return exact;

  // 2. Extracted name is a complete word-token subset of student name (or vice versa)
  const contains = students.find(s => {
    const sn = normName(s.name);
    const snTokens = sn.split(' ');
    return snTokens.includes(n) || n.includes(sn);
  });
  if (contains) return contains;

  // 3. First + partial last name
  const parts = n.split(' ');
  const first = parts[0];
  const partialLast = parts.slice(1).join(' ');
  if (partialLast) {
    const partial = students.find(s => {
      const sp = normName(s.name).split(' ');
      return sp[0] === first && sp.slice(1).join(' ').startsWith(partialLast);
    });
    if (partial) return partial;
  }

  // 4. First name only — unambiguous
  const firstOnly = students.filter(s => normName(s.name).split(' ')[0] === first);
  if (firstOnly.length === 1) return firstOnly[0];

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

      // Filter: too short
      if (duration < 10) {
        previewItems.push({
          meetingId: m.meetingId, topic, startTime: m.startTime, duration,
          extractedName: '', studentId: null, studentName: null,
          willImport: false, skipReason: 'too short (< 10 min)',
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

      // Extract name and match student
      const extractedName = extractStudentName(topic);
      const student = extractedName ? matchStudentByName(extractedName, studentList) : null;

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
