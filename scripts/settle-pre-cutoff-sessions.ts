/**
 * settle-pre-cutoff-sessions.ts
 *
 * One-time script: stamps all pre-cutoff sessions to a sentinel
 * "Historical (pre-May 15)" payroll run so they are excluded from
 * future payroll generation runs.
 *
 * Usage:
 *   npx tsx scripts/settle-pre-cutoff-sessions.ts           # dry run — shows count
 *   npx tsx scripts/settle-pre-cutoff-sessions.ts --commit  # writes to DB
 *
 * Idempotent: safe to run multiple times. Re-running in --commit mode with
 * no remaining unstamped sessions prints "0 sessions stamped" and exits.
 *
 * The sentinel run is identified by its exact period_start ('2000-01-01')
 * and period_end ('2026-05-14'). It is created if not found.
 */

import { createClient } from '@supabase/supabase-js';

const PAYROLL_CUTOFF = '2026-05-15T00:00:00Z';

const HISTORICAL_PERIOD_START = '2000-01-01';
const HISTORICAL_PERIOD_END   = '2026-05-14';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const commit = process.argv.includes('--commit');

async function main() {
  console.log(`\nsettle-pre-cutoff-sessions — ${commit ? 'COMMIT MODE' : 'DRY RUN'}`);
  console.log(`Cutoff: ${PAYROLL_CUTOFF}\n`);

  // ── Dry-run count ─────────────────────────────────────────────────────────
  const { count, error: countErr } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .lt('scheduled_at', PAYROLL_CUTOFF)
    .is('paid_in_run_id', null);

  if (countErr) {
    console.error('Error counting sessions:', countErr.message);
    process.exit(1);
  }

  console.log(`Sessions scheduled before ${PAYROLL_CUTOFF} with paid_in_run_id IS NULL: ${count ?? 0}`);

  if (count === 0) {
    console.log('Nothing to stamp. Exiting.');
    process.exit(0);
  }

  if (!commit) {
    console.log('\nDry run — pass --commit to stamp these sessions.');
    process.exit(0);
  }

  // ── Find or create the Historical sentinel run ────────────────────────────
  const { data: existing } = await supabase
    .from('payroll_runs')
    .select('id')
    .eq('period_start', HISTORICAL_PERIOD_START)
    .maybeSingle();

  let historicalRunId: string;

  if (existing) {
    historicalRunId = (existing as any).id as string;
    console.log(`Found existing Historical run: ${historicalRunId}`);
  } else {
    const { data: created, error: createErr } = await supabase
      .from('payroll_runs')
      .insert({
        period_start:  HISTORICAL_PERIOD_START,
        period_end:    HISTORICAL_PERIOD_END,
        total_amount:  0,
        status:        'paid',
      })
      .select('id')
      .single();

    if (createErr || !created) {
      console.error('Error creating Historical run:', createErr?.message);
      process.exit(1);
    }
    historicalRunId = (created as any).id as string;
    console.log(`Created Historical run: ${historicalRunId}`);
  }

  // ── Stamp sessions in batches ─────────────────────────────────────────────
  const BATCH_SIZE = 200;
  let totalStamped = 0;

  while (true) {
    // Fetch a batch of unstamped pre-cutoff sessions
    const { data: batch, error: fetchErr } = await supabase
      .from('sessions')
      .select('id')
      .lt('scheduled_at', PAYROLL_CUTOFF)
      .is('paid_in_run_id', null)
      .limit(BATCH_SIZE);

    if (fetchErr) {
      console.error('Error fetching batch:', fetchErr.message);
      process.exit(1);
    }
    if (!batch?.length) break;

    const ids = batch.map((s: any) => s.id as string);
    const { error: stampErr } = await supabase
      .from('sessions')
      .update({ paid_in_run_id: historicalRunId })
      .in('id', ids);

    if (stampErr) {
      console.error(`Error stamping batch (offset ${totalStamped}):`, stampErr.message);
      process.exit(1);
    }

    totalStamped += ids.length;
    process.stdout.write(`  Stamped ${totalStamped} / ${count} sessions…\r`);
  }

  console.log(`\nDone. ${totalStamped} sessions stamped to Historical run (${historicalRunId}).`);
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
