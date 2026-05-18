/**
 * Backfill Zoom attendance for completed sessions.
 *
 * Fetches the Zoom participant report for each completed session that has a
 * zoom_meeting_id and writes tutor_attended, student_attended, and
 * actual_runtime_minutes back to the sessions table.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/backfill-zoom-attendance.ts
 *   npx ts-node --project tsconfig.scripts.json scripts/backfill-zoom-attendance.ts \
 *     --start-date 2026-05-01 --end-date 2026-05-15
 *   npx ts-node --project tsconfig.scripts.json scripts/backfill-zoom-attendance.ts --dry-run
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { syncSessionAttendance, AttendanceSyncResult } from '../src/lib/zoom-attendance';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun   = args.includes('--dry-run');
const startDate  = args[args.indexOf('--start-date') + 1] ?? null;
const endDate    = args[args.indexOf('--end-date')   + 1] ?? null;

const BATCH_SLEEP_MS = 1000; // 1s between batches of 10
const BATCH_SIZE     = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isoDate(d: string) {
  return d.includes('T') ? d : d + 'T00:00:00.000Z';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Zoom Attendance Backfill ===`);
  console.log(`Dry run: ${isDryRun}`);
  if (startDate) console.log(`Start date: ${startDate}`);
  if (endDate)   console.log(`End date:   ${endDate}`);
  console.log('');

  // Fetch completed sessions with a zoom_meeting_id
  let query = supabase
    .from('sessions')
    .select('id, zoom_meeting_id, scheduled_at, tutor:tutors(name), student:students(name)')
    .eq('status', 'completed')
    .not('zoom_meeting_id', 'is', null)
    .order('scheduled_at', { ascending: false });

  if (startDate) query = query.gte('scheduled_at', isoDate(startDate));
  if (endDate)   query = query.lte('scheduled_at', endDate + 'T23:59:59.999Z');

  const { data: sessions, error } = await query;
  if (error) {
    console.error('Failed to fetch sessions:', error.message);
    process.exit(1);
  }

  const total = (sessions ?? []).length;
  console.log(`Found ${total} session(s) with zoom_meeting_id in range.\n`);

  if (total === 0) {
    console.log('Nothing to process. Done.');
    return;
  }

  if (isDryRun) {
    console.log('[DRY RUN] Would process the following sessions:');
    for (const s of sessions!) {
      const tutor   = (s as any).tutor?.name   ?? '—';
      const student = (s as any).student?.name ?? '—';
      console.log(`  ${s.id}  ${s.scheduled_at?.slice(0, 10)}  ${tutor} / ${student}  meeting=${s.zoom_meeting_id}`);
    }
    console.log('\n[DRY RUN] No DB writes performed.');
    return;
  }

  // Process in batches of 10 with 1s sleep between batches
  const rows: (AttendanceSyncResult & { scheduled_at: string; tutor: string; student: string })[] = [];
  const errors: { session_id: string; error: string }[] = [];

  for (let i = 0; i < sessions!.length; i += BATCH_SIZE) {
    const batch = sessions!.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(total / BATCH_SIZE)} (${batch.length} sessions)…`);

    for (const s of batch) {
      const tutor   = (s as any).tutor?.name   ?? '—';
      const student = (s as any).student?.name ?? '—';
      try {
        const result = await syncSessionAttendance(s.id);
        const row = {
          ...result,
          scheduled_at: (s.scheduled_at as string).slice(0, 10),
          tutor,
          student,
        };
        rows.push(row);
        const attended = result.tutor_attended === null ? 'pending' : result.tutor_attended ? '✓' : '✗';
        const reason   = result.skipped_reason ? ` [${result.skipped_reason}]` : '';
        console.log(
          `  ${s.id.slice(0, 8)}…  ${tutor} / ${student}  tutor_attended=${attended}  runtime=${result.actual_runtime_minutes ?? '—'}min${reason}`
        );
      } catch (err: any) {
        console.error(`  ERROR ${s.id}: ${err.message}`);
        errors.push({ session_id: s.id, error: err.message });
      }
    }

    if (i + BATCH_SIZE < total) {
      await sleep(BATCH_SLEEP_MS);
    }
  }

  // ── Write CSV outputs ────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.join(process.cwd(), 'scripts', 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const resultsCsv = path.join(outDir, `zoom-attendance-${today}.csv`);
  const header = 'session_id,scheduled_at,tutor,student,tutor_attended,student_attended,actual_runtime_minutes,skipped_reason\n';
  const csvRows = rows.map(r =>
    [
      r.session_id,
      r.scheduled_at,
      `"${r.tutor}"`,
      `"${r.student}"`,
      r.tutor_attended === null ? '' : String(r.tutor_attended),
      r.student_attended === null ? '' : String(r.student_attended),
      r.actual_runtime_minutes ?? '',
      r.skipped_reason ?? '',
    ].join(',')
  );
  fs.writeFileSync(resultsCsv, header + csvRows.join('\n') + '\n');

  if (errors.length > 0) {
    const errCsv = path.join(outDir, `zoom-attendance-errors-${today}.csv`);
    fs.writeFileSync(
      errCsv,
      'session_id,error\n' + errors.map(e => `${e.session_id},"${e.error.replace(/"/g, '""')}"`).join('\n') + '\n'
    );
    console.log(`\n⚠  ${errors.length} error(s) written to ${errCsv}`);
  }

  console.log(`\n✅ Done. ${rows.length} processed, ${errors.length} errors.`);
  console.log(`   Results: ${resultsCsv}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
