import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DRY_RUN = !process.argv.includes('--write');

// Tables that hold a student_id foreign key and need to be re-pointed.
// NOTE: student_emails is included here — existing secondary email rows are
// migrated via moveChildRecords. The primary email of the dropped student is
// handled separately by preservePrimaryEmail().
const CHILD_TABLES = [
  'sessions',
  'contracts',
  'student_progress',
  'xp_events',
  'student_emails',
  'tutor_switches',
  'student_availability',
  'session_logs',
] as const;

// ── Merge definition ──────────────────────────────────────────────────────────
interface MergeDef {
  label: string;
  keep:  { name: string; email?: string };
  drop:  { name: string; email?: string }[];
}

const MERGES: MergeDef[] = [
  // ── Previously run (will SKIP — no duplicates left) ──────────────────────
  { label: 'Arnav Mishra',    keep: { name: 'Arnav Mishra',    email: 'arnav2907mishra@gmail.com'    }, drop: [{ name: 'Arnav Mishra',    email: 'arnav2907mishra@gmail.com'    }] },
  { label: 'Askari Hussain',  keep: { name: 'Askari Hussain',  email: 'askarinaqvi2008@gmail.com'    }, drop: [{ name: 'Askari Hussain',  email: 'askarinaqvi2008@gmail.com'    }] },
  { label: 'Krish Jariwala',  keep: { name: 'Krish Jariwala',  email: 'Krish2008j@gmail.com'         }, drop: [{ name: 'Krish Jariwala',  email: 'Krish2008j@gmail.com'         }] },
  { label: 'Moin Khan',       keep: { name: 'Moin Khan',       email: 'moinmkhan15@gmail.com'        }, drop: [{ name: 'Moin Khan',       email: 'moinmkhan15@gmail.com'        }] },
  { label: 'Temi Apata',      keep: { name: 'Temi Apata',      email: 'temibella.apata@gmail.com'    }, drop: [{ name: 'Temi Apata',      email: 'temibella.apata@gmail.com'    }] },
  { label: 'Javet Wongkaren', keep: { name: 'Javet Wongkaren', email: 'jwongkaren27@llastudent.org'  }, drop: [{ name: 'Javet Wongkaren', email: 'javet.wongkaren@studycore.import' }] },
  { label: 'Sara Kalangi',    keep: { name: 'Sara Kalangi',    email: 'kalangisara@gmail.com'        }, drop: [{ name: 'Sara Kalangi' }] },
  { label: 'Pradyumn Singh',  keep: { name: 'Pradyumn Singh',  email: 'contactprady@gmail.com'       }, drop: [{ name: 'Pradyumn Singh',  email: 'pradyumn.singh@studycore.import' }] },
  { label: 'Kara → Kara Harris',          keep: { name: 'Kara Harris',      email: 'kkcrumblecookie@gmail.com'    }, drop: [{ name: 'Kara',    email: 'kkcrumblecookie@gmail.com' }] },
  { label: 'Milana → Milana Labkovich',   keep: { name: 'Milana Labkovich', email: 'mlabkovich@gmail.com'         }, drop: [{ name: 'Milana', email: 'mlabkovich@gmail.com'       }] },
  { label: 'Mya → Mya Hall',              keep: { name: 'Mya Hall',         email: 'myarihll@aol.com'             }, drop: [{ name: 'Mya',    email: 'myarihll@aol.com'           }] },
  { label: 'Rishi → Rishi Yadavalli',     keep: { name: 'Rishi Yadavalli',  email: 'rishi.yadavalli10@gmail.com'  }, drop: [{ name: 'Rishi',  email: 'rishi.yadavalli10@gmail.com' }] },
  { label: 'setaya → Setaya Motarjem',    keep: { name: 'Setaya Motarjem',  email: 'smotarjem27@hb.edu'           }, drop: [{ name: 'setaya', email: 'smotarjem27@hb.edu'         }] },

  // ── NEW MERGES (from 2026-04-29 duplicate scan) ───────────────────────────
  {
    label: 'Kai Judex (case-insensitive email dupe)',
    keep:  { name: 'Kai Judex', email: 'kai.judex@gmail.com' },   // 2 sessions
    drop:  [{ name: 'Kai Judex', email: 'Kai.judex@gmail.com' }], // 0 sessions
  },
  {
    label: 'Mrinal Agarwal (import dupe)',
    keep:  { name: 'Mrinal Agarwal', email: 'student-50@studycore.import' },    // 12 sessions
    drop:  [{ name: 'Mrinal Agarwal', email: 'mrinal.agarwal@studycore.import' }], // 1 session
  },
  {
    label: 'Saanvi Sunil (import dupe)',
    keep:  { name: 'Saanvi Sunil', email: 'saanvisunil027@gmail.com' },          // real email
    drop:  [{ name: 'Saanvi Sunil', email: 'saanvi.sunil@studycore.import' }],
  },
  {
    label: 'Saisaran Vigneshkumar (name dupe, different emails)',
    keep:  { name: 'Saisaran Vigneshkumar', email: 'kjlearn9@gmail.com' },       // 5 sessions
    drop:  [{ name: 'Saisaran Vigneshkumar', email: 'Saisaranvk@gmail.com' }],  // 2 sessions
  },
  {
    label: 'Susannah Rockers (import dupe)',
    keep:  { name: 'Susannah Rockers', email: 'rsisnsis8280@gmail.com' },          // 4 sessions
    drop:  [{ name: 'Susannah Rockers', email: 'susannah.rockers@studycore.import' }],
  },
  {
    label: 'Vijay Vanaparthy (import dupe)',
    keep:  { name: 'Vijay Vanaparthy', email: 'rvanap@gmail.com' },               // real email
    drop:  [{ name: 'Vijay Vanaparthy', email: 'vijay.vanaparthy@studycore.import' }],
  },
  {
    label: 'Chisom Eze / Chisom Ezeanyika (same email, name variant)',
    keep:  { name: 'Chisom Eze',       email: 'chizm.eze@gmail.com' }, // 2 sessions
    drop:  [{ name: 'Chisom Ezeanyika', email: 'chizm.eze@gmail.com' }], // 0 sessions
  },
  {
    label: 'Shayne Dalgleish (typo dupe)',
    keep:  { name: 'Shayne Dagleish',  email: 'shayne.dalgleish@gmail.com' }, // 2 sessions
    drop:  [{ name: 'Shayne Dalgleish', email: 'shayne.dalgleish@gmail.com' }], // 0 sessions
  },
  {
    label: 'Nitant → Nitant Handa (partial name, import dupe)',
    keep:  { name: 'Nitant Handa',  email: 'arrowbow16@gmail.com' },     // real email, 30h purchased
    drop:  [{ name: 'Nitant',       email: 'nitant@studycore.import' }], // import
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
    .ilike('name', spec.name);
  if (spec.email) q = q.ilike('email', spec.email);
  const { data, error } = await q;
  if (error) throw new Error(`lookup failed: ${error.message}`);
  return data ?? [];
}

// Ensure the dropped student's primary email is preserved as a secondary email
// on the keep student. Returns a description of what was/would be done.
async function preservePrimaryEmail(
  keepId: string,
  keepPrimaryEmail: string,
  dropEmail: string,
): Promise<string> {
  const dropEmailNorm = dropEmail.toLowerCase().trim();
  const keepEmailNorm = keepPrimaryEmail.toLowerCase().trim();

  // Nothing to do if it's the same email
  if (dropEmailNorm === keepEmailNorm) {
    return `skip (same as keep's primary email)`;
  }

  // Check if already present in student_emails for the keep student
  const { data: existing } = await supabase
    .from('student_emails')
    .select('id')
    .eq('student_id', keepId)
    .ilike('email', dropEmail);

  if (existing && existing.length > 0) {
    return `skip (already in student_emails)`;
  }

  if (DRY_RUN) {
    return `would insert <${dropEmail}> as secondary`;
  }

  const { error } = await supabase.from('student_emails').insert({
    student_id: keepId,
    email:      dropEmail,
    label:      'secondary',
  });

  if (error) return `ERROR inserting: ${error.message}`;
  return `inserted <${dropEmail}> as secondary ✓`;
}

async function moveChildRecords(
  keepId: string,
  dropId: string,
): Promise<Record<string, number>> {
  const moved: Record<string, number> = {};

  for (const table of CHILD_TABLES) {
    try {
      const { count: before } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('student_id', dropId);

      if ((before ?? 0) === 0) continue;

      if (DRY_RUN) {
        moved[table] = before ?? 0;
        continue;
      }

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
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (pass --write to execute)' : '⚠️  WRITE MODE'}`);
  console.log(`${'═'.repeat(70)}\n`);

  let totalMerged = 0;
  let totalDeleted = 0;
  const skipped: string[] = [];

  for (const merge of MERGES) {
    console.log(`\n── ${merge.label} ${'─'.repeat(Math.max(0, 55 - merge.label.length))}`);

    // ── Find the KEEP student ────────────────────────────────────────────────
    const keepCandidates = await findStudents(merge.keep);

    if (keepCandidates.length === 0) {
      const byName = await findStudents({ name: merge.keep.name });
      if (byName.length === 0) {
        console.log(`  SKIP — no student found matching keep spec: name="${merge.keep.name}" email="${merge.keep.email ?? '*'}"`);
        skipped.push(merge.label);
        continue;
      }
      keepCandidates.push(...byName);
    }

    const keepWithCounts = await Promise.all(
      keepCandidates.map(async s => ({ ...s, sessions: await sessionCount(s.id) }))
    );
    keepWithCounts.sort((a, b) =>
      b.sessions !== a.sessions
        ? b.sessions - a.sessions
        : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const keep = keepWithCounts[0];
    const keepDuplicates = keepWithCounts.slice(1);

    console.log(`  KEEP  ${keep.name} <${keep.email}>`);
    console.log(`        id=${keep.id}  sessions=${keep.sessions}`);

    // ── Collect DROP students ────────────────────────────────────────────────
    const toDelete: typeof keepWithCounts = [...keepDuplicates];

    for (const dropSpec of merge.drop) {
      const dropCandidates = await findStudents(dropSpec);
      for (const d of dropCandidates) {
        if (d.id === keep.id) continue;
        if (toDelete.find(x => x.id === d.id)) continue;
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
      console.log(`\n  ${DRY_RUN ? '[DRY RUN] WOULD DELETE' : 'DELETE'} ${drop.name} <${drop.email}>`);
      console.log(`         id=${drop.id}  sessions=${drop.sessions}`);

      // 1. Preserve the drop student's primary email on the keep student
      const emailResult = await preservePrimaryEmail(keep.id, keep.email, drop.email);
      console.log(`    → primary email: ${emailResult}`);

      // 2. Migrate child records (including existing student_emails rows)
      const moved = await moveChildRecords(keep.id, drop.id);
      if (Object.keys(moved).length > 0) {
        for (const [table, count] of Object.entries(moved)) {
          console.log(`    → ${DRY_RUN ? 'would move' : 'moved'} ${count} row(s) in ${table}`);
        }
      } else {
        console.log('    → no child records to move');
      }

      if (DRY_RUN) {
        console.log(`    → [DRY RUN] would delete student record`);
        totalDeleted++;
        continue;
      }

      // 3. Delete the duplicate student
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
  console.log(`  Summary${DRY_RUN ? ' (DRY RUN — nothing written)' : ''}`);
  console.log('  ───────────────────────────────────────────────');
  console.log(`  Merge groups processed : ${totalMerged}`);
  console.log(`  Duplicates ${DRY_RUN ? 'that would be' : ''} deleted : ${totalDeleted}`);
  if (skipped.length > 0) {
    console.log(`  Skipped (not found)    : ${skipped.join(', ')}`);
  }
  if (DRY_RUN) {
    console.log('\n  Re-run with --write to execute.');
  }
  console.log(`${'═'.repeat(70)}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
