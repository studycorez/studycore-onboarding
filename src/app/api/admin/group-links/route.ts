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

async function getAdminUser() {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  return user;
}

// GET /api/admin/group-links
// Returns { monday: string|null, saturday: string|null }
export async function GET() {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeServiceSupabase();
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['group_link_monday', 'group_link_saturday']);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value;

  return NextResponse.json({
    monday:   map['group_link_monday']   ?? null,
    saturday: map['group_link_saturday'] ?? null,
  });
}

// POST /api/admin/group-links
// Body: { monday: string, saturday: string }
// Upserts both keys into app_settings.
export async function POST(req: NextRequest) {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { monday, saturday } = await req.json();

  const supabase = makeServiceSupabase();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('app_settings')
    .upsert(
      [
        { key: 'group_link_monday',   value: monday   ?? '', updated_at: now },
        { key: 'group_link_saturday', value: saturday ?? '', updated_at: now },
      ],
      { onConflict: 'key' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
