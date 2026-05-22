import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function makeServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

// POST /api/admin/sessions/[session_id]/verify-recording
// Body: { verified: boolean }
// Sets sessions.recording_verified. NEVER touches is_primary or session_recordings.
export async function POST(
  req: NextRequest,
  { params }: { params: { session_id: string } },
) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { session_id } = params;
  const body = await req.json();
  const verified: boolean = body.verified === true;

  const supabase = makeServiceSupabase();

  // Validate session exists and fetch fathom_recording_url for guard check
  const { data: session, error: fetchErr } = await supabase
    .from('sessions')
    .select('id, fathom_recording_url')
    .eq('id', session_id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  // Guard: cannot verify a session that has no recording
  if (verified && !session.fathom_recording_url) {
    return NextResponse.json(
      { error: 'No recording on this session to verify.' },
      { status: 400 },
    );
  }

  const { error: updateErr } = await supabase
    .from('sessions')
    .update({ recording_verified: verified })
    .eq('id', session_id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, recording_verified: verified });
}
