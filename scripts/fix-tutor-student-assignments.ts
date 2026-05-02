/**
 * Fix tutor-student assignments:
 *   1. For every tutor with sessions but no contracts → report & optionally create contracts
 *   2. Cross-reference the MASTER_LIST below → create any missing contracts
 *
 * Usage:
 *   # Dry run (default — just print, no writes)
 *   npx tsx --env-file=.env.local scripts/fix-tutor-student-assignments.ts
 *
 *   # Live run
 *   npx tsx --env-file=.env.local scripts/fix-tutor-student-assignments.ts --live
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const DRY_RUN = !process.argv.includes('--live');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── Master assignment list ────────────────────────────────────────────────────
// tutorName (partial match ok) → student names (partial match ok)
// Tutors/students marked as skip will not be processed.
const MASTER_LIST: Array<{ tutor: string; students: string[]; skip?: boolean }> = [
  { tutor: 'Barghav',      students: ['Elijah Zittel', 'Saanvi Kumar', 'Kyle Lerman'] },
  { tutor: 'Rachit',       students: ['David Bogart', 'Enakshi Bansal', 'Nicolai Defreest', 'Lauren Streck', 'Sophia Winard'] },
  { tutor: 'MAHIR',        students: ['Snehansh', 'Arham Usman', 'Maz'] },
  { tutor: 'Parth',        students: ['Monica', 'Javet Wongkaren', 'Muhammad Haider', 'Vijay Vanaparthy'] },
  { tutor: 'David Zhu',    students: ['Somesh Bhatt', 'Abbie Pongpat', 'Medha', 'Colby Burton', 'Pierre DeFelice', 'Raj Cuddapah', 'Sid Iyer', 'Sydney Willingham'] },
  { tutor: 'Nikhil',       students: ['Tanishi Pathak', 'Nitant Handa'] },
  { tutor: 'Mazin',        students: ['Aadhya Ganatra'] },
  { tutor: 'Jesse Palmer', students: ['Adam Hamid'] },
  { tutor: 'Pranesh',      students: ['Radhae Ganesh'] },
  { tutor: 'Tanish',       students: ['Aarav Vasudevan', 'Sara Abdelrahman', 'Vineel Motadikela'] },
  { tutor: 'Priyam',       students: ['Om Vyas', 'Ved'] },
  { tutor: 'Varun',        students: ['Muzammil', 'Kai Judex', 'Anaya Abraham', 'Brittany Lilly'] },
  { tutor: 'Joseph Valenti', students: ['Harshith', 'Arnav Mishra', 'Abisola', 'Krish Jariwala', 'Milana Labkovich', 'Temi Apata'] },
  { tutor: 'Minju Kim',    students: ['Addy Hill', 'Mrinal Agarwal', 'Susannah Rockers'] },
  { tutor: 'Yiyi Sun',     students: ['Moin Khan', 'Saisaran Vigneshkumar', 'Askari Hussain'] },
  { tutor: 'Daniel Ryu',   students: ['Dikshant Ahuja', 'Aditri Sikdar', 'Sara Kalangi', 'Pradyumn Singh'] },
  { tutor: 'Lahari',       students: ['Aarini Naskar', 'Emerie Smith', 'Isabel Villarreal', 'Kai Rosen', 'Setaya Motarjem', 'Bhargav Padhi'] },
  { tutor: 'Herbert',      students: ['Arinze', 'Mide', 'Ann Sherman', 'Miracle Brown', 'Emily Dietzenbach', 'Jessica Ayissi'] },
  { tutor: 'Samrudh',      students: ['Vishnu', 'Prisha Kolhe', 'Shreya Samba', 'Suhani Laddha', 'Willfred Villasica'] },
  { tutor: 'Ayush Bansal', students: ['Chisom Eze', 'Rishi Yadavalli', 'Adam Needleman'] },
  { tutor: 'Charles',      students: ['Roopkatha Bagchi', 'Arush Roy'] },
  { tutor: 'Brohon',       students: ['Miracle Brown'] },
  { tutor: 'Vedanta',      students: ['Nnaallah Anazia', 'Alec Toledo'] },
  { tutor: 'Akshya',       students: ['Mya Hill', 'Shayne Dagleish', 'Aayush Musku'] },
  { tutor: 'Christopher Dai', students: ['Savannah', 'Olivia Park'] },
  { tutor: 'Sara Khwaja',  students: ['Shaan Patel'] },
  { tutor: 'Navya',        students: ['Charissa Alex-Baxter', 'Faris Syed'] },
  { tutor: 'Niv',          students: ['Adam Ayyub', 'Aiden Aponte Maxwell'] },
  { tutor: 'Hoon Jung',    students: [] }, // check DB only
  { tutor: 'Aayush',       students: ['Javyn'] },
  { tutor: 'Oliver',       students: [], skip: true },
  { tutor: 'David Salas',  students: [], skip: true },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Count exact word-level overlaps between two names (min word length = 2). */
function wordOverlap(a: string, b: string): number {
  const wa = new Set(norm(a).split(' ').filter(w => w.length >= 2));
  const wb = new Set(norm(b).split(' ').filter(w => w.length >= 2));
  let count = 0;
  for (const w of wa) if (wb.has(w)) count++;
  return count;
}

/** Find the best-matching tutor from the list for a given search name. */
function findTutor(name: string, tutors: any[]): any | null {
  const na = norm(name);
  // 1. Exact match
  const exact = tutors.find(t => norm(t.name) === na);
  if (exact) return exact;
  // 2. Best overlap — require ALL words of the shorter name to be present
  let best: any = null;
  let bestScore = 0;
  for (const t of tutors) {
    const score = wordOverlap(name, t.name);
    const wordsInSearch = norm(name).split(' ').filter(w => w.length >= 2);
    const wordsInTarget = new Set(norm(t.name).split(' ').filter(w => w.length >= 2));
    // Require every word of the search name to match
    const allMatch = wordsInSearch.every(w => wordsInTarget.has(w));
    if (allMatch && score > bestScore) { best = t; bestScore = score; }
  }
  return best;
}

/** Find the best-matching student from the list for a given search name.
 *  Requires at least one word (len>=3) to match exactly (whole word, not substring). */
function findStudent(name: string, students: any[]): any | null {
  const na = norm(name);
  // 1. Exact match
  const exact = students.find(s => norm(s.name) === na);
  if (exact) return exact;
  // 2. Starts-with match (e.g. "Saanvi" matches "Saanvi Kumar")
  const startsWith = students.find(s => norm(s.name).startsWith(na) || na.startsWith(norm(s.name)));
  if (startsWith) return startsWith;
  // 3. Best word-overlap (whole-word only, min len 3)
  let best: any = null;
  let bestScore = 0;
  for (const s of students) {
    const wa = norm(name).split(' ').filter(w => w.length >= 3);
    const wb = new Set(norm(s.name).split(' ').filter(w => w.length >= 3));
    // EXACT word match only (no substrings)
    const score = wa.filter(w => wb.has(w)).length;
    // Require the majority of search words to match
    if (score > 0 && score >= Math.ceil(wa.length * 0.5) && score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

/** Loose match for checking if a student name is in master entry students list. */
function inMasterStudents(studentName: string, masterStudents: string[]): boolean {
  return masterStudents.some(mn => {
    const wa = norm(mn).split(' ').filter(w => w.length >= 3);
    const wb = new Set(norm(studentName).split(' ').filter(w => w.length >= 3));
    const score = wa.filter(w => wb.has(w)).length;
    return score >= Math.ceil(wa.length * 0.5);
  });
}

const HR  = '─'.repeat(70);
const HR2 = '═'.repeat(70);

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${HR2}`);
  console.log(`  FIX TUTOR-STUDENT ASSIGNMENTS${DRY_RUN ? ' — DRY RUN' : ' — LIVE'}`);
  console.log(`${HR2}\n`);

  if (DRY_RUN) {
    console.log('  *** DRY RUN: pass --live to write changes ***\n');
  }

  // ── Load all data ─────────────────────────────────────────────────────────
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: tutors }, { data: students }, { data: contracts }, { data: sessions }] =
    await Promise.all([
      supabase.from('tutors').select('id, name, email, hourly_rate').order('name'),
      supabase.from('students').select('id, name, email').order('name'),
      supabase.from('contracts').select('id, tutor_id, student_id, status'),
      supabase.from('sessions')
        .select('tutor_id, student_id, scheduled_at')
        .or(`status.eq.scheduled,and(status.eq.completed,scheduled_at.gte.${sixtyDaysAgo})`),
    ]);

  if (!tutors || !students) { console.error('Failed to load data'); process.exit(1); }

  // Build lookups
  const contractSet   = new Set(contracts?.map(c => `${c.tutor_id}:${c.student_id}`) ?? []);
  const sessionsByTutor = new Map<string, Set<string>>(); // tutorId → Set<studentId>
  for (const s of (sessions ?? [])) {
    const set = sessionsByTutor.get(s.tutor_id) ?? new Set();
    set.add(s.student_id);
    sessionsByTutor.set(s.tutor_id, set);
  }

  let totalCreated = 0;
  let totalMissing = 0;
  const actions: Array<{ tutorId: string; tutorName: string; studentId: string; studentName: string; reason: string }> = [];

  // ── Section 1: Tutors with sessions but no contracts ─────────────────────
  console.log(`${HR}`);
  console.log('  SECTION 1: Tutors with sessions but missing contracts');
  console.log(HR);

  for (const tutor of tutors) {
    const sessionStudentIds = sessionsByTutor.get(tutor.id) ?? new Set<string>();
    const contractStudentIds = new Set(
      contracts?.filter(c => c.tutor_id === tutor.id && ['signed','pending','active'].includes(c.status))
        .map(c => c.student_id) ?? []
    );

    const sessionOnly = [...sessionStudentIds].filter(sid => !contractStudentIds.has(sid));
    if (sessionOnly.length === 0) continue;

    console.log(`\n  ${tutor.name} — ${sessionOnly.length} session-student(s) without contracts:`);
    for (const sid of sessionOnly) {
      const st = students.find(s => s.id === sid);
      if (!st) continue;
      const isPlaceholder = (st.email ?? '').endsWith('@studycore.import');
      if (isPlaceholder) {
        console.log(`    [SKIP placeholder] ${st.name} (${st.email})`);
        continue;
      }
      const masterEntry = MASTER_LIST.find(e => findTutor(e.tutor, [tutor]) != null);
      const inMaster = masterEntry ? inMasterStudents(st.name, masterEntry.students) : false;
      console.log(`    ${inMaster ? '→ WILL CREATE' : '? NOT in master list'} contract: ${st.name} (${st.email})`);
      if (inMaster) {
        actions.push({ tutorId: tutor.id, tutorName: tutor.name, studentId: sid, studentName: st.name, reason: 'session-only + in master list' });
      }
    }
  }

  // ── Section 2: Master list cross-reference ────────────────────────────────
  console.log(`\n${HR}`);
  console.log('  SECTION 2: Master list cross-reference');
  console.log(HR);

  for (const entry of MASTER_LIST) {
    if (entry.skip) { console.log(`\n  [SKIP] ${entry.tutor}`); continue; }
    if (entry.students.length === 0) { console.log(`\n  [CHECK DB ONLY] ${entry.tutor}`); continue; }

    const tutor = findTutor(entry.tutor, tutors);
    if (!tutor) {
      console.log(`\n  ✗ TUTOR NOT FOUND: "${entry.tutor}"`);
      continue;
    }

    const contractedStudentIds = new Set(
      contracts?.filter(c => c.tutor_id === tutor.id && ['signed','pending','active'].includes(c.status))
        .map(c => c.student_id) ?? []
    );

    console.log(`\n  ${tutor.name}:`);

    for (const studentName of entry.students) {
      // Find student by fuzzy name match
      const student = findStudent(studentName, students);

      if (!student) {
        totalMissing++;
        console.log(`    ✗ STUDENT NOT IN DB: "${studentName}"`);
        continue;
      }

      if (contractedStudentIds.has(student.id) || contractSet.has(`${tutor.id}:${student.id}`)) {
        console.log(`    ✓ OK  ${student.name}`);
        continue;
      }

      // Check if already queued
      const alreadyQueued = actions.some(a => a.tutorId === tutor.id && a.studentId === student.id);
      if (alreadyQueued) {
        console.log(`    → QUEUED  ${student.name} (from Section 1)`);
        continue;
      }

      console.log(`    → CREATE contract: ${student.name} (${student.email ?? 'no email'})`);
      actions.push({ tutorId: tutor.id, tutorName: tutor.name, studentId: student.id, studentName: student.name, reason: 'master list' });
    }
  }

  // ── Summary of planned actions ────────────────────────────────────────────
  console.log(`\n${HR2}`);
  console.log('  PLAN SUMMARY');
  console.log(HR2);
  console.log(`  Contracts to create:      ${actions.length}`);
  console.log(`  Students not in DB:       ${totalMissing}`);
  if (DRY_RUN) console.log('\n  *** DRY RUN — run with --live to apply ***');
  console.log();

  for (const a of actions) {
    console.log(`  CREATE  ${a.tutorName.padEnd(24)} → ${a.studentName.padEnd(30)} [${a.reason}]`);
  }

  if (actions.length === 0) {
    console.log('  Nothing to do — all assignments are already in place.');
    return;
  }

  if (DRY_RUN) {
    console.log(`\n${HR2}\n`);
    return;
  }

  // ── Apply changes ─────────────────────────────────────────────────────────
  console.log(`\n${HR}`);
  console.log('  APPLYING CHANGES');
  console.log(HR);

  for (const a of actions) {
    // Look up tutor's hourly rate
    const tutor = tutors.find(t => t.id === a.tutorId)!;

    const { data, error } = await supabase.from('contracts').insert({
      tutor_id:   a.tutorId,
      student_id: a.studentId,
      status:     'signed',
      hourly_rate: tutor.hourly_rate ?? 20,
      created_at:  new Date().toISOString(),
    }).select('id').single();

    if (error) {
      console.error(`  ✗ ERROR  ${a.tutorName} → ${a.studentName}: ${error.message}`);
    } else {
      totalCreated++;
      console.log(`  ✅ CREATED  ${a.tutorName.padEnd(24)} → ${a.studentName}  (contract ${data.id})`);
    }
  }

  console.log(`\n${HR2}`);
  console.log(`  DONE — ${totalCreated} contract(s) created`);
  console.log(`${HR2}\n`);
}

main().catch(err => {
  console.error('\nFatal:', err.message ?? err);
  process.exit(1);
});
