import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { signParentJWT } from '@/lib/parent-auth';
import { sendParentOnboardingEmail } from '@/lib/email';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  const { student_id } = await req.json();
  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  const { data: student, error: fetchErr } = await supabase
    .from('students')
    .select('id, name, parent_email, parent_name')
    .eq('id', student_id)
    .single();

  if (fetchErr || !student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }
  if (!student.parent_email) {
    return NextResponse.json({ error: 'Student has no parent email on file' }, { status: 400 });
  }

  const token = await signParentJWT({ parentEmail: student.parent_email.toLowerCase() });
  const magicLink = `${APP_URL}/api/parent-portal/verify?token=${encodeURIComponent(token)}`;

  const result = await sendParentOnboardingEmail({
    parentEmail: student.parent_email,
    parentName: student.parent_name,
    studentName: student.name,
    magicLink,
  });

  if ((result as any).error) {
    return NextResponse.json({ error: (result as any).error.message }, { status: 500 });
  }

  await supabase.from('students').update({
    onboarding_email_sent: true,
    onboarding_email_sent_at: new Date().toISOString(),
  }).eq('id', student_id);

  return NextResponse.json({ ok: true });
}
