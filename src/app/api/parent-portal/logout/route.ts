import { NextResponse } from 'next/server';
import { PARENT_COOKIE_NAME } from '@/lib/parent-auth';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PARENT_COOKIE_NAME, '', { maxAge: 0, path: '/' });
  return response;
}
