import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { awardXP } from '@/lib/xp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  const { data: student } = await supabase
    .from('students')
    .select('id, name, portal_setup_token_expires_at')
    .eq('portal_setup_token', token)
    .maybeSingle();

  if (!student) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });

  const expires = student.portal_setup_token_expires_at
    ? new Date(student.portal_setup_token_expires_at)
    : null;
  if (!expires || expires < new Date()) {
    return NextResponse.json({ error: 'Token expired' }, { status: 400 });
  }

  return NextResponse.json({ studentId: student.id, studentName: student.name });
}

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();
  if (!token || !password) return NextResponse.json({ error: 'Token and password required' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  const { data: student } = await supabase
    .from('students')
    .select('id, portal_setup_token_expires_at, portal_password_hash')
    .eq('portal_setup_token', token)
    .maybeSingle();

  if (!student) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });

  const expires = student.portal_setup_token_expires_at
    ? new Date(student.portal_setup_token_expires_at)
    : null;
  if (!expires || expires < new Date()) {
    return NextResponse.json({ error: 'Token expired' }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 12);
  const isFirstSetup = !student.portal_password_hash;

  await supabase.from('students').update({
    portal_password_hash: hash,
    portal_setup_token: null,
    portal_setup_token_expires_at: null,
  }).eq('id', student.id);

  // Award XP for first-time setup
  if (isFirstSetup) {
    await awardXP(supabase, student.id, 25, 'portal_setup', 'Set up student portal').catch(console.error);
  }

  return NextResponse.json({ ok: true });
}
