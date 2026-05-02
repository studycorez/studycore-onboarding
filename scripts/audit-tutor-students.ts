/**
 * Audit tutor-student assignments:
 * - Every tutor + student count in portal (contracts + sessions)
 * - Flag duplicates
 * - List tutors with 0 students
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/audit-tutor-students.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const HR  = '─'.repeat(70);
const HR2 = '═'.repeat(70);

async function main() {
  console.log(`\n${HR2}`);
  console.log('  TUTOR-STUDENT ASSIGNMENT AUDIT');
  console.log(`${HR2}\n`);

  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  // ── Fetch all tutors ──────────────────────────────────────────────────────
  const { data: tutors } = await supabase
    .from('tutors')
    .select('id, name, email')
    .order('name');

  if (!tutors?.length) { console.log('No tutors found.'); return; }

  // ── Fetch all contracts ───────────────────────────────────────────────────
  const { data: contracts } = await supabase
    .from('contracts')
    .select('tutor_id, student_id, status, students(id, name, email)')
    .in('status', ['signed', 'pending', 'active']);

  // ── Fetch sessions (last 60 days + upcoming) ──────────────────────────────
  const { data: sessions } = await supabase
    .from('sessions')
    .select('tutor_id, student_id, scheduled_at, status, students(id, name, email)')
    .or(`status.eq.scheduled,and(status.in.(completed,no_show_student,no_show_tutor,no_show_both),scheduled_at.gte.${sixtyDaysAgo})`);

  const contractMap  = new Map<string, any[]>(); // tutorId → contract rows
  const sessionMap   = new Map<string, any[]>(); // tutorId → session rows

  for (const c of (contracts ?? [])) {
    const arr = contractMap.get(c.tutor_id) ?? [];
    arr.push(c);
    contractMap.set(c.tutor_id, arr);
  }
  for (const s of (sessions ?? [])) {
    const arr = sessionMap.get(s.tutor_id) ?? [];
    arr.push(s);
    sessionMap.set(s.tutor_id, arr);
  }

  let zeroStudentTutors: string[] = [];
  let duplicateTutors:   string[] = [];
  let totalStudents = 0;

  for (const tutor of tutors) {
    const contractRows = contractMap.get(tutor.id) ?? [];
    const sessionRows  = sessionMap.get(tutor.id)  ?? [];

    // Build merged student map (same logic as portal)
    const studentMap = new Map<string, { name: string; email: string; source: string }>();

    for (const c of contractRows) {
      const s = Array.isArray(c.students) ? c.students[0] : c.students;
      if (s?.id && !studentMap.has(s.id)) {
        studentMap.set(s.id, { name: s.name ?? '?', email: s.email ?? '', source: 'contract' });
      }
    }

    // Track student IDs seen from sessions before merging (to detect session-only adds)
    const sessionStudentIds = new Set<string>();
    for (const r of sessionRows) {
      const s = Array.isArray(r.students) ? r.students[0] : r.students;
      if (!s?.id) continue;
      sessionStudentIds.add(s.id);
      if (!studentMap.has(s.id)) {
        studentMap.set(s.id, { name: s.name ?? '?', email: s.email ?? '', source: 'session-only' });
      }
    }

    const count = studentMap.size;
    totalStudents += count;

    // Check for duplicates in raw contract rows (same student_id appearing twice)
    const contractStudentIds = contractRows.map(c => c.student_id);
    const contractDups = contractStudentIds.filter(
      (id, i) => contractStudentIds.indexOf(id) !== i
    );

    const statusIcon = count === 0 ? '✗' : '✓';

    console.log(`${statusIcon} ${tutor.name.padEnd(24)} ${String(count).padStart(2)} student${count !== 1 ? 's' : ' '} (${contractRows.length} contracts, ${sessionRows.length} sessions)`);

    for (const [sid, st] of studentMap) {
      const isPlaceholder = st.email.endsWith('@studycore.import') || st.email.startsWith('student-');
      const emailLabel = isPlaceholder ? '[placeholder]' : st.email || '[no email]';
      const dupFlag = contractDups.includes(sid) ? ' ⚠ DUPLICATE CONTRACT' : '';
      console.log(`    • ${st.name.padEnd(28)} [${st.source.padEnd(13)}] ${emailLabel}${dupFlag}`);
    }

    if (contractDups.length > 0) duplicateTutors.push(tutor.name);
    if (count === 0) zeroStudentTutors.push(tutor.name);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${HR2}`);
  console.log('  SUMMARY');
  console.log(HR2);
  console.log(`  Total tutors:       ${tutors.length}`);
  console.log(`  Total unique students (across all tutors): ${totalStudents}`);
  console.log(`\n  Tutors with 0 students (${zeroStudentTutors.length}):`);
  for (const n of zeroStudentTutors) console.log(`    - ${n}`);
  console.log(`\n  Tutors with duplicate contract rows (${duplicateTutors.length}):`);
  for (const n of duplicateTutors) console.log(`    - ${n}`);
  console.log(`\n${HR2}\n`);
}

main().catch(err => {
  console.error('\nFatal:', err.message ?? err);
  process.exit(1);
});
