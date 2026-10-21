import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

function makeServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

// GET /api/admin/recordings-pending?offset=0
// Returns sessions with a recording that hasn't been verified for student view.
// Paginated: limit 50, order by scheduled_at DESC. Use ?offset= for load-more.
export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const offset = parseInt(new URL(req.url).searchParams.get('offset') ?? '0', 10) || 0;

  const supabase = makeServiceSupabase();

  const { data, error } = await supabase
    .from('sessions')
    .select('id, scheduled_at, fathom_recording_url, student:students(id, name), tutor:tutors(id, name)')
    .not('fathom_recording_url', 'is', null)
    .eq('recording_verified', false)
    .order('scheduled_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  return NextResponse.json({
    rows: rows.slice(0, PAGE_SIZE),
    hasMore: rows.length > PAGE_SIZE,
  });
}
