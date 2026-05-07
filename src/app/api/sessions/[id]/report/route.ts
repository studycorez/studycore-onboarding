import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendFullSessionReportToParent, getStudentEmails } from '@/lib/email';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const {
      topics_covered,
      homework_assigned,
      homework_due_date,
      student_engagement,
      session_notes,
      next_session_plan,
    } = await req.json();

    if (!topics_covered?.trim()) {
      return NextResponse.json({ error: 'Topics covered is required' }, { status: 400 });
    }
    if (!student_engagement || student_engagement < 1 || student_engagement > 5) {
      return NextResponse.json({ error: 'Student engagement (1–5) is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('sessions')
      .update({
        topics_covered: topics_covered.trim(),
        homework_assigned: homework_assigned?.trim() || null,
        homework_due_date: homework_due_date || null,
        student_engagement,
        session_notes: session_notes?.trim() || null,
        next_session_plan: next_session_plan?.trim() || null,
        report_submitted: true,
        report_submitted_at: new Date().toISOString(),
        ...(session_notes?.trim() ? { tutor_notes: session_notes.trim() } : {}),
      })
      .eq('id', params.id);

    if (error) throw error;

    // Send report to parent (non-blocking — don't fail the request if email fails)
    sendParentReport(params.id, {
      topics_covered: topics_covered.trim(),
      homework_assigned: homework_assigned?.trim() || null,
      homework_due_date: homework_due_date || null,
      student_engagement,
      session_notes: session_notes?.trim() || null,
      next_session_plan: next_session_plan?.trim() || null,
    }).catch(err => console.error('[report] parent email failed', err));

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}

async function sendParentReport(sessionId: string, fields: {
  topics_covered: string;
  homework_assigned: string | null;
  homework_due_date: string | null;
  student_engagement: number;
  session_notes: string | null;
  next_session_plan: string | null;
}) {
  const { data: session } = await supabase
    .from('sessions')
    .select('scheduled_at, duration_minutes, fathom_recording_url, report_sent_to_parent, tutor:tutors(name), student:students(id, name, email, parent_email, timezone)')
    .eq('id', sessionId)
    .single();

  if (!session) return;
  if ((session as any).report_sent_to_parent) return; // already sent

  const student = (session as any).student;
  const tutor   = (session as any).tutor;
  if (!student?.email) return;

  const allEmails = await getStudentEmails(student.id, student.email);
  if (student.parent_email && !allEmails.includes(student.parent_email)) {
    allEmails.push(student.parent_email);
  }

  await sendFullSessionReportToParent({
    toEmails: allEmails,
    studentName: student.name,
    tutorName: tutor?.name ?? 'Your tutor',
    scheduledAt: session.scheduled_at,
    durationMinutes: session.duration_minutes,
    topicsCovered: fields.topics_covered,
    studentEngagement: fields.student_engagement,
    sessionNotes: fields.session_notes,
    homeworkAssigned: fields.homework_assigned,
    homeworkDueDate: fields.homework_due_date,
    nextSessionPlan: fields.next_session_plan,
    fathomRecordingUrl: (session as any).fathom_recording_url ?? null,
    timezone: student.timezone ?? undefined,
  });

  await supabase
    .from('sessions')
    .update({ report_sent_to_parent: true })
    .eq('id', sessionId);
}
