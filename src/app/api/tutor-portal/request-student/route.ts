import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';
import { sendNewStudentRequestEmail } from '@/lib/email';
import { postSlackNotification } from '@/lib/slack';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: self } = await supabase.from('tutors').select('archived_at').eq('id', payload.tutorId).single();
  if (self?.archived_at !== null) {
    return NextResponse.json({ error: 'Account inactive. Contact your administrator.' }, { status: 403 });
  }

  const { student_name, parent_name, parent_email, parent_phone, grade, target_score, notes } = await req.json();
  if (!student_name || !parent_name || !parent_email) {
    return NextResponse.json({ error: 'Student name, parent name, and parent email are required.' }, { status: 400 });
  }

  const { data: tutor } = await supabase
    .from('tutors')
    .select('name, email')
    .eq('id', payload.tutorId)
    .single();

  if (!tutor) return NextResponse.json({ error: 'Tutor not found' }, { status: 404 });

  // Send email to admin
  await sendNewStudentRequestEmail({
    tutorName: tutor.name,
    tutorEmail: tutor.email,
    studentName: student_name,
    parentName: parent_name,
    parentEmail: parent_email,
    parentPhone: parent_phone || null,
    grade: grade ? parseInt(grade) : null,
    targetScore: target_score ? parseInt(target_score) : null,
    notes: notes || null,
  }).catch(() => {});

  // Send Slack notification
  const slackLines = [
    `🎓 *New Student Request from ${tutor.name}*`,
    `• Student: ${student_name}`,
    `• Parent: ${parent_name} (${parent_email})`,
    parent_phone  ? `• Phone: ${parent_phone}` : null,
    grade         ? `• Grade: ${grade}` : null,
    target_score  ? `• SAT Target: ${target_score}` : null,
    notes         ? `• Notes: ${notes}` : null,
  ].filter(Boolean).join('\n');

  await postSlackNotification(slackLines).catch(() => {});

  return NextResponse.json({ ok: true });
}
