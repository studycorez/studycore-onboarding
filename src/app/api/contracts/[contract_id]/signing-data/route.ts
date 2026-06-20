import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function makeServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

// Public endpoint — access is controlled by knowing the contract UUID (same as before RLS change).
// Contract UUIDs are not guessable and are sent via email to the tutor.
export async function GET(
  req: NextRequest,
  { params }: { params: { contract_id: string } },
) {
  const supabase = makeServiceSupabase();

  const { data, error } = await supabase
    .from('contracts')
    .select('*, tutor:tutors(*), student:students(*)')
    .eq('id', params.contract_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  }

  return NextResponse.json({ contract: data });
}
