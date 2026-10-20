import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyStudentJWT, STUDENT_COOKIE_NAME } from '@/lib/student-auth';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(STUDENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = await verifyStudentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { parent_can_see_scores, parent_can_see_homework, parent_can_see_xp } = await req.json();

  await getDb().from('students').update({
    parent_can_see_scores:  parent_can_see_scores  ?? true,
    parent_can_see_homework: parent_can_see_homework ?? true,
    parent_can_see_xp:      parent_can_see_xp      ?? true,
  }).eq('id', payload.studentId);

  return NextResponse.json({ ok: true });
}
