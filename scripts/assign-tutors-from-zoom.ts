/**
 * Assign tutors to students who have sessions with a zoom_meeting_id but no
 * signed contract (i.e. no tutor assigned in the system).
 *
 * NOTE: This codebase tracks tutor assignment via the `contracts` table
 * (status = 'signed').  A student "has a tutor" when they have at least one
 * signed contract.  This script:
 *
 *   1. Loads all students.
 *   2. Loads all sessions with zoom_meeting_id + tutor_id (completed or scheduled).
 *   3. Loads all signed contracts to know which students already have a tutor.
 *   4. For students with no signed contract, picks the tutor from their most
 *      recent zoom session and creates a signed contract.
 *   5. Prints a full report.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/assign-tutors-from-zoom.ts
 *   npx ts-node --project tsconfig.json scripts/assign-tutors-from-zoom.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudentRow {
  id: string;
  name: string;
}

interface SessionRow {
  id: string;
  student_id: string;
  tutor_id: string;
  scheduled_at: string;
  status: string;
  zoom_meeting_id: string;
  tutor: { id: string; name: string } | null;
}

interface ContractRow {
  student_id: string;
  tutor_id: string;
  tutor: { id: string; name: string } | null;
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchAllStudents(): Promise<StudentRow[]> {
  const { data, error } = await supabase
    .from('students')
    .select('id, name')
    .order('name');
  if (error) throw new Error(`Failed to fetch students: ${error.message}`);
  return (data ?? []) as StudentRow[];
}

async function fetchZoomSessions(): Promise<SessionRow[]> {
  const PAGE = 1000;
  const all: SessionRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, student_id, tutor_id, scheduled_at, status, zoom_meeting_id, tutor:tutors(id, name)')
      .not('zoom_meeting_id', 'is', null)
      .not('tutor_id', 'is', null)
      .in('status', ['completed', 'scheduled'])
      .order('scheduled_at', { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Failed to fetch sessions: ${error.message}`);
    const batch = ((data ?? []) as any[]).map((s: any) => ({
      ...s,
      tutor: Array.isArray(s.tutor) ? (s.tutor[0] ?? null) : s.tutor,
    })) as SessionRow[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

async function fetchSignedContracts(): Promise<ContractRow[]> {
  const { data, error } = await supabase
    .from('contracts')
    .select('student_id, tutor_id, tutor:tutors(id, name)')
    .eq('status', 'signed');
  if (error) throw new Error(`Failed to fetch contracts: ${error.message}`);
  return ((data ?? []) as any[]).map((c: any) => ({
    ...c,
    tutor: Array.isArray(c.tutor) ? (c.tutor[0] ?? null) : c.tutor,
  })) as ContractRow[];
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'─'.repeat(64)}`);
  console.log('  Assign Tutors from Zoom Sessions');
  if (DRY_RUN) console.log('  *** DRY RUN — no writes will be made ***');
  console.log(`${'─'.repeat(64)}\n`);

  console.log('Fetching students…');
  const students = await fetchAllStudents();
  console.log(`  ${students.length} students loaded.`);

  console.log('Fetching zoom sessions (completed + scheduled)…');
  const sessions = await fetchZoomSessions();
  console.log(`  ${sessions.length} sessions with zoom_meeting_id + tutor_id loaded.`);

  console.log('Fetching signed contracts…');
  const contracts = await fetchSignedContracts();
  console.log(`  ${contracts.length} signed contracts loaded.\n`);

  // Build lookup: student_id → set of tutor_ids from signed contracts
  const contractedStudents = new Set(contracts.map(c => c.student_id));

  // Group sessions by student_id (already desc by scheduled_at → [0] = most recent)
  const sessionsByStudent = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    if (!sessionsByStudent.has(s.student_id)) sessionsByStudent.set(s.student_id, []);
    sessionsByStudent.get(s.student_id)!.push(s);
  }

  // ── Categorise each student ───────────────────────────────────────────────

  type AssignEntry = {
    student: StudentRow;
    tutor: { id: string; name: string };
    multiTutor: boolean;
    mostRecentSession: SessionRow;
  };

  const toAssign:          AssignEntry[] = [];
  const alreadyHad:        { student: StudentRow; tutorName: string }[] = [];
  const noTutorOnSessions: StudentRow[] = [];
  const noSessionsAtAll:   StudentRow[] = [];

  for (const student of students) {
    const studentSessions = sessionsByStudent.get(student.id);

    // No zoom sessions at all
    if (!studentSessions || studentSessions.length === 0) {
      noSessionsAtAll.push(student);
      continue;
    }

    // Already has a signed contract
    if (contractedStudents.has(student.id)) {
      const existing = contracts.find(c => c.student_id === student.id);
      alreadyHad.push({ student, tutorName: existing?.tutor?.name ?? existing?.tutor_id ?? '?' });
      continue;
    }

    // Pick tutor from most recent zoom session
    const mostRecent = studentSessions[0];
    if (!mostRecent.tutor) {
      noTutorOnSessions.push(student);
      continue;
    }

    const uniqueTutorIds = Array.from(new Set(studentSessions.map(s => s.tutor_id)));
    const multiTutor = uniqueTutorIds.length > 1;

    toAssign.push({ student, tutor: mostRecent.tutor, multiTutor, mostRecentSession: mostRecent });
  }

  // ── Apply: create signed contracts ────────────────────────────────────────

  const applyErrors: { student: StudentRow; error: string }[] = [];

  if (toAssign.length > 0 && !DRY_RUN) {
    console.log(`Creating ${toAssign.length} signed contract(s)…`);
    for (const { student, tutor } of toAssign) {
      // Get the tutor's hourly rate (same pattern as assign-tutor route)
      const { data: tutorRow } = await supabase
        .from('tutors')
        .select('hourly_rate')
        .eq('id', tutor.id)
        .maybeSingle();
      const hourlyRate = (tutorRow as any)?.hourly_rate ?? 0;

      // Void any pending contracts for this student first
      await supabase
        .from('contracts')
        .update({ status: 'voided' })
        .eq('student_id', student.id)
        .eq('status', 'pending');

      // Check for an existing signed contract with this tutor (avoid duplicates)
      const { data: existing } = await supabase
        .from('contracts')
        .select('id')
        .eq('student_id', student.id)
        .eq('tutor_id', tutor.id)
        .eq('status', 'signed')
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from('contracts').insert({
          student_id:  student.id,
          tutor_id:    tutor.id,
          status:      'signed',
          hourly_rate: hourlyRate,
          signed_at:   new Date().toISOString(),
        });
        if (error) applyErrors.push({ student, error: error.message });
      }
    }
    console.log('  Done.\n');
  }

  // ── Report ─────────────────────────────────────────────────────────────────

  const HR = '─'.repeat(64);
  console.log(`\n${HR}`);
  console.log(`  REPORT`);
  console.log(HR);

  // ① Newly assigned
  console.log(`\n✅  Newly assigned a tutor: ${toAssign.length}${DRY_RUN ? ' (dry run — not written)' : ''}`);
  for (const { student, tutor, multiTutor, mostRecentSession } of toAssign) {
    const multiFlag = multiTutor ? '  ⚠  multiple tutors in history — used most recent' : '';
    const dateStr = new Date(mostRecentSession.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const failedMark = applyErrors.some(e => e.student.id === student.id) ? '  ✗ WRITE FAILED' : '';
    console.log(`    ${student.name.padEnd(38)} → ${tutor.name}  (session ${dateStr})${multiFlag}${failedMark}`);
  }

  // ② Already had a tutor
  console.log(`\n⏭   Already had a tutor assigned (skipped): ${alreadyHad.length}`);
  for (const { student, tutorName } of alreadyHad) {
    console.log(`    ${student.name.padEnd(38)}   assigned to: ${tutorName}`);
  }

  // ③ Sessions exist but no tutor could be determined
  console.log(`\n⚠️   Sessions with zoom but tutor could not be determined: ${noTutorOnSessions.length}`);
  for (const s of noTutorOnSessions) {
    const sess = sessionsByStudent.get(s.id) ?? [];
    console.log(`    ${s.name.padEnd(38)}   ${sess.length} session(s) — all have null tutor join`);
  }

  // ④ No sessions at all
  console.log(`\n○   No sessions at all: ${noSessionsAtAll.length}`);
  for (const s of noSessionsAtAll) {
    console.log(`    ${s.name}`);
  }

  // Write errors
  if (applyErrors.length > 0) {
    console.log(`\n✗   Write errors: ${applyErrors.length}`);
    for (const { student, error } of applyErrors) {
      console.log(`    ${student.name}: ${error}`);
    }
  }

  // Summary
  console.log(`\n${HR}`);
  console.log(`  SUMMARY`);
  console.log(HR);
  console.log(`  Total students:                  ${students.length}`);
  console.log(`  Newly assigned${DRY_RUN ? ' (dry run)' : ''}:          ${toAssign.length}`);
  console.log(`  Already had tutor (skipped):     ${alreadyHad.length}`);
  console.log(`  Tutor undetermined:              ${noTutorOnSessions.length}`);
  console.log(`  No sessions at all:              ${noSessionsAtAll.length}`);
  if (applyErrors.length > 0) {
    console.log(`  Write errors:                    ${applyErrors.length}`);
  }
  console.log(`${HR}\n`);
}

main().catch(err => {
  console.error('\nFatal error:', err.message ?? err);
  process.exit(1);
});
