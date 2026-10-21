import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyParentJWT, PARENT_COOKIE_NAME } from '@/lib/parent-auth';
import { awardBadge } from '@/lib/xp';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    student_id, current_score, target_score, test_date, grade,
    learning_style, school_name, gpa,
    study_hours_per_week, additional_notes,
  } = body;

  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  // Verify student belongs to this parent
  const { data: student } = await getDb()
    .from('students')
    .select('id')
    .eq('id', student_id)
    .ilike('parent_email', payload.parentEmail)
    .maybeSingle();

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  // Build formatted intake note
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const gradeNum = grade ? parseInt(grade) : null;
  const gradeStr = gradeNum ? `${gradeNum}th` : null;
  const lines: string[] = [`[Parent Intake - ${dateStr}]`];
  const scoreParts: string[] = [];
  if (current_score) scoreParts.push(`Current Score: ${current_score}`);
  if (target_score)  scoreParts.push(`Target: ${target_score}`);
  if (scoreParts.length) lines.push(scoreParts.join(' | '));
  const infoParts: string[] = [];
  if (gradeStr)   infoParts.push(`Grade: ${gradeStr}`);
  if (school_name) infoParts.push(`School: ${school_name}`);
  if (gpa)         infoParts.push(`GPA: ${gpa}`);
  if (infoParts.length) lines.push(infoParts.join(' | '));
  if (learning_style)      lines.push(`Learning Style: ${learning_style}`);
  if (study_hours_per_week) lines.push(`Study Hours/Week: ${study_hours_per_week}`);
  if (additional_notes)    lines.push(`Notes: ${additional_notes}`);
  const intake_notes = lines.join('\n');

  const { error } = await getDb().from('students').update({
    current_score: current_score ? parseInt(current_score) : null,
    target_score:  target_score  ? parseInt(target_score)  : null,
    test_date:     test_date     || null,
    grade:         gradeNum,
    learning_style:       learning_style       || null,
    school_name:          school_name          || null,
    gpa:                  gpa                  || null,
    study_hours_per_week: study_hours_per_week || null,
    additional_notes:     additional_notes     || null,
    intake_notes,
    intake_form_completed: true,
  }).eq('id', student_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Award Homework Hero badge (non-blocking)
  awardBadge(getDb() as any, student_id, 'homework_hero').catch(console.error);

  return NextResponse.json({ ok: true });
}
