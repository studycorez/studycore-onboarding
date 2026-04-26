import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(
  _req: NextRequest,
  { params }: { params: { contract_id: string } },
) {
  try {
    const supabase = createServiceClient();

    const { error } = await supabase
      .from('contracts')
      .update({ status: 'voided' })
      .eq('id', params.contract_id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
