import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyParentJWT, PARENT_COOKIE_NAME } from '@/lib/parent-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    student_id, current_score, target_score, test_date, grade,
    weak_areas, learning_style, school_name, gpa,
    study_hours_per_week, additional_notes,
  } = body;

  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  // Verify student belongs to this parent
  const { data: student } = await supabase
    .from('students')
    .select('id')
    .eq('id', student_id)
    .ilike('parent_email', payload.parentEmail)
    .maybeSingle();

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const { error } = await supabase.from('students').update({
    current_score: current_score ? parseInt(current_score) : null,
    target_score: target_score ? parseInt(target_score) : null,
    test_date: test_date || null,
    grade: grade ? parseInt(grade) : null,
    weak_areas: weak_areas ?? null,
    learning_style: learning_style || null,
    school_name: school_name || null,
    gpa: gpa || null,
    study_hours_per_week: study_hours_per_week || null,
    additional_notes: additional_notes || null,
    intake_form_completed: true,
  }).eq('id', student_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
