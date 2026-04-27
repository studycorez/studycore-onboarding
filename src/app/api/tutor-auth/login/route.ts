import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { signTutorJWT, COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/tutor-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }

  const { data: tutor } = await supabase
    .from('tutors')
    .select('id, name, email, password_hash')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (!tutor || !tutor.password_hash) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, tutor.password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  await supabase.from('tutors').update({ last_login_at: new Date().toISOString() }).eq('id', tutor.id);

  const token = await signTutorJWT({ tutorId: tutor.id, tutorName: tutor.name, tutorEmail: tutor.email });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTIONS);
  return res;
}
