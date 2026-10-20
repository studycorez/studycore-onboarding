import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyImpersonationJWT } from '@/lib/impersonation';
import { signTutorJWT, COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/tutor-auth';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(new URL('/tutor-portal/login?error=missing_token', req.url));
  }

  const payload = await verifyImpersonationJWT(token);
  if (!payload || payload.type !== 'tutor') {
    return NextResponse.redirect(new URL('/tutor-portal/login?error=invalid_token', req.url));
  }

  const { data: tutor } = await getDb()
    .from('tutors')
    .select('id, name, email, archived_at')
    .eq('id', payload.id)
    .single();

  if (!tutor) {
    return NextResponse.redirect(new URL('/tutor-portal/login?error=not_found', req.url));
  }

  if (tutor.archived_at !== null) {
    return NextResponse.redirect(new URL('/tutor-portal/login?error=archived', req.url));
  }

  const sessionToken = await signTutorJWT({
    tutorId: tutor.id,
    tutorName: tutor.name,
    tutorEmail: tutor.email,
  });

  const response = NextResponse.redirect(new URL('/tutor-portal/dashboard', req.url));
  response.cookies.set(COOKIE_NAME, sessionToken, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60, // 1 hour for impersonation
  });
  return response;
}
