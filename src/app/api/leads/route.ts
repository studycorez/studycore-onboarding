import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, phone, grade, target_score, current_score, source, notes, assigned_to } = body;
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('leads')
      .insert({ name: name.trim(), email: email || null, phone: phone || null, grade: grade || null, target_score: target_score || null, current_score: current_score || null, source: source || null, notes: notes || null, assigned_to: assigned_to || null })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
