import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateContractPdf } from '@/lib/contract-pdf';

// Use the direct service-role client (no cookie dependency) so this unauthenticated
// endpoint can always write to the contracts table regardless of RLS.
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { contract_id: string } },
) {
  const { contract_id } = params;
  console.log('[sign] POST /api/contracts/%s/sign', contract_id);

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch (parseErr: any) {
      console.error('[sign] Failed to parse request body:', parseErr?.message);
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { tutor_signature } = body as { tutor_signature?: string };
    if (!tutor_signature?.trim()) {
      return NextResponse.json({ error: 'Signature required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Fetch contract
    const { data: contract, error: fetchErr } = await supabase
      .from('contracts')
      .select('id, status')
      .eq('id', contract_id)
      .single();

    if (fetchErr) {
      console.error('[sign] Contract fetch error:', fetchErr.message, fetchErr);
      return NextResponse.json({ error: `DB error: ${fetchErr.message}` }, { status: 500 });
    }
    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }
    if (contract.status !== 'pending') {
      return NextResponse.json({ error: `Contract is already ${contract.status}` }, { status: 409 });
    }

    // Mark as signed
    const { error: updateErr } = await supabase
      .from('contracts')
      .update({
        tutor_signature: tutor_signature.trim(),
        signed_at: new Date().toISOString(),
        status: 'signed',
      })
      .eq('id', contract_id);

    if (updateErr) {
      console.error('[sign] Contract update error:', updateErr.message, updateErr);
      return NextResponse.json({ error: `Failed to save signature: ${updateErr.message}` }, { status: 500 });
    }

    console.log('[sign] Contract %s marked as signed', contract_id);

    // Generate PDF — non-blocking, errors are logged but don't fail the response
    const pdf_url = await generateContractPdf(contract_id).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error('[sign] PDF generation failed for %s: %s\n%s', contract_id, msg, stack ?? '');
      return null;
    });

    console.log('[sign] Done. pdf_url=%s', pdf_url ?? 'null');
    return NextResponse.json({ ok: true, pdf_url });

  } catch (err: unknown) {
    const msg   = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack   : undefined;
    console.error('[sign] Unexpected error for contract %s: %s\n%s', contract_id, msg, stack ?? '');
    return NextResponse.json({ error: msg || 'Internal error' }, { status: 500 });
  }
}
