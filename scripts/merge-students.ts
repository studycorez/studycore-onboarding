import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Tables that hold a student_id foreign key and need to be re-pointed
const CHILD_TABLES = [
  'sessions',
  'contracts',
  'student_progress',
  'xp_events',
  'student_emails',
  'tutor_switches',
  'student_availability',
  'session_logs',          // included if table exists; errors are caught per-table
] as const;

// ── Merge definition ──────────────────────────────────────────────────────────
// Each entry identifies KEEP and one or more DELETE students.
// We look up IDs dynamically so the script stays correct even if the DB shifted.
interface MergeDef {
  label: string;
  keep:  { name: string; email?: string };          // email is optional but preferred
  drop:  { name: string; email?: string }[];
}

const MERGES: MergeDef[] = [
  // ── SAFE MERGES ─────────────────────────────────────────────────────────
  {
    label: 'Arnav Mishra',
    keep:  { name: 'Arnav Mishra', email: 'arnav2907mishra@gmail.com' },
    drop:  [{ name: 'Arnav Mishra', email: 'arnav2907mishra@gmail.com' }],
    // Both have same email; keep oldest (Apr 24). We resolve by created_at below.
  },
  {
    label: 'Askari Hussain',
    keep:  { name: 'Askari Hussain', email: 'askarinaqvi2008@gmail.com' },
    drop:  [{ name: 'Askari Hussain', email: 'askarinaqvi2008@gmail.com' }],
    // Keep the one with more sessions; resolved by session count below.
  },
  {
    label: 'Krish Jariwala',
    keep:  { name: 'Krish Jariwala', email: 'Krish2008j@gmail.com' },
    drop:  [{ name: 'Krish Jariwala', email: 'Krish2008j@gmail.com' }],
  },
  {
    label: 'Moin Khan',
    keep:  { name: 'Moin Khan', email: 'moinmkhan15@gmail.com' },
    drop:  [{ name: 'Moin Khan', email: 'moinmkhan15@gmail.com' }],
    // 3 dupes same email; keep oldest (most sessions).
  },
  {
    label: 'Temi Apata',
    keep:  { name: 'Temi Apata', email: 'temibella.apata@gmail.com' },
    drop:  [{ name: 'Temi Apata', email: 'temibella.apata@gmail.com' }],
  },
  {
    label: 'Javet Wongkaren',
    keep:  { name: 'Javet Wongkaren', email: 'jwongkaren27@llastudent.org' },
    drop:  [
      { name: 'Javet Wongkaren', email: 'javet.wongkaren@studycore.import' },
    ],
    // There are two @studycore.import dupes; both will be caught by name+email query.
  },
  {
    label: 'Sara Kalangi',
    keep:  { name: 'Sara Kalangi', email: 'kalangisara@gmail.com' },
    drop:  [{ name: 'Sara Kalangi' }],   // delete any Sara Kalangi that isn't the keep
  },
  {
    label: 'Pradyumn Singh',
    keep:  { name: 'Pradyumn Singh', email: 'contactprady@gmail.com' },
    drop:  [{ name: 'Pradyumn Singh', email: 'pradyumn.singh@studycore.import' }],
  },

  // ── PARTIAL NAME MERGES ──────────────────────────────────────────────────
  {
    label: 'Kara → Kara Harris',
    keep:  { name: 'Kara Harris', email: 'kkcrumblecookie@gmail.com' },
    drop:  [{ name: 'Kara',       email: 'kkcrumblecookie@gmail.com' }],
  },
  {
    label: 'Milana → Milana Labkovich',
    keep:  { name: 'Milana Labkovich', email: 'mlabkovich@gmail.com' },
    drop:  [{ name: 'Milana',          email: 'mlabkovich@gmail.com' }],
  },
  {
    label: 'Mya → Mya Hall',
    keep:  { name: 'Mya Hall', email: 'myarihll@aol.com' },
    drop:  [{ name: 'Mya',     email: 'myarihll@aol.com' }],
  },
  {
    label: 'Rishi → Rishi Yadavalli',
    keep:  { name: 'Rishi Yadavalli', email: 'rishi.yadavalli10@gmail.com' },
    drop:  [{ name: 'Rishi',          email: 'rishi.yadavalli10@gmail.com' }],
  },
  {
    label: 'setaya → Setaya Motarjem',
    keep:  { name: 'Setaya Motarjem', email: 'smotarjem27@hb.edu' },
    drop:  [{ name: 'setaya',         email: 'smotarjem27@hb.edu' }],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sessionCount(studentId: string): Promise<number> {
  const { count } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId);
  return count ?? 0;
}

async function findStudents(spec: { name: string; email?: string }) {
  let q = supabase
    .from('students')
    .select('id, name, email, created_at')
    .ilike('name', spec.name);          // case-insensitive name match
  if (spec.email) q = q.ilike('email', spec.email);
  const { data, error } = await q;
  if (error) throw new Error(`lookup failed: ${error.message}`);
  return data ?? [];
}

async function moveChildRecords(
  keepId: string,
  dropId: string,
): Promise<Record<string, number>> {
  const moved: Record<string, number> = {};

  for (const table of CHILD_TABLES) {
    try {
      // Count rows before move
      const { count: before } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('student_id', dropId);

      if ((before ?? 0) === 0) continue;   // nothing to move

      const { error } = await supabase
        .from(table)
        .update({ student_id: keepId })
        .eq('student_id', dropId);

      if (error) {
        console.log(`    ⚠️  ${table}: ${error.message}`);
      } else {
        moved[table] = before ?? 0;
      }
    } catch {
      // Table may not exist — skip silently
    }
  }

  return moved;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log('  StudyCore — Student Merge Script');
  console.log(`  ${new Date().toLocaleString()}`);
  console.log(`${'═'.repeat(70)}\n`);

  let totalMerged = 0;
  let totalDeleted = 0;
  const skipped: string[] = [];

  for (const merge of MERGES) {
    console.log(`\n── ${merge.label} ${'─'.repeat(Math.max(0, 55 - merge.label.length))}`);

    // ── Find the KEEP student ────────────────────────────────────────────────
    const keepCandidates = await findStudents(merge.keep);

    if (keepCandidates.length === 0) {
      // Special case: keep student doesn't exist yet under that exact email.
      // Try name only and pick most sessions.
      const byName = await findStudents({ name: merge.keep.name });
      if (byName.length === 0) {
        console.log(`  SKIP — no student found matching keep spec: name="${merge.keep.name}" email="${merge.keep.email ?? '*'}"`);
        skipped.push(merge.label);
        continue;
      }
      // fallback: use name-only match
      keepCandidates.push(...byName);
    }

    // When multiple candidates for keep (same name+email), pick the one with most sessions;
    // tie-break by oldest created_at.
    const keepWithCounts = await Promise.all(
      keepCandidates.map(async s => ({ ...s, sessions: await sessionCount(s.id) }))
    );
    keepWithCounts.sort((a, b) =>
      b.sessions !== a.sessions
        ? b.sessions - a.sessions
        : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const keep = keepWithCounts[0];
    const keepDuplicates = keepWithCounts.slice(1); // same-spec extras also need to be merged

    console.log(`  KEEP  ${keep.name} <${keep.email}>`);
    console.log(`        id=${keep.id}  sessions=${keep.sessions}`);

    // ── Collect DROP students ────────────────────────────────────────────────
    const toDelete: typeof keepWithCounts = [...keepDuplicates];

    for (const dropSpec of merge.drop) {
      const dropCandidates = await findStudents(dropSpec);
      for (const d of dropCandidates) {
        if (d.id === keep.id) continue;                         // never delete the keep
        if (toDelete.find(x => x.id === d.id)) continue;       // dedupe
        toDelete.push({ ...d, sessions: await sessionCount(d.id) });
      }
    }

    if (toDelete.length === 0) {
      console.log('  SKIP — no duplicates found to delete');
      skipped.push(merge.label);
      continue;
    }

    // ── Execute merge for each drop student ──────────────────────────────────
    for (const drop of toDelete) {
      console.log(`\n  DELETE ${drop.name} <${drop.email}>`);
      console.log(`         id=${drop.id}  sessions=${drop.sessions}`);

      // Move child records
      const moved = await moveChildRecords(keep.id, drop.id);
      if (Object.keys(moved).length > 0) {
        for (const [table, count] of Object.entries(moved)) {
          console.log(`    → moved ${count} row(s) in ${table}`);
        }
      } else {
        console.log('    → no child records to move');
      }

      // Delete the duplicate student
      const { error: delErr } = await supabase
        .from('students')
        .delete()
        .eq('id', drop.id);

      if (delErr) {
        console.log(`    ✗ DELETE failed: ${delErr.message}`);
      } else {
        console.log(`    ✓ deleted student ${drop.id}`);
        totalDeleted++;
      }
    }

    totalMerged++;
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(70)}`);
  console.log('  Summary');
  console.log('  ───────────────────────────────────────────────');
  console.log(`  Merge groups completed : ${totalMerged}`);
  console.log(`  Duplicate rows deleted : ${totalDeleted}`);
  if (skipped.length > 0) {
    console.log(`  Skipped (not found)    : ${skipped.join(', ')}`);
  }
  console.log(`${'═'.repeat(70)}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
