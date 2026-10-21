import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { signTutorJWT, COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/tutor-auth';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }

  const { data: tutor } = await getDb()
    .from('tutors')
    .select('id, name, email, password_hash, archived_at, airtable_tutor_id')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (!tutor || !tutor.password_hash) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  if (tutor.archived_at !== null) {
    return NextResponse.json({ error: 'Account inactive. Contact your administrator.' }, { status: 403 });
  }

  const valid = await bcrypt.compare(password, tutor.password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  await getDb().from('tutors').update({ last_login_at: new Date().toISOString() }).eq('id', tutor.id);

  const token = await signTutorJWT({
    tutorId:    tutor.id,
    tutorName:  tutor.name,
    tutorEmail: tutor.email,
    ...(tutor.airtable_tutor_id ? { airtableId: tutor.airtable_tutor_id } : {}),
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTIONS);
  return res;
}
