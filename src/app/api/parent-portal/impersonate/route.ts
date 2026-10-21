import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyImpersonationJWT } from '@/lib/impersonation';
import { signParentJWT, PARENT_COOKIE_NAME, PARENT_COOKIE_OPTIONS } from '@/lib/parent-auth';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(new URL('/parent-portal/login?error=missing_token', req.url));
  }

  const payload = await verifyImpersonationJWT(token);
  if (!payload || payload.type !== 'parent') {
    return NextResponse.redirect(new URL('/parent-portal/login?error=invalid_token', req.url));
  }

  // id is the student_id; get parent_email from the student record
  const { data: student } = await getDb()
    .from('students')
    .select('parent_email')
    .eq('id', payload.id)
    .single();

  if (!student?.parent_email) {
    return NextResponse.redirect(new URL('/parent-portal/login?error=no_parent_email', req.url));
  }

  const sessionToken = await signParentJWT({ parentEmail: student.parent_email });

  const response = NextResponse.redirect(new URL('/parent-portal/dashboard', req.url));
  response.cookies.set(PARENT_COOKIE_NAME, sessionToken, {
    ...PARENT_COOKIE_OPTIONS,
    maxAge: 60 * 60, // 1 hour for impersonation
  });
  return response;
}
