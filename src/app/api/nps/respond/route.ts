import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const { token, score, feedback } = await req.json();

  if (!token || score == null || typeof score !== 'number' || score < 0 || score > 10) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { data: survey, error: fetchErr } = await supabase
    .from('nps_surveys')
    .select('id, responded_at')
    .eq('token', token)
    .single();

  if (fetchErr || !survey) {
    return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
  }
  if (survey.responded_at) {
    return NextResponse.json({ error: 'Already responded' }, { status: 409 });
  }

  const { error } = await supabase
    .from('nps_surveys')
    .update({ score, feedback: feedback || null, responded_at: new Date().toISOString() })
    .eq('id', survey.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
