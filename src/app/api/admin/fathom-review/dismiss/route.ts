import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function POST(req: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const supabase = makeSupabase();

  const { recording_id, reason } = await req.json();

  if (!recording_id) {
    return NextResponse.json({ error: 'recording_id required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('fathom_unmatched_recordings')
    .update({ resolved: true, resolved_session_id: null, dismiss_reason: reason ?? null })
    .eq('id', recording_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
