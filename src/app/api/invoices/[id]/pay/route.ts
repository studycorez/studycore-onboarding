import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createServiceClient();
    const { data: inv } = await supabase.from('invoices').select('id, status').eq('id', params.id).single();
    if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    if (inv.status === 'voided') return NextResponse.json({ error: 'Cannot mark voided invoice as paid' }, { status: 409 });

    await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', params.id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
