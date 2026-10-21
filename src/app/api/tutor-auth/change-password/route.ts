import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyTutorJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword || !newPassword) return NextResponse.json({ error: 'Both passwords required' }, { status: 400 });
  if (newPassword.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  const { data: tutor } = await getDb().from('tutors').select('password_hash, archived_at').eq('id', payload.tutorId).single();
  if (tutor?.archived_at !== null) {
    return NextResponse.json({ error: 'Account inactive. Contact your administrator.' }, { status: 403 });
  }
  if (!tutor?.password_hash) return NextResponse.json({ error: 'No password set' }, { status: 400 });

  const valid = await bcrypt.compare(currentPassword, tutor.password_hash);
  if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });

  const password_hash = await bcrypt.hash(newPassword, 12);
  await getDb().from('tutors').update({ password_hash }).eq('id', payload.tutorId);
  return NextResponse.json({ ok: true });
}
