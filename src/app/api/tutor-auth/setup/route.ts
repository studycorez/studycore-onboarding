import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { signTutorJWT, COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/tutor-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// GET /api/tutor-auth/setup?token=XXX — validate token, return tutor name
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  const { data: tutor } = await supabase
    .from('tutors')
    .select('id, name, setup_token_expires_at, archived_at')
    .eq('setup_token', token)
    .maybeSingle();

  if (!tutor) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
  if (new Date(tutor.setup_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Token has expired' }, { status: 400 });
  }
  if (tutor.archived_at !== null) {
    return NextResponse.json({ error: 'Account inactive. Contact your administrator.' }, { status: 403 });
  }

  return NextResponse.json({ tutorId: tutor.id, tutorName: tutor.name });
}

// POST /api/tutor-auth/setup — set password, issue JWT, auto-login
export async function POST(req: NextRequest) {
  const { token, password } = await req.json();
  if (!token || !password) return NextResponse.json({ error: 'Token and password required' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  const { data: tutor } = await supabase
    .from('tutors')
    .select('id, name, email, setup_token_expires_at, archived_at, airtable_tutor_id')
    .eq('setup_token', token)
    .maybeSingle();

  if (!tutor) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
  if (new Date(tutor.setup_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Token has expired' }, { status: 400 });
  }
  if (tutor.archived_at !== null) {
    return NextResponse.json({ error: 'Account inactive. Contact your administrator.' }, { status: 403 });
  }

  const password_hash = await bcrypt.hash(password, 12);
  await supabase.from('tutors').update({
    password_hash,
    setup_token: null,
    setup_token_expires_at: null,
  }).eq('id', tutor.id);

  await supabase.from('tutors').update({ last_login_at: new Date().toISOString() }).eq('id', tutor.id);

  const jwt = await signTutorJWT({
    tutorId:    tutor.id,
    tutorName:  tutor.name,
    tutorEmail: tutor.email,
    ...(tutor.airtable_tutor_id ? { airtableId: tutor.airtable_tutor_id } : {}),
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, jwt, COOKIE_OPTIONS);
  return res;
}
