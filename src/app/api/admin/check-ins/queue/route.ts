import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = makeSupabase();
    const { data, error } = await supabase
      .from('check_ins')
      .select('id, student_name, type, context, created_at, status')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
