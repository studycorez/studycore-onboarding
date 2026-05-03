import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendPostSessionToStudent, sendPostSessionToTutor } from '@/lib/email';

export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: session } = await supabase
    .from('sessions')
    .select('*, tutor:tutors(*), student:students(*)')
    .eq('id', sessionId)
    .single();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const { tutor, student } = session as any;

  await Promise.allSettled([
    sendPostSessionToStudent({
      studentEmail: student.email,
      parentEmail:  student.parent_email,
      studentName:  student.name,
      tutorName:    tutor.name,
    }),
    sendPostSessionToTutor({
      tutorEmail:  tutor.email,
      tutorName:   tutor.name,
      studentName: student.name,
      sessionId:   sessionId,
      appUrl:      process.env.NEXT_PUBLIC_APP_URL!,
    }),
  ]);

  return NextResponse.json({ ok: true });
}
