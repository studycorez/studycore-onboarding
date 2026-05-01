import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyImpersonationJWT } from '@/lib/impersonation';
import { signStudentJWT, STUDENT_COOKIE_NAME, STUDENT_COOKIE_OPTIONS } from '@/lib/student-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(new URL('/student-portal/login?error=missing_token', req.url));
  }

  const payload = await verifyImpersonationJWT(token);
  if (!payload || payload.type !== 'student') {
    return NextResponse.redirect(new URL('/student-portal/login?error=invalid_token', req.url));
  }

  const { data: student } = await supabase
    .from('students')
    .select('id, name, email')
    .eq('id', payload.id)
    .single();

  if (!student) {
    return NextResponse.redirect(new URL('/student-portal/login?error=not_found', req.url));
  }

  const sessionToken = await signStudentJWT({
    studentId: student.id,
    studentName: student.name,
    studentEmail: student.email,
  });

  const response = NextResponse.redirect(new URL('/student-portal/dashboard', req.url));
  response.cookies.set(STUDENT_COOKIE_NAME, sessionToken, {
    ...STUDENT_COOKIE_OPTIONS,
    maxAge: 60 * 60, // 1 hour for impersonation
  });
  return response;
}
