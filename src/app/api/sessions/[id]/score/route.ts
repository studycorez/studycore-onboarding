import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { math_score, reading_score, writing_score, total_score, notes } = await req.json();

    if (!math_score && !reading_score && !writing_score && !total_score) {
      return NextResponse.json({ error: 'At least one score is required' }, { status: 400 });
    }

    const { data: session } = await supabase
      .from('sessions')
      .select('id, student_id')
      .eq('id', params.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const payload: Record<string, unknown> = {
      student_id: session.student_id,
      session_id: params.id,
      recorded_at: new Date().toISOString(),
    };
    if (math_score)    payload.math_score    = parseInt(math_score);
    if (reading_score) payload.reading_score = parseInt(reading_score);
    if (writing_score) payload.writing_score = parseInt(writing_score);
    if (total_score)   payload.total_score   = parseInt(total_score);
    if (notes)         payload.notes         = notes;

    const { data, error } = await supabase
      .from('student_progress')
      .insert(payload)
      .select('id')
      .single();

    if (error) throw error;

    // Update student's current_score if total provided
    if (total_score) {
      await supabase
        .from('students')
        .update({ current_score: parseInt(total_score) })
        .eq('id', session.student_id);
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
