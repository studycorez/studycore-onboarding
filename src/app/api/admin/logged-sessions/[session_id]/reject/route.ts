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

// POST /api/admin/logged-sessions/[session_id]/reject
// Sets status='cancelled' — keeps audit trail, fails payroll gate permanently.
export async function POST(
  req: NextRequest,
  { params }: { params: { session_id: string } },
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
  const { session_id } = params;

  const { data: session, error: fetchErr } = await supabase
    .from('sessions')
    .select('id, status, created_by_tutor')
    .eq('id', session_id)
    .maybeSingle();

  if (fetchErr || !session)
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (!session.created_by_tutor)
    return NextResponse.json({ error: 'Not a tutor-logged session' }, { status: 400 });
  if (session.status !== 'pending_approval')
    return NextResponse.json({ error: `Session status is '${session.status}', not pending_approval` }, { status: 409 });

  const { error: updateErr } = await supabase
    .from('sessions')
    .update({ status: 'cancelled' })
    .eq('id', session_id);

  if (updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
