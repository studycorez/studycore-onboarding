import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const CONFLICT_FIELDS = ['name', 'email', 'parent_email', 'target_score', 'sat_date'] as const;

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const body = await req.json().catch(() => ({}));
  const { canonical_id, duplicate_id, field_decisions, confirmation } = body;

  // ── Validation ─────────────────────────────────────────────────────────

  if (!canonical_id || !duplicate_id) {
    return NextResponse.json({ error: 'canonical_id and duplicate_id are required' }, { status: 400 });
  }
  if (canonical_id === duplicate_id) {
    return NextResponse.json({ error: 'Cannot merge a student with itself' }, { status: 400 });
  }
  if (confirmation !== true) {
    return NextResponse.json({ error: 'confirmation must be exactly true' }, { status: 400 });
  }
  if (field_decisions != null && typeof field_decisions !== 'object') {
    return NextResponse.json({ error: 'field_decisions must be an object' }, { status: 400 });
  }
  for (const [key, val] of Object.entries(field_decisions ?? {})) {
    if (val !== 'canonical' && val !== 'duplicate') {
      return NextResponse.json({ error: `field_decisions.${key} must be 'canonical' or 'duplicate'` }, { status: 400 });
    }
  }

  // ── STEP 1: Re-fetch fresh state (prevent TOCTOU) ──────────────────────

  const [{ data: canonical }, { data: duplicate }] = await Promise.all([
    supabase.from('students').select('*').eq('id', canonical_id).maybeSingle(),
    supabase.from('students').select('*').eq('id', duplicate_id).maybeSingle(),
  ]);

  if (!canonical) return NextResponse.json({ error: 'Canonical student not found' }, { status: 404 });
  if (!duplicate) return NextResponse.json({ error: 'Duplicate student not found' }, { status: 404 });
  if (canonical.merged_into_id) return NextResponse.json({ error: 'Canonical student is already merged' }, { status: 400 });
  if (duplicate.merged_into_id) return NextResponse.json({ error: 'Duplicate student is already merged' }, { status: 400 });

  // Fresh contract conflicts
  const [{ data: canonicalContracts }, { data: duplicateContracts }] = await Promise.all([
    supabase.from('contracts')
      .select('id, tutor_id, signed_at, hourly_rate, status')
      .eq('student_id', canonical_id)
      .eq('status', 'signed'),
    supabase.from('contracts')
      .select('id, tutor_id, signed_at, hourly_rate, status')
      .eq('student_id', duplicate_id)
      .eq('status', 'signed'),
  ]);

  interface ContractConflict {
    tutor_id: string;
    canonical_contract_id: string;
    duplicate_contract_id: string;
    will_keep: 'canonical' | 'duplicate';
    winner_id: string;
    loser_id: string;
  }

  const contractConflicts: ContractConflict[] = [];
  const conflictContractIds = new Set<string>();

  for (const cc of (canonicalContracts ?? []) as any[]) {
    const dc = ((duplicateContracts ?? []) as any[]).find((d: any) => d.tutor_id === cc.tutor_id);
    if (!dc) continue;

    const ccSignedAt = cc.signed_at ? new Date(cc.signed_at).getTime() : 0;
    const dcSignedAt = dc.signed_at ? new Date(dc.signed_at).getTime() : 0;
    const willKeep = dcSignedAt > ccSignedAt ? 'duplicate' as const : 'canonical' as const;

    contractConflicts.push({
      tutor_id: cc.tutor_id,
      canonical_contract_id: cc.id,
      duplicate_contract_id: dc.id,
      will_keep: willKeep,
      winner_id: willKeep === 'canonical' ? cc.id : dc.id,
      loser_id: willKeep === 'canonical' ? dc.id : cc.id,
    });

    conflictContractIds.add(cc.id);
    conflictContractIds.add(dc.id);
  }

  // Fresh field conflicts
  const fieldConflicts: { field: string; canonical_value: any; duplicate_value: any }[] = [];
  for (const field of CONFLICT_FIELDS) {
    const cVal = canonical[field];
    const dVal = duplicate[field];
    if (cVal != null && dVal != null && String(cVal).toLowerCase() !== String(dVal).toLowerCase()) {
      fieldConflicts.push({ field, canonical_value: cVal, duplicate_value: dVal });
    }
  }

  const warnings: string[] = [];

  // ── STEP 2: Compute final canonical row values ─────────────────────────

  const update: Record<string, any> = {};

  for (const field of CONFLICT_FIELDS) {
    const conflict = fieldConflicts.find(fc => fc.field === field);
    if (conflict) {
      // Use field_decisions if provided, otherwise keep canonical
      const decision = (field_decisions ?? {})[field] ?? 'canonical';
      update[field] = decision === 'duplicate' ? duplicate[field] : canonical[field];
    } else {
      // No conflict: keep canonical if non-null, else use duplicate
      if (canonical[field] == null && duplicate[field] != null) {
        update[field] = duplicate[field];
      }
      // If canonical is already non-null, no update needed
    }
  }

  // Sum hours
  update.purchased_hours = (canonical.purchased_hours ?? 0) + (duplicate.purchased_hours ?? 0);
  update.used_hours = (canonical.used_hours ?? 0) + (duplicate.used_hours ?? 0);

  // ── STEP 3: UPDATE canonical row ───────────────────────────────────────

  const { error: updateErr } = await supabase
    .from('students')
    .update(update)
    .eq('id', canonical_id);

  if (updateErr) {
    return NextResponse.json({
      error: `Merge failed at step 1 (update canonical): ${updateErr.message}`,
      step: 1,
    }, { status: 500 });
  }

  // ── STEP 4: Handle contract conflicts ──────────────────────────────────
  // For each conflict: void the loser, repoint the winner to canonical if
  // it was on the duplicate. This is safe to re-run: voiding an already-voided
  // contract is a no-op, and repointing an already-repointed contract is also
  // a no-op (student_id is already canonical_id).

  const voidedContractIds: string[] = [];

  for (const cc of contractConflicts) {
    // Void the loser
    const { error: voidErr } = await supabase
      .from('contracts')
      .update({ status: 'voided' })
      .eq('id', cc.loser_id);

    if (voidErr) {
      return NextResponse.json({
        error: `Merge failed at step 2 (void contract ${cc.loser_id}): ${voidErr.message}`,
        step: 2,
        partial: 'contract_conflicts_partial',
      }, { status: 500 });
    }
    voidedContractIds.push(cc.loser_id);

    // If winner was on duplicate, repoint to canonical
    if (cc.will_keep === 'duplicate') {
      const { error: repointErr } = await supabase
        .from('contracts')
        .update({ student_id: canonical_id })
        .eq('id', cc.winner_id);

      if (repointErr) {
        return NextResponse.json({
          error: `Merge failed at step 2 (repoint winner contract ${cc.winner_id}): ${repointErr.message}`,
          step: 2,
          partial: 'contract_conflicts_partial',
        }, { status: 500 });
      }
    }
  }

  // ── STEP 5: Repoint all FK tables ──────────────────────────────────────
  // Uses runtime FK introspection. Safe to re-run: UPDATE ... SET student_id = X
  // WHERE student_id = Y is a no-op if Y has no rows (already repointed).
  // The duplicate is NOT soft-deleted until step 6, so re-running the full
  // merge endpoint after a partial step-5 failure will retry from step 1.
  // Steps 1-4 are idempotent (update with same values, void already-voided,
  // repoint already-repointed). Step 5 is idempotent (repoint already-repointed).

  const { data: fkTables, error: fkErr } = await supabase.rpc('get_student_fk_tables');

  if (fkErr) {
    return NextResponse.json({
      error: `Merge failed at step 3 (FK introspection): ${fkErr.message}`,
      step: 3,
    }, { status: 500 });
  }

  const repointCounts: Record<string, number> = {};

  for (const fk of (fkTables ?? []) as { table_name: string; column_name: string }[]) {
    if (fk.table_name === 'contracts') {
      // Repoint non-conflict contracts only (conflicts handled in step 4)
      let contractQuery = supabase
        .from('contracts')
        .update({ student_id: canonical_id })
        .eq('student_id', duplicate_id);

      // Exclude conflict contracts if any exist (empty .not('in','()') is invalid SQL)
      if (conflictContractIds.size > 0) {
        contractQuery = contractQuery.not('id', 'in', `(${[...conflictContractIds].join(',')})`);
      }

      const { data: repointed, error: repointErr } = await contractQuery.select('id');

      if (repointErr) {
        return NextResponse.json({
          error: `Merge failed at step 3 (repoint contracts): ${repointErr.message}`,
          step: 3,
          table: 'contracts',
          partial: 'fk_repoint_partial',
        }, { status: 500 });
      }
      repointCounts['contracts'] = repointed?.length ?? 0;
      continue;
    }

    // Generic repoint for all other FK tables
    const { data: repointed, error: repointErr } = await supabase
      .from(fk.table_name)
      .update({ [fk.column_name]: canonical_id })
      .eq(fk.column_name, duplicate_id)
      .select('id');

    if (repointErr) {
      return NextResponse.json({
        error: `Merge failed at step 3 (repoint ${fk.table_name}.${fk.column_name}): ${repointErr.message}`,
        step: 3,
        table: fk.table_name,
        partial: 'fk_repoint_partial',
      }, { status: 500 });
    }
    if (repointed && repointed.length > 0) {
      repointCounts[fk.table_name] = repointed.length;
    }
  }

  // ── STEP 6: Soft-delete duplicate ──────────────────────────────────────

  const { error: softDeleteErr } = await supabase
    .from('students')
    .update({ merged_into_id: canonical_id, merged_at: new Date().toISOString() })
    .eq('id', duplicate_id);

  if (softDeleteErr) {
    return NextResponse.json({
      error: `Merge failed at step 4 (soft-delete duplicate): ${softDeleteErr.message}`,
      step: 4,
      partial: 'soft_delete_failed',
    }, { status: 500 });
  }

  // ── STEP 7: Insert audit row ───────────────────────────────────────────

  const { data: auditRow, error: auditErr } = await supabase
    .from('student_merges')
    .insert({
      canonical_id,
      duplicate_id,
      merged_by_admin_id: user.id,
      decisions_json: {
        field_decisions: field_decisions ?? {},
        field_conflicts: fieldConflicts,
        contract_conflicts: contractConflicts,
        computed_update: update,
      },
      contracts_repointed_count: repointCounts['contracts'] ?? 0,
      sessions_repointed_count: repointCounts['sessions'] ?? 0,
      payments_repointed_count: repointCounts['invoices'] ?? 0,
      other_repointed_counts: repointCounts,
    })
    .select('id')
    .single();

  if (auditErr) {
    // Merge succeeded but audit failed — non-fatal, flag it
    warnings.push(`Audit row insert failed: ${auditErr.message}. Merge completed but is not audited.`);
  }

  return NextResponse.json({
    success: true,
    merge_id: auditRow?.id ?? null,
    canonical_id,
    duplicate_id,
    repoint_counts: repointCounts,
    voided_contract_ids: voidedContractIds,
    warnings,
  });
}
