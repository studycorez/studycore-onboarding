import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { createClient } from '@supabase/supabase-js';
import { signTutorJWT, COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/tutor-auth';

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

  if (!payload.impersonation || payload.type !== 'tutor') {
    return NextResponse.json({ error: 'Invalid impersonation token' }, { status: 401 });
  }

  const { data: tutor } = await supabase
    .from('tutors')
    .select('id, name, email')
    .eq('id', payload.id)
    .single();

  if (!tutor) return NextResponse.json({ error: 'Tutor not found' }, { status: 404 });

  const sessionToken = await signTutorJWT({
    tutorId: tutor.id,
    tutorName: tutor.name,
    tutorEmail: tutor.email,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, sessionToken, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60, // 1 hour for impersonation
  });
  return res;
}
