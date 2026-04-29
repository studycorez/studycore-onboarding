import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// EST = UTC-5 (fixed offset, no DST — matches the prompt spec)
const EST_OFFSET_HOURS = -5;

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// Round minutes down to nearest 30 for bucketing (so 18:07 and 18:22 land in the same bucket)
function bucketMins(totalMins: number): number {
  return Math.floor(totalMins / 30) * 30;
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function formatSlot(dow: number, startMins: number): string {
  const h = Math.floor(startMins / 60) % 24;
  const m = startMins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${DAY_NAMES[dow]} ${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

interface SessionRow {
  student_id: string;
  scheduled_at: string;
  duration_minutes: number | null;
}

interface StudentRow {
  id: string;
  name: string;
}

interface InferredSlot {
  day_of_week: number;
  start_time: string;   // HH:MM (start of 30-min bucket)
  end_time: string;     // HH:MM (start + 90 min, capped sensibly)
  count: number;        // how many sessions matched this bucket
  label: string;        // human-readable
}

interface StudentResult {
  student: StudentRow;
  totalSessions: number;
  skippedReason?: string;
  inferred: InferredSlot[];
}

async function main() {
  const DRY_RUN = !process.argv.includes('--write');

  console.log(`\n${'═'.repeat(70)}`);
  console.log('  StudyCore — Infer Student Availability from Session History');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (pass --write to insert)' : '⚠️  WRITE MODE'}`);
  console.log(`${'═'.repeat(70)}\n`);

  // ── 1. Fetch all real past sessions (zoom_meeting_id not null) ─────────────
  const { data: sessions, error: sessErr } = await supabase
    .from('sessions')
    .select('student_id, scheduled_at, duration_minutes')
    .not('zoom_meeting_id', 'is', null)
    .lt('scheduled_at', new Date().toISOString())
    .order('scheduled_at');

  if (sessErr || !sessions) {
    console.error('Failed to fetch sessions:', sessErr?.message);
    process.exit(1);
  }

  // ── 2. Fetch all students ─────────────────────────────────────────────────
  const { data: students, error: studErr } = await supabase
    .from('students')
    .select('id, name')
    .order('name');

  if (studErr || !students) {
    console.error('Failed to fetch students:', studErr?.message);
    process.exit(1);
  }

  // ── 3. Fetch existing availability (we skip students who already have it) ──
  const { data: existingAvail } = await supabase
    .from('student_availability')
    .select('student_id')
    .eq('is_active', true);

  const studentsWithAvail = new Set((existingAvail ?? []).map(r => r.student_id));

  // ── 4. Group sessions by student ──────────────────────────────────────────
  const byStudent = new Map<string, SessionRow[]>();
  for (const s of sessions as SessionRow[]) {
    if (!byStudent.has(s.student_id)) byStudent.set(s.student_id, []);
    byStudent.get(s.student_id)!.push(s);
  }

  // ── 5. Infer recurring slots per student ──────────────────────────────────
  const results: StudentResult[] = [];

  for (const student of students as StudentRow[]) {
    const studentSessions = byStudent.get(student.id) ?? [];
    const totalSessions = studentSessions.length;

    if (studentsWithAvail.has(student.id)) {
      results.push({ student, totalSessions, skippedReason: 'already has availability', inferred: [] });
      continue;
    }

    if (totalSessions === 0) {
      results.push({ student, totalSessions, skippedReason: 'no Zoom sessions found', inferred: [] });
      continue;
    }

    // Bucket: key = "dow:bucketStartMins" → count
    const buckets = new Map<string, number>();
    for (const s of studentSessions) {
      const utcDate = new Date(s.scheduled_at);
      const estMs = utcDate.getTime() + EST_OFFSET_HOURS * 60 * 60 * 1000;
      const estDate = new Date(estMs);
      const dow = estDate.getUTCDay();
      const totalMins = estDate.getUTCHours() * 60 + estDate.getUTCMinutes();
      const bucket = bucketMins(totalMins);
      const key = `${dow}:${bucket}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    // Keep only buckets with 2+ sessions (recurring pattern)
    const inferred: InferredSlot[] = [];
    for (const [key, count] of Array.from(buckets.entries())) {
      if (count < 2) continue;
      const [dowStr, bucketStr] = key.split(':');
      const dow = parseInt(dowStr, 10);
      const startMins = parseInt(bucketStr, 10);
      // Session window: start of bucket → start + 90 min (covers 60 or 90-min sessions)
      const endMins = startMins + 90;
      inferred.push({
        day_of_week: dow,
        start_time: minsToTime(startMins),
        end_time: minsToTime(endMins),
        count,
        label: formatSlot(dow, startMins),
      });
    }

    // Sort by day then time
    inferred.sort((a, b) => a.day_of_week !== b.day_of_week
      ? a.day_of_week - b.day_of_week
      : a.start_time.localeCompare(b.start_time));

    results.push({ student, totalSessions, inferred });
  }

  // ── 6. Print summary ──────────────────────────────────────────────────────
  let toWrite = 0;
  let toSkip = 0;

  for (const r of results) {
    if (r.skippedReason) {
      console.log(`  SKIP  ${r.student.name} — ${r.skippedReason}`);
      toSkip++;
      continue;
    }
    if (r.inferred.length === 0) {
      console.log(`  SKIP  ${r.student.name} — ${r.totalSessions} session${r.totalSessions !== 1 ? 's' : ''} but no recurring pattern (need 2+ on same day/time)`);
      toSkip++;
      continue;
    }
    const slots = r.inferred.map(s => `${s.label} (${s.count}×)`).join(', ');
    console.log(`  INFER ${r.student.name} — ${r.totalSessions} sessions → ${slots}`);
    toWrite++;
  }

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  Students with inferred availability : ${toWrite}`);
  console.log(`  Students skipped                    : ${toSkip}`);
  console.log(`${'─'.repeat(70)}\n`);

  if (DRY_RUN) {
    console.log('  Dry run complete. Re-run with --write to insert availability.\n');
    return;
  }

  // ── 7. Write ──────────────────────────────────────────────────────────────
  console.log('  Writing availability…\n');
  let inserted = 0;
  let failed = 0;

  for (const r of results) {
    if (r.skippedReason || r.inferred.length === 0) continue;
    const rows = r.inferred.map(s => ({
      student_id:  r.student.id,
      day_of_week: s.day_of_week,
      start_time:  s.start_time,
      end_time:    s.end_time,
      is_active:   true,
    }));
    const { error } = await supabase.from('student_availability').insert(rows);
    if (error) {
      console.log(`  ✗ ${r.student.name}: ${error.message}`);
      failed++;
    } else {
      console.log(`  ✓ ${r.student.name}: inserted ${rows.length} slot${rows.length !== 1 ? 's' : ''}`);
      inserted += rows.length;
    }
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  Done. ${inserted} slot${inserted !== 1 ? 's' : ''} inserted. ${failed} failed.`);
  console.log(`${'═'.repeat(70)}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
