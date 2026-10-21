import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function makeServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeServiceSupabase();
  const proposalId = params.id;

  // Fetch proposal
  const { data: proposal, error: fetchErr } = await supabase
    .from('session_proposals')
    .select('id, status')
    .eq('id', proposalId)
    .single();

  if (fetchErr || !proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  if (proposal.status !== 'pending') {
    return NextResponse.json({ error: `Proposal is already ${proposal.status}` }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const adminNotes = typeof body.admin_notes === 'string' ? body.admin_notes.trim() : '';

  if (adminNotes.length < 3) {
    return NextResponse.json({ error: 'Rejection reason required (min 3 characters)' }, { status: 400 });
  }

  // Update with race-condition guard
  const { data: updated, error: updateErr } = await supabase
    .from('session_proposals')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      admin_notes: adminNotes,
    })
    .eq('id', proposalId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json({ error: 'Proposal was already processed by another admin' }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
