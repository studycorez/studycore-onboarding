import { NextRequest, NextResponse } from 'next/server';
import { verifyParentJWT, PARENT_COOKIE_NAME, PARENT_COOKIE_OPTIONS } from '@/lib/parent-auth';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(new URL('/parent-portal/login?error=missing_token', req.url));
  }

  const payload = await verifyParentJWT(token);
  if (!payload) {
    return NextResponse.redirect(new URL('/parent-portal/login?error=invalid_token', req.url));
  }

  const response = NextResponse.redirect(new URL('/parent-portal/dashboard', req.url));
  response.cookies.set(PARENT_COOKIE_NAME, token, PARENT_COOKIE_OPTIONS);
  return response;
}
