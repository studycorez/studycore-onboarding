import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface Student {
  id: string;
  name: string;
  email: string;
  created_at: string;
  purchased_hours: number | null;
  status: string | null;
}

interface StudentWithSessions extends Student {
  session_count: number;
}

function normalize(name: string) {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function firstName(name: string) {
  return normalize(name).split(' ')[0];
}

function row(s: StudentWithSessions) {
  const date = new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const hrs   = s.purchased_hours != null ? `${s.purchased_hours}h purchased` : 'no hours';
  const sess  = `${s.session_count} session${s.session_count !== 1 ? 's' : ''}`;
  const stat  = s.status ?? 'active';
  return `    • ${s.name} <${s.email}>\n      id=${s.id}  created=${date}  ${sess}  ${hrs}  status=${stat}`;
}

function printGroup(label: string, groups: StudentWithSessions[][]) {
  if (groups.length === 0) {
    console.log(`  (none)\n`);
    return;
  }
  groups.forEach((group, i) => {
    console.log(`  Group ${i + 1}:`);
    group.forEach(s => console.log(row(s)));
    console.log();
  });
}

async function main() {
  // ── Fetch all students ───────────────────────────────────────────────────
  const { data: students, error } = await supabase
    .from('students')
    .select('id, name, email, created_at, purchased_hours, status')
    .order('name');

  if (error || !students) {
    console.error('Failed to fetch students:', error?.message);
    process.exit(1);
  }

  // ── Fetch session counts per student ─────────────────────────────────────
  const { data: sessionCounts } = await supabase
    .from('sessions')
    .select('student_id')
    .in('status', ['completed', 'scheduled', 'no_show', 'no_show_student', 'no_show_tutor', 'no_show_both', 'cancelled']);

  const countMap: Record<string, number> = {};
  for (const s of sessionCounts ?? []) {
    countMap[s.student_id] = (countMap[s.student_id] ?? 0) + 1;
  }

  const enriched: StudentWithSessions[] = students.map(s => ({
    ...s,
    session_count: countMap[s.id] ?? 0,
  }));

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  StudyCore — Duplicate Student Report`);
  console.log(`  Total students: ${enriched.length}`);
  console.log(`${'═'.repeat(70)}\n`);

  // ── GROUP 1: Exact name match (case-insensitive) ──────────────────────────
  const byNormalizedName = new Map<string, StudentWithSessions[]>();
  for (const s of enriched) {
    const key = normalize(s.name);
    if (!byNormalizedName.has(key)) byNormalizedName.set(key, []);
    byNormalizedName.get(key)!.push(s);
  }
  const exactNameGroups = [...byNormalizedName.values()].filter(g => g.length > 1);

  console.log(`── GROUP 1: Exact name match (case-insensitive) ──────────────────────`);
  console.log(`   ${exactNameGroups.length} group(s) found\n`);
  printGroup('exact', exactNameGroups);

  // ── GROUP 2: Same email address ───────────────────────────────────────────
  const byEmail = new Map<string, StudentWithSessions[]>();
  for (const s of enriched) {
    const key = s.email.toLowerCase().trim();
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key)!.push(s);
  }
  const sameEmailGroups = [...byEmail.values()].filter(g => g.length > 1);

  console.log(`── GROUP 2: Same email address ──────────────────────────────────────`);
  console.log(`   ${sameEmailGroups.length} group(s) found\n`);
  printGroup('email', sameEmailGroups);

  // ── GROUP 3: Same first name only (flag for manual review) ───────────────
  // Exclude any pairs already caught by groups 1 or 2.
  const exactIds  = new Set(exactNameGroups.flatMap(g => g.map(s => s.id)));
  const emailIds  = new Set(sameEmailGroups.flatMap(g => g.map(s => s.id)));
  const alreadyCaught = new Set([...exactIds, ...emailIds]);

  const byFirstName = new Map<string, StudentWithSessions[]>();
  for (const s of enriched) {
    // Skip if already flagged above
    if (alreadyCaught.has(s.id)) continue;
    const key = firstName(s.name);
    if (!byFirstName.has(key)) byFirstName.set(key, []);
    byFirstName.get(key)!.push(s);
  }

  // Only surface groups where multiple students share the same first name
  // AND at least two have different full names (so we're not just listing
  // every "Sarah" in a big school).
  const firstNameGroups = [...byFirstName.values()].filter(g => {
    if (g.length < 2) return false;
    // Require at least one pair where one name could be a partial of another,
    // e.g. "Sara" and "Sara Kalangi", or limit to ≤4 to avoid false positives.
    const names = g.map(s => normalize(s.name));
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        if (names[i].startsWith(names[j]) || names[j].startsWith(names[i])) return true;
      }
    }
    return false;
  });

  console.log(`── GROUP 3: Similar first name — one may be a partial of the other ──`);
  console.log(`   (review manually — do NOT merge without confirming)\n`);
  console.log(`   ${firstNameGroups.length} group(s) found\n`);
  printGroup('first-name', firstNameGroups);

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalFlagged = new Set([
    ...exactNameGroups.flatMap(g => g.map(s => s.id)),
    ...sameEmailGroups.flatMap(g => g.map(s => s.id)),
    ...firstNameGroups.flatMap(g => g.map(s => s.id)),
  ]).size;

  console.log(`${'═'.repeat(70)}`);
  console.log(`  Summary`);
  console.log(`  ───────────────────────────────────────────────`);
  console.log(`  Exact name duplicates : ${exactNameGroups.length} group(s)`);
  console.log(`  Same email duplicates : ${sameEmailGroups.length} group(s)`);
  console.log(`  Similar first name    : ${firstNameGroups.length} group(s) (manual review)`);
  console.log(`  Total flagged students: ${totalFlagged} of ${enriched.length}`);
  console.log(`${'═'.repeat(70)}\n`);
  console.log(`  ⚠️  Nothing was modified. Review above and decide manually.\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
