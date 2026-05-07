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
    const {
      topics_covered,
      homework_assigned,
      homework_due_date,
      student_engagement,
      session_notes,
      next_session_plan,
    } = await req.json();

    if (!topics_covered?.trim()) {
      return NextResponse.json({ error: 'Topics covered is required' }, { status: 400 });
    }
    if (!student_engagement || student_engagement < 1 || student_engagement > 5) {
      return NextResponse.json({ error: 'Student engagement (1–5) is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('sessions')
      .update({
        topics_covered: topics_covered.trim(),
        homework_assigned: homework_assigned?.trim() || null,
        homework_due_date: homework_due_date || null,
        student_engagement,
        session_notes: session_notes?.trim() || null,
        next_session_plan: next_session_plan?.trim() || null,
        report_submitted: true,
        report_submitted_at: new Date().toISOString(),
        // Keep tutor_notes in sync with session_notes for backwards compat
        ...(session_notes?.trim() ? { tutor_notes: session_notes.trim() } : {}),
      })
      .eq('id', params.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
