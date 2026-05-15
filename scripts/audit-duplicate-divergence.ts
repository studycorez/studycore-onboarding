/**
 * Part C — Duplicate-row divergence check (expanded for report-field safety).
 * Samples 20 random duplicate groups, checks report-field divergence,
 * and classifies each group as IDENTICAL | DIVERGED_SAFE | DIVERGED_RISKY.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/audit-duplicate-divergence.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Report-relevant fields to compare. Columns that might not exist are flagged below.
const REPORT_FIELDS = [
  'tutor_notes',
  'homework_assigned',
  'session_rating',
  'notes_submitted_at',
  'session_report_sent',
  'actual_duration_minutes',
  'fathom_recording_url',
  'status',
  // Potentially non-existent — handled gracefully:
  'topics_covered',
  'engagement',
  'report_submitted',
  'at_risk',
  'at_risk_reason',
  'practice_test_score',
  'practice_test_type',
];

type SessionRow = Record<string, any>;

function isNonNull(val: any): boolean {
  return val !== null && val !== undefined && val !== '';
}

function sameVal(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return String(a) === String(b);
}

type Classification = 'IDENTICAL' | 'DIVERGED_SAFE' | 'DIVERGED_RISKY';

interface GroupResult {
  groupKey: string;
  rowCount: number;
  earliestId: string;
  classification: Classification;
  riskyFields: string[];    // fields where a non-earliest has data the earliest lacks
  safeFields: string[];     // fields where earliest has data but non-earliest doesn't
  rows: { id: string; created_at: string; fields: Record<string, any> }[];
  recordings: { session_id: string; recording_start_time: string | null }[];
}

async function main() {
  console.log('Loading all sessions to find duplicate groups…');

  // Collect all session rows (paginated — PostgREST 1000-row cap)
  const allSessions: SessionRow[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('student_id')
      .order('scheduled_at')
      .order('created_at')
      .range(page * 1000, page * 1000 + 999);

    if (error) { console.error('sessions fetch error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    allSessions.push(...data);
    if (data.length < 1000) break;
    page++;
  }

  console.log(`Loaded ${allSessions.length} session rows.`);

  // Detect available columns from first row
  const sampleRow = allSessions[0] ?? {};
  const availableFields = REPORT_FIELDS.filter(f => f in sampleRow);
  const missingFields = REPORT_FIELDS.filter(f => !(f in sampleRow));
  if (missingFields.length > 0) {
    console.log(`\nColumns NOT present on sessions table: ${missingFields.join(', ')}`);
  }
  console.log(`Columns present and checked: ${availableFields.join(', ')}`);

  // Build duplicate groups — same (student_id, tutor_id, scheduled_at)
  // tutor_id may be null; treat nulls as their own group key only if both are null
  const groups = new Map<string, SessionRow[]>();
  for (const s of allSessions) {
    const key = `${s.student_id}|${s.tutor_id ?? 'NULL'}|${s.scheduled_at}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  const dupGroups = [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, rows }));

  console.log(`\nTotal duplicate groups: ${dupGroups.length}`);

  if (dupGroups.length === 0) {
    console.log('No duplicates found.');
    return;
  }

  // Sample 20 random groups
  const SAMPLE = 20;
  const shuffled = [...dupGroups].sort(() => Math.random() - 0.5);
  const sample = shuffled.slice(0, Math.min(SAMPLE, shuffled.length));

  // Fetch recording_start_time for all sessions in sample groups
  const allSampleIds = sample.flatMap(g => g.rows.map((r: SessionRow) => r.id));
  const { data: recordings } = await supabase
    .from('session_recordings')
    .select('session_id, recording_start_time, is_primary')
    .in('session_id', allSampleIds);

  const recordingMap = new Map<string, string | null>();
  for (const rec of recordings ?? []) {
    if (!recordingMap.has(rec.session_id)) {
      recordingMap.set(rec.session_id, rec.recording_start_time);
    }
  }

  // Classify each group
  const results: GroupResult[] = [];

  for (const { key, rows } of sample) {
    // Sort by created_at asc — earliest is canonical
    rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const earliest = rows[0];
    const nonEarliest = rows.slice(1);

    const riskyFields: string[] = [];
    const safeFields: string[] = [];
    let diverged = false;

    for (const field of availableFields) {
      const earliestVal = earliest[field];
      const nonEarliestVals = nonEarliest.map((r: SessionRow) => r[field]);

      // Does any non-earliest row have non-null data that the earliest lacks?
      const earliestIsEmpty = !isNonNull(earliestVal);
      const anyNonEarliestHasData = nonEarliestVals.some(v => isNonNull(v));
      const allSame = nonEarliestVals.every(v => sameVal(earliestVal, v));

      if (!allSame) {
        diverged = true;
        if (earliestIsEmpty && anyNonEarliestHasData) {
          riskyFields.push(field);
        } else {
          safeFields.push(field);
        }
      }
    }

    // Also check recording_start_time (from session_recordings)
    const earliestRec = recordingMap.get(earliest.id) ?? null;
    const nonEarliestRecs = nonEarliest.map((r: SessionRow) => recordingMap.get(r.id) ?? null);
    const recAllSame = nonEarliestRecs.every(v => sameVal(earliestRec, v));
    if (!recAllSame) {
      diverged = true;
      if (!isNonNull(earliestRec) && nonEarliestRecs.some(v => isNonNull(v))) {
        riskyFields.push('recording_start_time');
      } else {
        safeFields.push('recording_start_time');
      }
    }

    let classification: Classification;
    if (!diverged) {
      classification = 'IDENTICAL';
    } else if (riskyFields.length === 0) {
      classification = 'DIVERGED_SAFE';
    } else {
      classification = 'DIVERGED_RISKY';
    }

    results.push({
      groupKey: key,
      rowCount: rows.length,
      earliestId: earliest.id,
      classification,
      riskyFields,
      safeFields,
      rows: rows.map((r: SessionRow) => ({
        id: r.id,
        created_at: r.created_at,
        fields: Object.fromEntries(availableFields.map(f => [f, r[f]])),
      })),
      recordings: rows.map((r: SessionRow) => ({
        session_id: r.id,
        recording_start_time: recordingMap.get(r.id) ?? null,
      })),
    });
  }

  // ── Output ─────────────────────────────────────────────────────────────────

  const countIdent = results.filter(r => r.classification === 'IDENTICAL').length;
  const countSafe  = results.filter(r => r.classification === 'DIVERGED_SAFE').length;
  const countRisky = results.filter(r => r.classification === 'DIVERGED_RISKY').length;

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('PART C — DUPLICATE GROUP DIVERGENCE REPORT (sample n=20)');
  console.log('══════════════════════════════════════════════════════════════\n');

  console.log(`IDENTICAL      : ${countIdent}`);
  console.log(`DIVERGED_SAFE  : ${countSafe}   (earliest has data; non-earliest don't)`);
  console.log(`DIVERGED_RISKY : ${countRisky}   (non-earliest has data the earliest lacks)`);
  console.log('');

  // Summary table
  console.log('Group-by-group summary:');
  console.log('─'.repeat(120));
  console.log(
    'Group'.padEnd(60) +
    'Rows'.padEnd(6) +
    'Classification'.padEnd(18) +
    'Risky fields' +
    ' | Safe fields'
  );
  console.log('─'.repeat(120));

  for (const r of results) {
    const groupShort = r.groupKey.length > 58 ? r.groupKey.slice(0, 55) + '…' : r.groupKey;
    console.log(
      groupShort.padEnd(60) +
      String(r.rowCount).padEnd(6) +
      r.classification.padEnd(18) +
      (r.riskyFields.length ? r.riskyFields.join(', ') : '—') +
      ' | ' +
      (r.safeFields.length ? r.safeFields.join(', ') : '—')
    );
  }
  console.log('─'.repeat(120));

  // Detailed view of DIVERGED_RISKY groups
  const riskyGroups = results.filter(r => r.classification === 'DIVERGED_RISKY');
  if (riskyGroups.length > 0) {
    console.log('\n══ RISKY GROUP DETAIL (non-earliest has report data earliest lacks) ══\n');
    for (const g of riskyGroups) {
      console.log(`Group: ${g.groupKey}`);
      console.log(`Earliest session (canonical): ${g.earliestId}`);
      console.log(`Risky fields: ${g.riskyFields.join(', ')}`);
      console.log('');
      for (const row of g.rows) {
        const marker = row.id === g.earliestId ? '[EARLIEST]' : '[DUPLICATE]';
        console.log(`  ${marker} session_id=${row.id}  created_at=${row.created_at}`);
        for (const f of g.riskyFields) {
          const val = row.fields[f];
          console.log(`    ${f}: ${val === null ? 'NULL' : JSON.stringify(val)}`);
        }
      }
      console.log('');
    }
  } else {
    console.log('\n✅ No DIVERGED_RISKY groups in sample — naive earliest-wins deletion appears safe.');
  }

  // Detailed view of DIVERGED_SAFE groups
  const safeGroups = results.filter(r => r.classification === 'DIVERGED_SAFE');
  if (safeGroups.length > 0) {
    console.log('\n══ SAFE DIVERGENCE DETAIL (earliest has data; non-earliest are empty) ══\n');
    for (const g of safeGroups) {
      console.log(`Group: ${g.groupKey}`);
      console.log(`Safe-diverged fields: ${g.safeFields.join(', ')}`);
    }
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  if (countRisky > 0) {
    console.log('⚠️  DIVERGED_RISKY > 0. Dedup strategy must MERGE non-null report');
    console.log('   fields from non-earliest rows onto canonical before deletion.');
  } else {
    console.log('✅ All sampled groups safe for earliest-wins deletion (no merge needed).');
  }
  console.log('══════════════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error(e); process.exit(1); });
