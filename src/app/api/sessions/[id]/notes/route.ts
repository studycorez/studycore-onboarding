import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { token, tutor_notes, homework_assigned, homework_due_date, session_rating } = await req.json();

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }
    if (!tutor_notes?.trim()) {
      return NextResponse.json({ error: 'Session notes required' }, { status: 400 });
    }
    if (!session_rating || session_rating < 1 || session_rating > 5) {
      return NextResponse.json({ error: 'Rating (1–5) required' }, { status: 400 });
    }

    const { data: session } = await supabase
      .from('sessions')
      .select('id, notes_token, notes_submitted_at')
      .eq('id', params.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (session.notes_token !== token) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }

    const { error } = await supabase
      .from('sessions')
      .update({
        tutor_notes: tutor_notes.trim(),
        homework_assigned: homework_assigned?.trim() || null,
        homework_due_date: homework_due_date || null,
        session_rating,
        notes_submitted_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
