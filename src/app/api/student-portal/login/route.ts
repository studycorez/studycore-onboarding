import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { signStudentJWT, STUDENT_COOKIE_NAME, STUDENT_COOKIE_OPTIONS } from '@/lib/student-auth';

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

  const { data: student } = await getDb()
    .from('students')
    .select('id, name, email, portal_password_hash')
    .ilike('email', email.trim())
    .maybeSingle();

  if (!student || !student.portal_password_hash) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, student.portal_password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  await getDb().from('students').update({ portal_last_login_at: new Date().toISOString() }).eq('id', student.id);

  const token = await signStudentJWT({
    studentId: student.id,
    studentName: student.name,
    studentEmail: student.email,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(STUDENT_COOKIE_NAME, token, STUDENT_COOKIE_OPTIONS);
  return res;
}
