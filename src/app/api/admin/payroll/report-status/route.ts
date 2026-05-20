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

// POST /api/admin/payroll/report-status
// body: { session_ids: string[] }
// returns: { filed_ids: string[] }  — subset of session_ids that have a session_report
export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { session_ids } = body;
  if (!Array.isArray(session_ids) || session_ids.length === 0) {
    return NextResponse.json({ filed_ids: [] });
  }

  const supabase = makeServiceSupabase();
  const filedIds: string[] = [];
  const BATCH_SIZE = 200;

  for (let i = 0; i < session_ids.length; i += BATCH_SIZE) {
    const chunk = session_ids.slice(i, i + BATCH_SIZE);
    const { data: reports } = await supabase
      .from('session_reports')
      .select('session_id')
      .in('session_id', chunk);
    for (const report of reports ?? []) filedIds.push(report.session_id);
  }

  return NextResponse.json({ filed_ids: filedIds });
}
