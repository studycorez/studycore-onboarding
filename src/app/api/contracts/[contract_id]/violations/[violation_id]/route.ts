import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// ── DELETE /api/contracts/[contract_id]/violations/[violation_id] ──────────
// Deletes a violation record and decrements the contract's violation_count.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { contract_id: string; violation_id: string } },
) {
  try {
    const supabase = createServiceClient();

    // Verify the violation exists and belongs to this contract
    const { data: violation } = await supabase
      .from('contract_violations')
      .select('id')
      .eq('id', params.violation_id)
      .eq('contract_id', params.contract_id)
      .single();

    if (!violation) {
      return NextResponse.json({ error: 'Violation not found' }, { status: 404 });
    }

    // Delete the violation
    const { error: delErr } = await supabase
      .from('contract_violations')
      .delete()
      .eq('id', params.violation_id);

    if (delErr) throw delErr;

    // Decrement violation_count (floor at 0) and un-void if it was voided due to violations
    const { data: contract } = await supabase
      .from('contracts')
      .select('violation_count, status')
      .eq('id', params.contract_id)
      .single();

    if (contract) {
      const newCount = Math.max(0, (contract.violation_count ?? 1) - 1);
      const updates: Record<string, unknown> = { violation_count: newCount };
      // If the contract was voided solely because of violations (i.e. it reached ≥3),
      // revert it to 'signed' when the count drops below 3.
      if (contract.status === 'voided' && newCount < 3) {
        updates.status = 'signed';
      }
      await supabase.from('contracts').update(updates).eq('id', params.contract_id);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
