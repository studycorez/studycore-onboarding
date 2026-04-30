import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { createClient } from '@supabase/supabase-js';
import { signParentJWT, PARENT_COOKIE_NAME, PARENT_COOKIE_OPTIONS } from '@/lib/parent-auth';

const secret = () =>
  new TextEncoder().encode(process.env.TUTOR_JWT_SECRET ?? 'tutor-fallback-secret-change-me');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  let payload: any;
  try {
    const { payload: p } = await jwtVerify(token, secret());
    payload = p;
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  if (!payload.impersonation || payload.type !== 'parent') {
    return NextResponse.json({ error: 'Invalid impersonation token' }, { status: 401 });
  }

  // id is the student_id; get parent_email from the student
  const { data: student } = await supabase
    .from('students')
    .select('parent_email')
    .eq('id', payload.id)
    .single();

  if (!student?.parent_email) {
    return NextResponse.json({ error: 'No parent email for this student' }, { status: 404 });
  }

  const sessionToken = await signParentJWT({ parentEmail: student.parent_email });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PARENT_COOKIE_NAME, sessionToken, {
    ...PARENT_COOKIE_OPTIONS,
    maxAge: 60 * 60, // 1 hour for impersonation
  });
  return res;
}
