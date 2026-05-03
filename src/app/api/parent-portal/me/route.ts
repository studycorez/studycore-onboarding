import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyParentJWT, PARENT_COOKIE_NAME } from '@/lib/parent-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: students } = await supabase
    .from('students')
    .select('id, name, email, grade, current_score, target_score, purchased_hours, used_hours, notes, parent_name, parent_email, game_plan_url, onboarding_email_sent, onboarding_completed, intake_form_completed, kickoff_scheduled, game_plan_acknowledged, schedule_confirmed, test_date, weak_areas, learning_style, additional_notes, school_name, gpa, study_hours_per_week, parent_can_see_scores, parent_can_see_homework, parent_can_see_xp, referral_code')
    .ilike('parent_email', payload.parentEmail)
    .order('name');

  return NextResponse.json(
    { parentEmail: payload.parentEmail, students: students ?? [] },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
