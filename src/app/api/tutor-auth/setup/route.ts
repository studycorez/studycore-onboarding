import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

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
    .select('id, name, setup_token_expires_at')
    .eq('setup_token', token)
    .maybeSingle();

  if (!tutor) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
  if (new Date(tutor.setup_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Token has expired' }, { status: 400 });
  }

  return NextResponse.json({ tutorId: tutor.id, tutorName: tutor.name });
}

// POST /api/tutor-auth/setup — set password
export async function POST(req: NextRequest) {
  const { token, password } = await req.json();
  if (!token || !password) return NextResponse.json({ error: 'Token and password required' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  const { data: tutor } = await supabase
    .from('tutors')
    .select('id, setup_token_expires_at')
    .eq('setup_token', token)
    .maybeSingle();

  if (!tutor) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
  if (new Date(tutor.setup_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Token has expired' }, { status: 400 });
  }

  const password_hash = await bcrypt.hash(password, 12);
  await supabase.from('tutors').update({
    password_hash,
    setup_token: null,
    setup_token_expires_at: null,
  }).eq('id', tutor.id);

  return NextResponse.json({ ok: true });
}
