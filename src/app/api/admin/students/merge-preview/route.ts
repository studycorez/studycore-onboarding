import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const CONFLICT_FIELDS = ['name', 'email', 'parent_email', 'target_score', 'sat_date'] as const;

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const body = await req.json().catch(() => ({}));
  const { canonical_id, duplicate_id } = body;

  if (!canonical_id || !duplicate_id) {
    return NextResponse.json({ error: 'canonical_id and duplicate_id are required' }, { status: 400 });
  }
  if (canonical_id === duplicate_id) {
    return NextResponse.json({ error: 'Cannot merge a student with itself' }, { status: 400 });
  }

  // Fetch both students
  const [{ data: canonical }, { data: duplicate }] = await Promise.all([
    supabase.from('students').select('*').eq('id', canonical_id).maybeSingle(),
    supabase.from('students').select('*').eq('id', duplicate_id).maybeSingle(),
  ]);

  if (!canonical) return NextResponse.json({ error: 'Canonical student not found' }, { status: 404 });
  if (!duplicate) return NextResponse.json({ error: 'Duplicate student not found' }, { status: 404 });
  if (canonical.merged_into_id) return NextResponse.json({ error: 'Canonical student is already merged' }, { status: 400 });
  if (duplicate.merged_into_id) return NextResponse.json({ error: 'Duplicate student is already merged' }, { status: 400 });

  // ── Field conflicts ────────────────────────────────────────────────────
  const fieldConflicts: { field: string; canonical_value: any; duplicate_value: any }[] = [];
  for (const field of CONFLICT_FIELDS) {
    const cVal = canonical[field];
    const dVal = duplicate[field];
    if (cVal != null && dVal != null && String(cVal).toLowerCase() !== String(dVal).toLowerCase()) {
      fieldConflicts.push({ field, canonical_value: cVal, duplicate_value: dVal });
    }
  }

  // ── Contract conflicts ─────────────────────────────────────────────────
  const [{ data: canonicalContracts }, { data: duplicateContracts }] = await Promise.all([
    supabase.from('contracts')
      .select('id, tutor_id, signed_at, hourly_rate, status, tutor:tutors(name)')
      .eq('student_id', canonical_id)
      .eq('status', 'signed'),
    supabase.from('contracts')
      .select('id, tutor_id, signed_at, hourly_rate, status, tutor:tutors(name)')
      .eq('student_id', duplicate_id)
      .eq('status', 'signed'),
  ]);

  const contractConflicts: any[] = [];
  const conflictContractIds = new Set<string>();

  for (const cc of (canonicalContracts ?? []) as any[]) {
    const dc = ((duplicateContracts ?? []) as any[]).find((d: any) => d.tutor_id === cc.tutor_id);
    if (!dc) continue;

    const tutorName = (Array.isArray(cc.tutor) ? cc.tutor[0]?.name : cc.tutor?.name) ?? '—';
    const ccSignedAt = cc.signed_at ? new Date(cc.signed_at).getTime() : 0;
    const dcSignedAt = dc.signed_at ? new Date(dc.signed_at).getTime() : 0;

    contractConflicts.push({
      tutor_id: cc.tutor_id,
      tutor_name: tutorName,
      canonical_contract: { id: cc.id, signed_at: cc.signed_at, hourly_rate: cc.hourly_rate, status: cc.status },
      duplicate_contract: { id: dc.id, signed_at: dc.signed_at, hourly_rate: dc.hourly_rate, status: dc.status },
      will_keep: dcSignedAt > ccSignedAt ? 'duplicate' : 'canonical',
    });

    conflictContractIds.add(cc.id);
    conflictContractIds.add(dc.id);
  }

  // ── Repoint counts (runtime FK introspection) ──────────────────────────
  const { data: fkTables, error: fkErr } = await supabase.rpc('get_student_fk_tables');

  if (fkErr) {
    return NextResponse.json({ error: `FK introspection failed: ${fkErr.message}` }, { status: 500 });
  }

  const repointCounts: Record<string, number> = {};

  // Count rows per FK table for the duplicate student, skipping contracts (handled separately)
  const countPromises = (fkTables ?? [])
    .filter((fk: any) => fk.table_name !== 'contracts')
    .map(async (fk: any) => {
      try {
        const { count, error } = await supabase
          .from(fk.table_name)
          .select('id', { count: 'exact', head: true })
          .eq(fk.column_name, duplicate_id);
        if (!error && count != null && count > 0) {
          repointCounts[fk.table_name] = count;
        }
      } catch {
        // Table query failed — skip silently
      }
    });
  await Promise.all(countPromises);

  // Contracts to repoint = duplicate's non-conflicting contracts
  const duplicateNonConflictContracts = ((duplicateContracts ?? []) as any[])
    .filter((c: any) => !conflictContractIds.has(c.id));
  repointCounts['contracts'] = duplicateNonConflictContracts.length;

  // ── Hours after merge ──────────────────────────────────────────────────
  const hoursAfterMerge = {
    purchased: (canonical.purchased_hours ?? 0) + (duplicate.purchased_hours ?? 0),
    used: (canonical.used_hours ?? 0) + (duplicate.used_hours ?? 0),
  };

  return NextResponse.json({
    canonical,
    duplicate,
    field_conflicts: fieldConflicts,
    contract_conflicts: contractConflicts,
    repoint_counts: repointCounts,
    hours_after_merge: hoursAfterMerge,
  });
}
