/**
 * Read-only assignment audit.
 * Fetches all students, all tutors, all signed contracts (joined with tutor name),
 * and all sessions in the last 90 days + upcoming — then prints raw JSON.
 *
 * NO writes to the database.
 *
 * Usage: npx ts-node --project tsconfig.json scripts/audit-assignments-tmp.ts
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

async function main() {
  // ── 1. All students ────────────────────────────────────────────────────────
  const { data: students, error: studentsErr } = await supabase
    .from('students')
    .select('id, name, status, email')
    .order('name');

  if (studentsErr) {
    console.error('Error fetching students:', studentsErr.message);
    process.exit(1);
  }

  // ── 2. All tutors ──────────────────────────────────────────────────────────
  const { data: tutors, error: tutorsErr } = await supabase
    .from('tutors')
    .select('id, name')
    .order('name');

  if (tutorsErr) {
    console.error('Error fetching tutors:', tutorsErr.message);
    process.exit(1);
  }

  // ── 3. All signed contracts joined with tutor name ─────────────────────────
  const { data: contracts, error: contractsErr } = await supabase
    .from('contracts')
    .select(`
      id,
      student_id,
      tutor_id,
      created_at,
      status,
      tutor:tutors(name)
    `)
    .eq('status', 'signed')
    .order('created_at', { ascending: false });

  if (contractsErr) {
    console.error('Error fetching contracts:', contractsErr.message);
    process.exit(1);
  }

  // ── 4. Upcoming sessions for David Salas and Oliver Zhang by student ID ────
  const now = new Date().toISOString();
  const davidId = '4e6eee75-efd0-48e0-a001-da0d723ce329';
  const oliverId = '56051960-dd5a-4f6b-9e88-e12ed8e0f9ba';

  const { data: davidSessions, error: davidErr } = await supabase
    .from('sessions')
    .select(`
      id,
      student_id,
      tutor_id,
      scheduled_at,
      status,
      student:students(name),
      tutor:tutors(name)
    `)
    .eq('student_id', davidId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', now)
    .order('scheduled_at', { ascending: true });

  if (davidErr) {
    console.error('Error fetching David sessions:', davidErr.message);
    process.exit(1);
  }

  const { data: oliverSessions, error: oliverErr } = await supabase
    .from('sessions')
    .select(`
      id,
      student_id,
      tutor_id,
      scheduled_at,
      status,
      student:students(name),
      tutor:tutors(name)
    `)
    .eq('student_id', oliverId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', now)
    .order('scheduled_at', { ascending: true });

  if (oliverErr) {
    console.error('Error fetching Oliver sessions:', oliverErr.message);
    process.exit(1);
  }

  // ── Build student/tutor lookup maps for enriched contract output ──────────
  const studentMap: Record<string, string> = {};
  for (const s of students ?? []) {
    studentMap[s.id] = s.name;
  }
  const tutorMap: Record<string, string> = {};
  for (const t of tutors ?? []) {
    tutorMap[t.id] = t.name;
  }

  // Enrich contracts with student_name and tutor_name, sorted by student_name
  const enrichedContracts = (contracts ?? [])
    .map(c => ({
      student_id:   c.student_id,
      student_name: studentMap[c.student_id] ?? c.student_id,
      tutor_id:     c.tutor_id,
      tutor_name:   ((c as any).tutor?.name) ?? tutorMap[c.tutor_id] ?? c.tutor_id,
      created_at:   c.created_at,
    }))
    .sort((a, b) => (a.student_name ?? '').localeCompare(b.student_name ?? ''));

  // Enrich sessions with student_name and tutor_name
  const enrichSession = (s: any) => ({
    id:           s.id,
    student_id:   s.student_id,
    student_name: s.student?.name ?? studentMap[s.student_id] ?? s.student_id,
    tutor_name:   s.tutor?.name   ?? tutorMap[s.tutor_id]    ?? s.tutor_id,
    scheduled_at: s.scheduled_at,
    status:       s.status,
  });

  const upcomingSessions = [
    ...(davidSessions ?? []).map(enrichSession),
    ...(oliverSessions ?? []).map(enrichSession),
  ].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  // ── Print results ──────────────────────────────────────────────────────────
  const LINE = '═'.repeat(80);

  console.log(`\n${LINE}`);
  console.log(`  STUDYCORE — RAW ASSIGNMENT AUDIT  (read-only, nothing modified)`);
  console.log(`  Run at: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
  console.log(LINE);

  console.log(`\n── 1. ALL STUDENTS (${(students ?? []).length} total) ──────────────────────────────────────`);
  console.log(JSON.stringify(
    (students ?? []).map(s => ({ id: s.id, name: s.name, status: s.status, email: s.email })),
    null,
    2
  ));

  console.log(`\n── 2. ALL TUTORS (${(tutors ?? []).length} total) ────────────────────────────────────────`);
  console.log(JSON.stringify(
    (tutors ?? []).map(t => ({ id: t.id, name: t.name })),
    null,
    2
  ));

  console.log(`\n── 3. ALL SIGNED CONTRACTS (${enrichedContracts.length} total) ─────────────────────────`);
  console.log(JSON.stringify(enrichedContracts, null, 2));

  console.log(`\n── 4. UPCOMING SESSIONS: David Salas & Oliver Zhang (scheduled, future) ──`);
  console.log(`   Now: ${now}`);
  console.log(JSON.stringify(upcomingSessions, null, 2));

  console.log(`\n${LINE}`);
  console.log(`  SUMMARY`);
  console.log(`  Students:                   ${(students ?? []).length}`);
  console.log(`  Tutors:                     ${(tutors ?? []).length}`);
  console.log(`  Signed contracts:           ${enrichedContracts.length}`);
  console.log(`  David Salas upcoming:       ${(davidSessions ?? []).length}`);
  console.log(`  Oliver Zhang upcoming:      ${(oliverSessions ?? []).length}`);
  console.log(`${LINE}\n`);
  console.log('  Read-only — nothing was written to the database.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
