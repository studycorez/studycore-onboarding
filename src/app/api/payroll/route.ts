import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    const { period_start, period_end, lines, total_amount } = await req.json();
    if (!period_start || !period_end || !lines?.length) {
      return NextResponse.json({ error: 'period_start, period_end, and lines are required' }, { status: 400 });
    }

    const { data: run, error: runErr } = await supabase
      .from('payroll_runs')
      .insert({ period_start, period_end, total_amount, status: 'pending' })
      .select('id')
      .single();

    if (runErr || !run) {
      return NextResponse.json({ error: runErr?.message ?? 'Failed to create payroll run' }, { status: 500 });
    }

    const now = new Date().toISOString();
    const lineItems = lines.map((l: any) => ({
      payroll_run_id:       run.id,
      tutor_id:             l.tutor_id,
      sessions_count:       l.sessions_count,
      total_minutes:        l.total_minutes,
      hourly_rate:          l.hourly_rate,
      amount_owed:          l.amount_owed,
      status:               l.status ?? 'pending',
      actually_paid_amount: l.actually_paid_amount ?? null,
      paid_at:              (l.status === 'paid' && l.actually_paid_amount != null) ? now : null,
    }));

    const { error: itemsErr } = await supabase.from('payroll_line_items').insert(lineItems);
    if (itemsErr) {
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, run_id: run.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
