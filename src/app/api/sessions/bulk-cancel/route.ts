import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getStudentEmails, sendCancellationToStudent, sendCancellationToTutor } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const { sessionIds } = await req.json() as { sessionIds: string[] };
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      return NextResponse.json({ error: 'No session IDs provided' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Fetch the sessions with tutor + student info
    const { data: sessions, error: fetchErr } = await supabase
      .from('sessions')
      .select('id, scheduled_at, tutor:tutors(name, email), student:students(id, name, email, parent_email, timezone)')
      .in('id', sessionIds);

    if (fetchErr) throw fetchErr;

    // Update all to cancelled
    const { error: updateErr } = await supabase
      .from('sessions')
      .update({ status: 'cancelled' })
      .in('id', sessionIds);

    if (updateErr) throw updateErr;

    // Send emails non-blocking
    for (const s of sessions ?? []) {
      const tutor = s.tutor as any;
      const student = s.student as any;
      if (!tutor || !student) continue;

      const studentEmails = await getStudentEmails(student.id, student.email);

      sendCancellationToStudent({
        toEmails: studentEmails,
        studentName: student.name,
        tutorName: tutor.name,
        scheduledAt: s.scheduled_at,
        timezone: student.timezone ?? undefined,
      }).catch(err => console.error('cancellation student email failed:', err));

      if (tutor.email) {
        sendCancellationToTutor({
          tutorEmail: tutor.email,
          tutorName: tutor.name,
          studentName: student.name,
          scheduledAt: s.scheduled_at,
          timezone: student.timezone ?? undefined,
        }).catch(err => console.error('cancellation tutor email failed:', err));
      }
    }

    return NextResponse.json({ ok: true, cancelled: sessionIds.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
