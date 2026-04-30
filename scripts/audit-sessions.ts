/**
 * Comprehensive future-session audit.
 * Reports only — no writes.
 *
 * Usage:  npx ts-node --project tsconfig.json scripts/audit-sessions.ts
 *
 * Checks:
 *   1. Day-of-week mismatch   — session day not in student_availability
 *   2. Tutor double-booking   — tutor has overlapping session at same time
 *   3. Student double-booking — student has overlapping session at same time
 *   4. Missing Zoom link      — scheduled session has no zoom_meeting_id
 *   5. Missing tutor          — session has null tutor_id
 *   6. Hours over-budget      — student's upcoming sessions exceed remaining hours
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── helpers ───────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function dowInTz(utcIso: string, tz: string): number {
  const d    = new Date(utcIso);
  const short = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d);
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(short);
}

function localDt(utcIso: string, tz: string): string {
  return new Date(utcIso).toLocaleString('en-US', {
    timeZone: tz,
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function endMs(scheduledAt: string, durationMinutes: number): number {
  return new Date(scheduledAt).getTime() + durationMinutes * 60_000;
}

function overlaps(
  aStart: string, aDur: number,
  bStart: string, bDur: number,
): boolean {
  const aS = new Date(aStart).getTime();
  const aE = aS + aDur * 60_000;
  const bS = new Date(bStart).getTime();
  const bE = bS + bDur * 60_000;
  return aS < bE && aE > bS;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const now = new Date().toISOString();

  // ── Fetch all future scheduled sessions ───────────────────────────────────
  const { data: sessions, error: sessErr } = await supabase
    .from('sessions')
    .select(`
      id, scheduled_at, duration_minutes, tutor_id, student_id,
      zoom_meeting_id,
      student:students(name, timezone, purchased_hours, used_hours),
      tutor:tutors(name)
    `)
    .eq('status', 'scheduled')
    .gte('scheduled_at', now)
    .order('scheduled_at');

  if (sessErr || !sessions) {
    console.error('Failed to fetch sessions:', sessErr);
    process.exit(1);
  }

  // ── Fetch student availability ─────────────────────────────────────────────
  const { data: avail } = await supabase
    .from('student_availability')
    .select('student_id, day_of_week')
    .eq('is_active', true);

  const availDows: Record<string, number[]> = {};
  for (const a of avail ?? []) {
    if (!availDows[a.student_id]) availDows[a.student_id] = [];
    if (!availDows[a.student_id].includes(a.day_of_week))
      availDows[a.student_id].push(a.day_of_week);
  }

  // ── Issue buckets ──────────────────────────────────────────────────────────
  type Issue = {
    sessionId:   string;
    studentName: string;
    tutorName:   string;
    datetime:    string;
    detail:      string;
  };

  const dowMismatches:      Issue[] = [];
  const tutorConflicts:     Issue[] = [];
  const studentConflicts:   Issue[] = [];
  const missingZoom:        Issue[] = [];
  const missingTutor:       Issue[] = [];

  // Helper to build an Issue record
  type Session = NonNullable<typeof sessions>[0];
  function issue(s: Session, detail: string): Issue {
    const student = (s as any).student;
    const tutor   = (s as any).tutor;
    const tz      = student?.timezone ?? 'America/New_York';
    return {
      sessionId:   shortId(s.id),
      studentName: student?.name ?? s.student_id,
      tutorName:   tutor?.name   ?? (s.tutor_id ? shortId(s.tutor_id) : '—'),
      datetime:    localDt(s.scheduled_at, tz),
      detail,
    };
  }

  // Track pairs already reported to avoid duplicate conflict rows
  const reportedTutorPairs  = new Set<string>();
  const reportedStudentPairs = new Set<string>();

  for (let i = 0; i < sessions.length; i++) {
    const s      = sessions[i];
    const student = (s as any).student;
    const tz      = student?.timezone ?? 'America/New_York';

    // ── 1. Day-of-week mismatch ──────────────────────────────────────────────
    const dows = availDows[s.student_id];
    if (dows && dows.length > 0) {
      const sessionDow = dowInTz(s.scheduled_at, tz);
      if (!dows.includes(sessionDow)) {
        dowMismatches.push(issue(s,
          `Booked ${DAY_NAMES[sessionDow]}, avail: ${dows.map(d => DAY_NAMES[d]).join(', ')}`,
        ));
      }
    }

    // ── 2. Missing tutor ────────────────────────────────────────────────────
    if (!s.tutor_id) {
      missingTutor.push(issue(s, 'tutor_id is null'));
      continue; // skip conflict checks — no tutor to compare
    }

    // ── 3. Missing Zoom ─────────────────────────────────────────────────────
    if (!s.zoom_meeting_id) {
      missingZoom.push(issue(s, 'No Zoom meeting ID'));
    }

    // ── 4 & 5. Overlap checks (compare against all other future sessions) ───
    for (let j = i + 1; j < sessions.length; j++) {
      const t = sessions[j];
      if (!overlaps(s.scheduled_at, s.duration_minutes, t.scheduled_at, t.duration_minutes))
        continue;

      // Tutor double-booking
      if (s.tutor_id && t.tutor_id && s.tutor_id === t.tutor_id) {
        const pairKey = [s.id, t.id].sort().join('|');
        if (!reportedTutorPairs.has(pairKey)) {
          reportedTutorPairs.add(pairKey);
          const tStudent = (t as any).student;
          const tTz      = tStudent?.timezone ?? 'America/New_York';
          tutorConflicts.push({
            sessionId:   `${shortId(s.id)} + ${shortId(t.id)}`,
            studentName: `${((s as any).student)?.name} & ${tStudent?.name}`,
            tutorName:   ((s as any).tutor)?.name ?? '—',
            datetime:    localDt(s.scheduled_at, tTz),
            detail:      `Both sessions overlap (${s.duration_minutes}min vs ${t.duration_minutes}min)`,
          });
        }
      }

      // Student double-booking
      if (s.student_id === t.student_id) {
        const pairKey = [s.id, t.id].sort().join('|');
        if (!reportedStudentPairs.has(pairKey)) {
          reportedStudentPairs.add(pairKey);
          studentConflicts.push(issue(s,
            `Overlaps with session ${shortId(t.id)} at ${localDt(t.scheduled_at, tz)}`,
          ));
        }
      }
    }
  }

  // ── 6. Hours over-budget ──────────────────────────────────────────────────
  type HoursBudget = {
    studentName:    string;
    purchased:      number;
    used:           number;
    remaining:      number;
    scheduledHours: number;
    overBy:         number;
  };
  const hoursBudget: HoursBudget[] = [];

  const minutesByStudent: Record<string, number> = {};
  for (const s of sessions) {
    minutesByStudent[s.student_id] = (minutesByStudent[s.student_id] ?? 0) + (s.duration_minutes ?? 60);
  }

  const seenStudents = new Set<string>();
  for (const s of sessions) {
    if (seenStudents.has(s.student_id)) continue;
    seenStudents.add(s.student_id);

    const student = (s as any).student;
    const purchased = student?.purchased_hours ?? 0;
    const used      = student?.used_hours      ?? 0;
    const remaining = purchased - used;
    const scheduledHours = (minutesByStudent[s.student_id] ?? 0) / 60;

    if (scheduledHours > remaining) {
      hoursBudget.push({
        studentName:    student?.name ?? s.student_id,
        purchased,
        used,
        remaining: Math.round(remaining * 10) / 10,
        scheduledHours: Math.round(scheduledHours * 10) / 10,
        overBy: Math.round((scheduledHours - remaining) * 10) / 10,
      });
    }
  }

  // ── Print report ──────────────────────────────────────────────────────────

  const LINE = '═'.repeat(90);
  const line = '─'.repeat(90);

  function printTable(title: string, items: Issue[]) {
    console.log(`\n${LINE}`);
    console.log(`  ${title.toUpperCase()}  (${items.length} issue${items.length !== 1 ? 's' : ''})`);
    console.log(LINE);
    if (items.length === 0) {
      console.log('  ✅  None');
      return;
    }
    console.log(
      `  ${pad('SESSION',9)}  ${pad('STUDENT',22)}  ${pad('TUTOR',22)}  ${pad('DATE/TIME',30)}  ISSUE`,
    );
    console.log(`  ${line}`);
    for (const item of items) {
      console.log(
        `  ${pad(item.sessionId,9)}  ${pad(item.studentName,22)}  ${pad(item.tutorName,22)}  ${pad(item.datetime,30)}  ${item.detail}`,
      );
    }
  }

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`  STUDYCORE — FUTURE SESSION AUDIT   (as of ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET)`);
  console.log(`  Checking ${sessions.length} upcoming scheduled session(s)`);
  console.log(`${'═'.repeat(90)}`);

  printTable('1. Day-of-week mismatches', dowMismatches);
  printTable('2. Tutor double-bookings',  tutorConflicts);
  printTable('3. Student double-bookings', studentConflicts);
  printTable('4. Missing Zoom meeting ID', missingZoom);
  printTable('5. Missing tutor assignment', missingTutor);

  // Hours budget table (different shape)
  console.log(`\n${LINE}`);
  console.log(`  6. HOURS OVER-BUDGET  (${hoursBudget.length} student${hoursBudget.length !== 1 ? 's' : ''})`);
  console.log(LINE);
  if (hoursBudget.length === 0) {
    console.log('  ✅  None');
  } else {
    console.log(`  ${pad('STUDENT',24)}  ${pad('PURCHASED',10)}  ${pad('USED',6)}  ${pad('REMAINING',10)}  ${pad('SCHED',6)}  OVER BY`);
    console.log(`  ${line}`);
    for (const b of hoursBudget) {
      console.log(
        `  ${pad(b.studentName,24)}  ${pad(b.purchased + ' hrs',10)}  ${pad(b.used + ' hrs',6)}  ${pad(b.remaining + ' hrs',10)}  ${pad(b.scheduledHours + ' hrs',6)}  ${b.overBy} hrs`,
      );
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalIssues =
    dowMismatches.length + tutorConflicts.length + studentConflicts.length +
    missingZoom.length + missingTutor.length + hoursBudget.length;

  console.log(`\n${LINE}`);
  console.log('  SUMMARY');
  console.log(LINE);
  console.log(`  Sessions audited:             ${sessions.length}`);
  console.log(`  1. Day-of-week mismatches:    ${dowMismatches.length}`);
  console.log(`  2. Tutor double-bookings:     ${tutorConflicts.length}`);
  console.log(`  3. Student double-bookings:   ${studentConflicts.length}`);
  console.log(`  4. Missing Zoom links:        ${missingZoom.length}`);
  console.log(`  5. Missing tutor:             ${missingTutor.length}`);
  console.log(`  6. Hours over-budget:         ${hoursBudget.length}`);
  console.log(`  ──────────────────────────────────`);
  console.log(`  Total issues:                 ${totalIssues}`);
  console.log(`\n  Run with no flags — read-only, nothing was changed.\n`);
}

main().catch(console.error);
