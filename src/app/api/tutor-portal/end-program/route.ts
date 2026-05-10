import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';
import { sendProgramCompletedEmail } from '@/lib/email';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ADMIN_EMAIL = 'info@studycore.net';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { student_id } = await req.json();
  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  // Verify tutor has a signed contract with this student
  const { data: contract } = await supabase
    .from('contracts')
    .select('id')
    .eq('tutor_id', payload.tutorId)
    .eq('student_id', student_id)
    .eq('status', 'signed')
    .maybeSingle();

  if (!contract) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const [{ data: tutor }, { data: student }, { count }] = await Promise.all([
    supabase.from('tutors').select('name, email').eq('id', payload.tutorId).single(),
    supabase.from('students').select('name, email, parent_email').eq('id', student_id).single(),
    supabase.from('sessions').select('id', { count: 'exact', head: true })
      .eq('student_id', student_id).eq('status', 'completed'),
  ]);

  if (!tutor || !student) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await supabase.from('students').update({ status: 'completed' }).eq('id', student_id);

  const completedSessions = count ?? 0;
  const isPlaceholderEmail = !student.email ||
    student.email.endsWith('@studycore.import') ||
    student.email.startsWith('student-');

  const emailJobs: Promise<any>[] = [
    // Admin notification
    sendProgramCompletedEmail({
      to: [ADMIN_EMAIL],
      studentName: student.name,
      tutorName: tutor.name,
      completedSessions,
    }),
    // Tutor copy
    sendProgramCompletedEmail({
      to: [tutor.email],
      cc: [ADMIN_EMAIL],
      studentName: student.name,
      tutorName: tutor.name,
      completedSessions,
    }),
  ];

  if (!isPlaceholderEmail) {
    const toAddresses = [student.email];
    if (student.parent_email && !toAddresses.includes(student.parent_email)) {
      toAddresses.push(student.parent_email);
    }
    emailJobs.push(
      sendProgramCompletedEmail({
        to: toAddresses,
        cc: [ADMIN_EMAIL],
        studentName: student.name,
        tutorName: tutor.name,
        completedSessions,
      }),
    );
  }

  await Promise.allSettled(emailJobs);

  return NextResponse.json({ ok: true });
}
