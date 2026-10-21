import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// GET /api/group-links
// Read-only. Returns { monday: string|null, saturday: string|null }.
// No auth gate — values are just Zoom join URLs shown to group-enabled students.
// The gate (group_sessions_enabled) is enforced in the portal UI.
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );

  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['group_link_monday', 'group_link_saturday']);

  if (error) return NextResponse.json({ monday: null, saturday: null });

  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value;

  return NextResponse.json({
    monday:   map['group_link_monday']   ?? null,
    saturday: map['group_link_saturday'] ?? null,
  });
}
