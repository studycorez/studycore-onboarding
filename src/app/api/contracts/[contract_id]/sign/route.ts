import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateContractPdf } from '@/lib/contract-pdf';

export async function POST(
  req: NextRequest,
  { params }: { params: { contract_id: string } },
) {
  try {
    const { tutor_signature } = await req.json();
    if (!tutor_signature?.trim()) {
      return NextResponse.json({ error: 'Signature required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: contract } = await supabase
      .from('contracts')
      .select('id, status')
      .eq('id', params.contract_id)
      .single();

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }
    if (contract.status !== 'pending') {
      return NextResponse.json({ error: `Contract is already ${contract.status}` }, { status: 409 });
    }

    const { error } = await supabase
      .from('contracts')
      .update({ tutor_signature: tutor_signature.trim(), signed_at: new Date().toISOString(), status: 'signed' })
      .eq('id', params.contract_id);

    if (error) throw error;

    // Generate PDF asynchronously — don't block the sign response
    const pdf_url = await generateContractPdf(params.contract_id).catch(err => {
      console.error('[sign] PDF generation failed:', err);
      return null;
    });

    return NextResponse.json({ ok: true, pdf_url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
