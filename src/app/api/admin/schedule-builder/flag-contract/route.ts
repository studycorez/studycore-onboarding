import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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
  const { contract_id, reason } = body;

  if (!contract_id || typeof contract_id !== 'string') {
    return NextResponse.json({ error: 'contract_id is required' }, { status: 400 });
  }

  // Verify contract exists
  const { data: contract } = await supabase
    .from('contracts')
    .select('id')
    .eq('id', contract_id)
    .maybeSingle();

  if (!contract) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  }

  const flagReason = (reason && typeof reason === 'string' && reason.trim())
    ? reason.trim()
    : 'possible duplicate';

  const { data: row, error } = await supabase
    .from('contract_review_queue')
    .upsert({
      contract_id,
      reason: flagReason,
      flagged_at: new Date().toISOString(),
      flagged_by_admin_id: user.id,
      resolved_at: null,
    }, {
      onConflict: 'contract_id',
    })
    .select('id, contract_id, reason')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    flagged: true,
    id: row.id,
    contract_id: row.contract_id,
    reason: row.reason,
  });
}
