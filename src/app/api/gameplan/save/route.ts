import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const { studentName, planType, baselineScore, targetScore, programSummary, trackerUrl } = await req.json();

    if (!studentName) return NextResponse.json({ error: 'studentName required' }, { status: 400 });

    const supabase = makeSupabase();

    // Try to find matching student by name (case-insensitive)
    const { data: match } = await supabase
      .from('students')
      .select('id')
      .ilike('name', studentName.trim())
      .maybeSingle();

    const { data, error } = await supabase
      .from('gameplans')
      .insert({
        student_id:      match?.id ?? null,
        student_name:    studentName.trim(),
        plan_type:       planType ?? 'standard',
        baseline_score:  baselineScore ? parseInt(baselineScore) : null,
        target_score:    targetScore   ? parseInt(targetScore)   : null,
        program_summary: programSummary ?? null,
        tracker_url:     trackerUrl     ?? null,
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id, studentId: match?.id ?? null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
