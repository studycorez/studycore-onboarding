import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// ── GET /api/contracts/[contract_id]/violations ────────────────────────────
// Returns all violation records for a contract.
export async function GET(
  _req: NextRequest,
  { params }: { params: { contract_id: string } },
) {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('contract_violations')
      .select('*, session:sessions(scheduled_at, duration_minutes)')
      .eq('contract_id', params.contract_id)
      .order('violation_date', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
