import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { sendStudentSetupLink } from '@/lib/email';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
if (!process.env.NEXT_PUBLIC_APP_URL) throw new Error('NEXT_PUBLIC_APP_URL is not set');
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export async function POST(req: NextRequest) {
  const { student_id } = await req.json();
  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  const { data: student, error: fetchErr } = await supabase
    .from('students')
    .select('id, name, email')
    .eq('id', student_id)
    .single();

  if (fetchErr || !student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }
  if (!student.email) {
    return NextResponse.json({ error: 'Student has no email on file' }, { status: 400 });
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  await supabase.from('students').update({
    portal_setup_token: token,
    portal_setup_token_expires_at: expiresAt,
  }).eq('id', student_id);

  const result = await sendStudentSetupLink({
    studentName: student.name,
    studentEmail: student.email,
    token,
    appUrl: APP_URL,
  });

  if ((result as any).error) {
    return NextResponse.json({ error: (result as any).error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, emailId: (result as any).data?.id });
}
