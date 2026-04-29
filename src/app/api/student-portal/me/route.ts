import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyStudentJWT, STUDENT_COOKIE_NAME } from '@/lib/student-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const token = req.cookies.get(STUDENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = await verifyStudentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: student } = await supabase
    .from('students')
    .select('id, name, email, grade, current_score, target_score, purchased_hours, used_hours, test_date, xp_points, xp_level, avatar_animal, avatar_color, battle_cry, streak_weeks, badges, portal_last_login_at, game_plan_url, created_at, parent_can_see_scores, parent_can_see_homework, parent_can_see_xp')
    .eq('id', payload.studentId)
    .single();

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  return NextResponse.json(student);
}
