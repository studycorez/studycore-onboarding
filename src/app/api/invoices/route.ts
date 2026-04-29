import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('invoices')
    .select('*, student:students(name, email, parent_email)')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  try {
    const { student_id, period_start, period_end, amount, notes } = await req.json();
    if (!student_id || !period_start || !period_end) {
      return NextResponse.json({ error: 'student_id, period_start, period_end required' }, { status: 400 });
    }
    if (amount == null || isNaN(Number(amount))) {
      return NextResponse.json({ error: 'amount required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('invoices')
      .insert({ student_id, period_start, period_end, amount: Number(amount), notes: notes || null, status: 'draft' })
      .select('*, student:students(name, email, parent_email)')
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
