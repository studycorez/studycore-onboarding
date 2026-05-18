/**
 * Dedup Fathom-sync duplicate sessions.
 *
 * Fathom auto-sync can create a parallel session row for the same booked time
 * (same tutor + student, overlapping window). This script identifies those
 * pairs, classifies them, and writes two CSVs:
 *
 *   scripts/output/dedup-fathom-to-delete-YYYY-MM-DD.csv  — safe to delete
 *   scripts/output/dedup-fathom-ambiguous-YYYY-MM-DD.csv  — manual review
 *
 * Dry-run by default (no DB writes). Pass --write to execute deletes.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/dedup-fathom-sessions.ts
 *   npx ts-node --project tsconfig.scripts.json scripts/dedup-fathom-sessions.ts \
 *     --start-date 2026-05-01 --end-date 2026-05-16
 *   npx ts-node --project tsconfig.scripts.json scripts/dedup-fathom-sessions.ts --write
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const WRITE_MODE   = args.includes('--write');
const startDateArg = args[args.indexOf('--start-date') + 1] ?? null;
const endDateArg   = args[args.indexOf('--end-date')   + 1] ?? null;

// ── Helpers ───────────────────────────────────────────────────────────────────
type Row = Record<string, any>;

async function fetchAllPaginated(
  table: string,
  select: string,
  applyFilters: (q: any) => any = q => q,
): Promise<Row[]> {
  const all: Row[] = [];
  const PAGE = 1000;
  const SANITY = 100;
  for (let page = 0; page < SANITY; page++) {
    let q = supabase.from(table).select(select);
    q = applyFilters(q);
    q = q.order('id').range(page * PAGE, page * PAGE + PAGE - 1);
    const { data, error } = await q;
    if (error) throw new Error(`fetchAllPaginated(${table}): ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

function csvEscape(v: any): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n'))
    return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function csvRow(...vals: any[]): string {
  return vals.map(csvEscape).join(',');
}

const CSV_HEADER = [
  'pair_id', 'classification',
  'tutor_name', 'student_name',
  'session_to_keep_id', 'session_to_keep_time', 'session_to_keep_duration',
  'session_to_delete_id', 'session_to_delete_time', 'session_to_delete_duration',
  'reason',
].join(',');

interface PairRow {
  pair_id: number;
  classification: string;
  tutor_name: string;
  student_name: string;
  session_to_keep_id: string;
  session_to_keep_time: string;
  session_to_keep_duration: number;
  session_to_delete_id: string;
  session_to_delete_time: string;
  session_to_delete_duration: number;
  reason: string;
}

function pairToCsvRow(p: PairRow): string {
  return csvRow(
    p.pair_id, p.classification,
    p.tutor_name, p.student_name,
    p.session_to_keep_id, p.session_to_keep_time, p.session_to_keep_duration,
    p.session_to_delete_id, p.session_to_delete_time, p.session_to_delete_duration,
    p.reason,
  );
}

/**
 * Returns true when the scheduled_at timestamp is "clean":
 * minutes are 00 or 30, and seconds are 00.
 * e.g. 14:00:00 or 15:30:00 → true
 *      14:03:27 or 15:28:00 → false
 */
function isCleanTimestamp(iso: string): boolean {
  const d = new Date(iso);
  const minutes = d.getUTCMinutes();
  const seconds = d.getUTCSeconds();
  return (minutes === 0 || minutes === 30) && seconds === 0;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Mode: ${WRITE_MODE ? 'WRITE (deletes will run)' : 'DRY-RUN (no DB changes)'}`);
  if (startDateArg) console.log(`Date range: ${startDateArg} → ${endDateArg ?? 'present'}`);
  else              console.log('Date range: all time');
  console.log();

  // 1. Fetch all completed sessions (with tutor + student names) in range
  console.log('Fetching sessions…');
  const sessions = await fetchAllPaginated(
    'sessions',
    'id, tutor_id, student_id, scheduled_at, duration_minutes, tutor:tutors(name), student:students(name)',
    q => {
      q = q.eq('status', 'completed');
      if (startDateArg) q = q.gte('scheduled_at', startDateArg + 'T00:00:00.000Z');
      if (endDateArg)   q = q.lte('scheduled_at', endDateArg   + 'T23:59:59.999Z');
      return q;
    },
  );
  console.log(`Fetched ${sessions.length} completed sessions.`);

  // 2. Group by (tutor_id, student_id)
  const groups = new Map<string, Row[]>();
  for (const s of sessions) {
    if (!s.tutor_id || !s.student_id) continue;
    const key = `${s.tutor_id}|${s.student_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  console.log(`Grouped into ${groups.size} (tutor, student) pairs.\n`);

  // 3. Find overlapping pairs within each group
  const toDelete:   PairRow[] = [];
  const ambiguous:  PairRow[] = [];
  let pairId = 0;

  for (const group of groups.values()) {
    // Sort by scheduled_at ascending for stable pair detection
    group.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

    for (let i = 0; i < group.length; i++) {
      const a = group[i];
      const aStart = new Date(a.scheduled_at).getTime();
      const aEnd   = aStart + (a.duration_minutes ?? 60) * 60_000;

      for (let j = i + 1; j < group.length; j++) {
        const b = group[j];
        const bStart = new Date(b.scheduled_at).getTime();

        // If B starts at or after A's end, no overlap (and nothing later will overlap)
        if (bStart >= aEnd) break;

        // Overlapping pair found: classify
        pairId++;
        const tutorName   = (a.tutor   as any)?.name   ?? a.tutor_id;
        const studentName = (a.student as any)?.name ?? a.student_id;
        const aDur = a.duration_minutes ?? 0;
        const bDur = b.duration_minutes ?? 0;
        const aClean = isCleanTimestamp(a.scheduled_at);
        const bClean = isCleanTimestamp(b.scheduled_at);

        let classification: string;
        let keepId: string, deleteId: string;
        let keepTime: string, deleteTime: string;
        let keepDur: number, deleteDur: number;
        let reason: string;

        if (aDur < 5 || bDur < 5) {
          // MICRO_DUPE: one session is under 5 minutes
          classification = 'MICRO_DUPE';
          if (aDur < bDur) {
            deleteId = a.id; deleteTime = a.scheduled_at; deleteDur = aDur;
            keepId   = b.id; keepTime   = b.scheduled_at; keepDur   = bDur;
            reason = `Session ${a.id} has micro duration ${aDur}min (<5)`;
          } else {
            deleteId = b.id; deleteTime = b.scheduled_at; deleteDur = bDur;
            keepId   = a.id; keepTime   = a.scheduled_at; keepDur   = aDur;
            reason = `Session ${b.id} has micro duration ${bDur}min (<5)`;
          }
          toDelete.push({ pair_id: pairId, classification, tutor_name: tutorName, student_name: studentName, session_to_keep_id: keepId, session_to_keep_time: keepTime, session_to_keep_duration: keepDur, session_to_delete_id: deleteId, session_to_delete_time: deleteTime, session_to_delete_duration: deleteDur, reason });

        } else if (aClean && !bClean) {
          // A is the canonical booked session; B is Fathom-flavored
          classification = 'FATHOM_DUPE';
          keepId   = a.id; keepTime   = a.scheduled_at; keepDur   = aDur;
          deleteId = b.id; deleteTime = b.scheduled_at; deleteDur = bDur;
          reason = `${b.id} has non-clean timestamp (Fathom-flavored); ${a.id} is clean`;
          toDelete.push({ pair_id: pairId, classification, tutor_name: tutorName, student_name: studentName, session_to_keep_id: keepId, session_to_keep_time: keepTime, session_to_keep_duration: keepDur, session_to_delete_id: deleteId, session_to_delete_time: deleteTime, session_to_delete_duration: deleteDur, reason });

        } else if (!aClean && bClean) {
          // B is the canonical booked session; A is Fathom-flavored
          classification = 'FATHOM_DUPE';
          keepId   = b.id; keepTime   = b.scheduled_at; keepDur   = bDur;
          deleteId = a.id; deleteTime = a.scheduled_at; deleteDur = aDur;
          reason = `${a.id} has non-clean timestamp (Fathom-flavored); ${b.id} is clean`;
          toDelete.push({ pair_id: pairId, classification, tutor_name: tutorName, student_name: studentName, session_to_keep_id: keepId, session_to_keep_time: keepTime, session_to_keep_duration: keepDur, session_to_delete_id: deleteId, session_to_delete_time: deleteTime, session_to_delete_duration: deleteDur, reason });

        } else if (!aClean && !bClean) {
          // PARTIAL_FATHOM: neither clean; keep the longer one
          classification = 'PARTIAL_FATHOM';
          if (aDur >= bDur) {
            keepId   = a.id; keepTime   = a.scheduled_at; keepDur   = aDur;
            deleteId = b.id; deleteTime = b.scheduled_at; deleteDur = bDur;
            reason = `Neither has clean timestamp; keeping longer session (${aDur}min vs ${bDur}min)`;
          } else {
            keepId   = b.id; keepTime   = b.scheduled_at; keepDur   = bDur;
            deleteId = a.id; deleteTime = a.scheduled_at; deleteDur = aDur;
            reason = `Neither has clean timestamp; keeping longer session (${bDur}min vs ${aDur}min)`;
          }
          toDelete.push({ pair_id: pairId, classification, tutor_name: tutorName, student_name: studentName, session_to_keep_id: keepId, session_to_keep_time: keepTime, session_to_keep_duration: keepDur, session_to_delete_id: deleteId, session_to_delete_time: deleteTime, session_to_delete_duration: deleteDur, reason });

        } else {
          // AMBIGUOUS: both have clean timestamps — manual review only
          classification = 'AMBIGUOUS';
          // Stable ordering: keep the earlier-starting one as "keep" for display
          keepId   = a.id; keepTime   = a.scheduled_at; keepDur   = aDur;
          deleteId = b.id; deleteTime = b.scheduled_at; deleteDur = bDur;
          reason = 'Both sessions have clean timestamps — cannot determine canonical; manual review required';
          ambiguous.push({ pair_id: pairId, classification, tutor_name: tutorName, student_name: studentName, session_to_keep_id: keepId, session_to_keep_time: keepTime, session_to_keep_duration: keepDur, session_to_delete_id: deleteId, session_to_delete_time: deleteTime, session_to_delete_duration: deleteDur, reason });
        }
      }
    }
  }

  // 4. Write CSVs
  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });

  const deleteFile    = path.join(outDir, `dedup-fathom-to-delete-${today}.csv`);
  const ambiguousFile = path.join(outDir, `dedup-fathom-ambiguous-${today}.csv`);

  fs.writeFileSync(deleteFile,    [CSV_HEADER, ...toDelete.map(pairToCsvRow)].join('\n') + '\n');
  fs.writeFileSync(ambiguousFile, [CSV_HEADER, ...ambiguous.map(pairToCsvRow)].join('\n') + '\n');

  // 5. Console summary
  const byClass: Record<string, number> = {};
  for (const p of [...toDelete, ...ambiguous]) {
    byClass[p.classification] = (byClass[p.classification] ?? 0) + 1;
  }

  console.log('─'.repeat(60));
  console.log('SUMMARY');
  console.log('─'.repeat(60));
  console.log(`Total overlapping pairs found: ${toDelete.length + ambiguous.length}`);
  console.log();
  for (const [cls, count] of Object.entries(byClass).sort()) {
    console.log(`  ${cls.padEnd(20)} ${count}`);
  }
  console.log();
  console.log(`To-delete CSV  (${toDelete.length} rows):   ${deleteFile}`);
  console.log(`Ambiguous CSV  (${ambiguous.length} rows):  ${ambiguousFile}`);
  console.log();

  if (!WRITE_MODE) {
    console.log('DRY-RUN complete. No DB changes made.');
    console.log('Re-run with --write to execute deletes from the to-delete CSV.');
    return;
  }

  // 6. WRITE MODE: read to-delete CSV and delete those rows
  console.log('WRITE MODE — executing deletes…');

  // Re-read the CSV we just wrote for determinism (same input → same output)
  const lines = fs.readFileSync(deleteFile, 'utf8').trim().split('\n');
  const idsToDelete: string[] = [];
  for (const line of lines.slice(1)) { // skip header
    // session_to_delete_id is column index 7 (0-based)
    const cols = line.split(',');
    const id = cols[7]?.replace(/^"|"$/g, '').trim();
    if (id) idsToDelete.push(id);
  }

  if (idsToDelete.length === 0) {
    console.log('No rows to delete.');
    return;
  }

  console.log(`Deleting ${idsToDelete.length} session(s)…`);
  let deleted = 0;
  const BATCH = 50;
  for (let i = 0; i < idsToDelete.length; i += BATCH) {
    const chunk = idsToDelete.slice(i, i + BATCH);
    const { error, count } = await supabase
      .from('sessions')
      .delete({ count: 'exact' })
      .in('id', chunk);
    if (error) {
      console.error(`Delete batch ${i / BATCH + 1} failed:`, error.message);
      process.exit(1);
    }
    deleted += count ?? chunk.length;
  }
  console.log(`Deleted ${deleted} session row(s).`);
}

main().catch(err => { console.error(err); process.exit(1); });
