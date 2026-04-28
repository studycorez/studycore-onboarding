import { NextResponse } from 'next/server';
import { STUDENT_COOKIE_NAME } from '@/lib/student-auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(STUDENT_COOKIE_NAME, '', { maxAge: 0, path: '/' });
  return res;
}
