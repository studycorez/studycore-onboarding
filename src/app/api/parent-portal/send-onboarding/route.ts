import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { signParentJWT } from '@/lib/parent-auth';
import { sendParentOnboardingEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
if (!process.env.NEXT_PUBLIC_APP_URL) throw new Error('NEXT_PUBLIC_APP_URL is not set');
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export async function POST(req: NextRequest) {
  const { student_id } = await req.json();
  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  const { data: student, error: fetchErr } = await getDb()
    .from('students')
    .select('id, name, parent_email, parent_name, parent_phone, game_plan_url')
    .eq('id', student_id)
    .single();

  if (fetchErr || !student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }
  if (!student.parent_email) {
    return NextResponse.json({ error: 'Student has no parent email on file' }, { status: 400 });
  }

  // Look up the assigned tutor via the most recent signed contract
  const { data: contract } = await getDb()
    .from('contracts')
    .select('tutors(name)')
    .eq('student_id', student_id)
    .eq('status', 'signed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const tutorName: string | null = (contract?.tutors as any)?.name ?? null;

  const token = await signParentJWT({ parentEmail: student.parent_email.toLowerCase() });
  const magicLink = `${APP_URL}/api/parent-portal/verify?token=${encodeURIComponent(token)}`;

  const result = await sendParentOnboardingEmail({
    parentEmail: student.parent_email,
    parentName:  student.parent_name,
    studentName: student.name,
    magicLink,
    tutorName,
    gamePlanUrl: (student as any).game_plan_url ?? null,
  });

  if ((result as any).error) {
    return NextResponse.json({ error: (result as any).error.message }, { status: 500 });
  }

  // Send welcome SMS to parent if phone on file
  if (student.parent_phone) {
    const firstName = student.parent_name ? student.parent_name.trim().split(/\s+/)[0] : 'there';
    const welcomeSms = `Hi ${firstName}! Welcome to StudyCore — ${student.name}'s tutoring account is all set up. You'll receive session reminders via text. Questions? Email support@studycore.net`;
    sendSMS(student.parent_phone, welcomeSms).catch(err =>
      console.error('Welcome SMS failed:', err)
    );
  }

  await getDb().from('students').update({
    onboarding_email_sent:    true,
    onboarding_email_sent_at: new Date().toISOString(),
  }).eq('id', student_id);

  return NextResponse.json({ ok: true });
}
