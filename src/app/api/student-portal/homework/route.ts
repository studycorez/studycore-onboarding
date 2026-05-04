import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyStudentJWT, STUDENT_COOKIE_NAME } from '@/lib/student-auth';
import { awardXP } from '@/lib/xp';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

/** PATCH /api/student-portal/homework — mark a session's homework complete */
export async function PATCH(req: NextRequest) {
  const supabase = makeSupabase();
  const token = req.cookies.get(STUDENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = await verifyStudentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { session_id, completed } = await req.json() as { session_id: string; completed: boolean };
  if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 });

  // Verify the session belongs to this student
  const { data: session } = await supabase
    .from('sessions')
    .select('id, student_id, homework_completed')
    .eq('id', session_id)
    .eq('student_id', payload.studentId)
    .single();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const wasCompleted = session.homework_completed;

  await supabase
    .from('sessions')
    .update({
      homework_completed: completed,
      homework_completed_at: completed ? new Date().toISOString() : null,
    })
    .eq('id', session_id);

  // Award +15 XP only when newly completing (not unchecking)
  if (completed && !wasCompleted) {
    await awardXP(supabase, payload.studentId, 15, 'homework_completed', 'Completed homework assignment');
  }

  return NextResponse.json({ ok: true });
}
