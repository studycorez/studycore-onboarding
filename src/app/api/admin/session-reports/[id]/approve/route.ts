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

  const { matched_student_id } = await req.json() as { matched_student_id?: string };
  const reportId = params.id;

  const supabase = makeServiceSupabase();

  const { data: report, error: fetchErr } = await supabase
    .from('session_reports')
    .select('id, session_id')
    .eq('id', reportId)
    .maybeSingle();

  if (fetchErr || !report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  // NOTE: Supabase JS client does not support transactions. If the session
  // update fails after homework_items succeeds, the two tables will be
  // inconsistent. The admin can correct by re-approving with the same
  // matched_student_id — the homework_items update is idempotent.
  if (matched_student_id) {
    const { error: hwErr } = await supabase
      .from('homework_items')
      .update({ student_id: matched_student_id })
      .eq('session_report_id', reportId);

    if (hwErr) {
      return NextResponse.json(
        { error: 'Failed to reassign homework: ' + hwErr.message },
        { status: 500 },
      );
    }

    const { error: sessErr } = await supabase
      .from('sessions')
      .update({ student_id: matched_student_id })
      .eq('id', report.session_id);

    if (sessErr) {
      // homework_items were already updated — partial failure.
      // Admin should retry; the homework_items update is idempotent.
      return NextResponse.json(
        { error: 'Partial failure: homework reassigned but session update failed. Contact engineering.' },
        { status: 500 },
      );
    }
  }

  const approvedAt = new Date().toISOString();
  const { error: approveErr } = await supabase
    .from('session_reports')
    .update({
      admin_approved_at: approvedAt,
      admin_approved_by: user.email,
    })
    .eq('id', reportId);

  if (approveErr) {
    return NextResponse.json({ error: approveErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    matched_student_id: matched_student_id ?? null,
    approved_at: approvedAt,
  });
}
