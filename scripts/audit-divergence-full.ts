/**
 * Part C (full population) — Count DIVERGED_RISKY duplicate groups across all sessions.
 *
 * A group is DIVERGED_RISKY if any non-earliest row has a non-null value for a report field
 * where the earliest row is null.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/audit-divergence-full.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Fields that, if non-null on a non-earliest row but null on the earliest, require a MERGE step.
const RISKY_FIELDS = [
  'tutor_notes',
  'homework_assigned',
  'session_rating',
  'notes_submitted_at',
  'session_report_sent',
  'report_submitted',
  'topics_covered',
  'at_risk_reason',
  'practice_test_score',
  'fathom_recording_url',
];

const SELECT_COLS = [
  'id', 'student_id', 'tutor_id', 'scheduled_at', 'created_at',
  ...RISKY_FIELDS,
].join(', ');

type Row = Record<string, any>;

function isNonNull(v: any): boolean {
  return v !== null && v !== undefined && v !== '';
}

async function main() {
  console.log('Loading all sessions (paginated)…');

  const all: Row[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('sessions')
      .select(SELECT_COLS)
      .order('student_id')
      .order('scheduled_at')
      .order('created_at')
      .range(page * 1000, page * 1000 + 999);
    if (error) { console.error('fetch error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    page++;
  }

  console.log(`Loaded ${all.length} session rows.`);

  // Verify which of RISKY_FIELDS actually exist on the table
  const sampleRow = all[0] ?? {};
  const presentFields = RISKY_FIELDS.filter(f => f in sampleRow);
  const missingFields = RISKY_FIELDS.filter(f => !(f in sampleRow));
  if (missingFields.length > 0) {
    console.log(`Columns absent from sessions table (skipped): ${missingFields.join(', ')}`);
  }
  console.log(`Checking fields: ${presentFields.join(', ')}\n`);

  // Group by (student_id, tutor_id, scheduled_at)
  const groups = new Map<string, Row[]>();
  for (const s of all) {
    const key = `${s.student_id}|${s.tutor_id ?? 'NULL'}|${s.scheduled_at}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  const dupGroups = [...groups.values()].filter(rows => rows.length > 1);
  console.log(`Total duplicate groups (full population): ${dupGroups.length}`);

  const riskyGroups: { groupKey: string; riskyFields: string[]; earliestId: string; nonEarliestIds: string[] }[] = [];

  for (const rows of dupGroups) {
    // Sort by created_at asc; earliest = canonical
    rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const earliest = rows[0];
    const nonEarliest = rows.slice(1);

    const riskyFields: string[] = [];
    for (const field of presentFields) {
      const earliestVal = earliest[field];
      // Risky: earliest is null AND at least one non-earliest has a value
      if (!isNonNull(earliestVal) && nonEarliest.some(r => isNonNull(r[field]))) {
        riskyFields.push(field);
      }
    }

    if (riskyFields.length > 0) {
      const key = `${rows[0].student_id}|${rows[0].tutor_id ?? 'NULL'}|${rows[0].scheduled_at}`;
      riskyGroups.push({
        groupKey: key,
        riskyFields,
        earliestId: earliest.id,
        nonEarliestIds: nonEarliest.map(r => r.id),
      });
    }
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('PART C (FULL POPULATION) — DIVERGED_RISKY COUNT');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`Total duplicate groups  : ${dupGroups.length}`);
  console.log(`DIVERGED_RISKY groups   : ${riskyGroups.length}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (riskyGroups.length === 0) {
    console.log('✅ DIVERGED_RISKY = 0 across full population.');
    console.log('   Naive earliest-wins deletion is safe — no MERGE step required.');
  } else {
    console.log(`⚠️  ${riskyGroups.length} group(s) require a MERGE step before deletion:\n`);
    for (const g of riskyGroups) {
      console.log(`  Group key : ${g.groupKey}`);
      console.log(`  Earliest  : ${g.earliestId}  ← canonical (null on risky fields)`);
      console.log(`  Duplicates: ${g.nonEarliestIds.join(', ')}`);
      console.log(`  Risky fields: ${g.riskyFields.join(', ')}`);
      console.log('');

      // Fetch and print the actual values for context
      const { data: detailRows } = await supabase
        .from('sessions')
        .select(['id', 'created_at', ...g.riskyFields].join(', '))
        .in('id', [g.earliestId, ...g.nonEarliestIds]);

      const typedRows = (detailRows ?? []) as Row[];
      typedRows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      for (const r of typedRows) {
        const label = r.id === g.earliestId ? '[EARLIEST]' : '[DUPLICATE]';
        console.log(`    ${label} ${r.id}  created=${r.created_at}`);
        for (const f of g.riskyFields) {
          console.log(`      ${f}: ${r[f] === null ? 'NULL' : JSON.stringify(r[f])}`);
        }
      }
      console.log('');
    }

    console.log('ACTION REQUIRED: Dedup script must COALESCE these fields from');
    console.log('non-earliest rows onto the canonical before deleting duplicates.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
