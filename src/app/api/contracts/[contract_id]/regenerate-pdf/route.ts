import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateContractPdf } from '@/lib/contract-pdf';

export async function POST(
  _req: NextRequest,
  { params }: { params: { contract_id: string } },
) {
  try {
    const supabase = createServiceClient();

    const { data: contract } = await supabase
      .from('contracts')
      .select('id, status, tutor_signature, signed_at')
      .eq('id', params.contract_id)
      .single();

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }
    if (contract.status !== 'signed') {
      return NextResponse.json({ error: 'Only signed contracts can have a PDF generated' }, { status: 409 });
    }
    // If the contract was signed by the assign-tutor flow (no tutor_signature string),
    // stamp a placeholder so the PDF still shows something useful.
    if (!contract.tutor_signature) {
      await supabase
        .from('contracts')
        .update({
          tutor_signature: 'Digitally accepted',
          signed_at: contract.signed_at ?? new Date().toISOString(),
        })
        .eq('id', params.contract_id);
    }

    const pdf_url = await generateContractPdf(params.contract_id);

    if (!pdf_url) {
      return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, pdf_url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
