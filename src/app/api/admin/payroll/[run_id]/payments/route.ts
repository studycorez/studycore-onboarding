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

// PATCH /api/admin/payroll/[run_id]/payments
// body: { lines: [{ tutor_id, actually_paid_amount, status }] }
// Updates line item payment amounts on an existing pending run.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { run_id: string } },
) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { lines } = body as { lines: { tutor_id: string; actually_paid_amount: number | null; status: string }[] };
  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'lines required' }, { status: 400 });
  }

  const supabase = makeServiceSupabase();
  const runId = params.run_id;

  // Verify run exists and is not already marked paid at the run level
  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, status')
    .eq('id', runId)
    .single();

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  const now = new Date().toISOString();

  for (const l of lines) {
    const isPaid = l.status === 'paid' && l.actually_paid_amount != null;
    await supabase
      .from('payroll_line_items')
      .update({
        actually_paid_amount: l.actually_paid_amount ?? null,
        status:               l.status,
        paid_at:              isPaid ? now : null,
      })
      .eq('payroll_run_id', runId)
      .eq('tutor_id', l.tutor_id);
  }

  // If all lines are paid, mark the run as paid
  const allPaid = lines.every(l => l.status === 'paid');
  if (allPaid) {
    await supabase.from('payroll_runs').update({ status: 'paid' }).eq('id', runId);
  }

  return NextResponse.json({ ok: true });
}
