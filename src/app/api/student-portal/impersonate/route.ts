import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyImpersonationJWT } from '@/lib/impersonation';
import { signStudentJWT, STUDENT_COOKIE_NAME, STUDENT_COOKIE_OPTIONS } from '@/lib/student-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  const payload = await verifyImpersonationJWT(token);
  if (!payload || payload.type !== 'student') {
    return NextResponse.json({ error: 'Invalid impersonation token' }, { status: 401 });
  }

  const { data: student } = await supabase
    .from('students')
    .select('id, name, email')
    .eq('id', payload.id)
    .single();

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const sessionToken = await signStudentJWT({
    studentId: student.id,
    studentName: student.name,
    studentEmail: student.email,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(STUDENT_COOKIE_NAME, sessionToken, {
    ...STUDENT_COOKIE_OPTIONS,
    maxAge: 60 * 60, // 1 hour for impersonation
  });
  return res;
}
