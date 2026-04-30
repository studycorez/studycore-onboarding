import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyImpersonationJWT } from '@/lib/impersonation';
import { signTutorJWT, COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/tutor-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  const payload = await verifyImpersonationJWT(token);
  if (!payload || payload.type !== 'tutor') {
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
