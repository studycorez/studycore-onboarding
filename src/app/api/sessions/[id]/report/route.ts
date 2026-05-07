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

    // Send report to parent (non-blocking)
    sendParentReport(params.id, {
      topics_covered: topics_covered.trim(),
      homework_assigned: homework_assigned?.trim() || null,
      homework_due_date: homework_due_date || null,
      student_engagement,
      session_notes: session_notes?.trim() || null,
      next_session_plan: next_session_plan?.trim() || null,
    }).catch(err => console.error('[report] parent email failed', err));

    // Notify Slack (non-blocking)
    notifySlack(params.id, {
      topics_covered: topics_covered.trim(),
      homework_assigned: homework_assigned?.trim() || null,
      student_engagement,
      session_notes: session_notes?.trim() || null,
    }).catch(err => console.error('[report] slack notify failed', err));

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}

async function notifySlack(sessionId: string, fields: {
  topics_covered: string;
  homework_assigned: string | null;
  student_engagement: number;
  session_notes: string | null;
}) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const { data: session } = await supabase
    .from('sessions')
    .select('scheduled_at, tutor:tutors(name), student:students(name)')
    .eq('id', sessionId)
    .single();

  if (!session) return;

  const studentName = (session as any).student?.name ?? 'Unknown student';
  const tutorName   = (session as any).tutor?.name   ?? 'Unknown tutor';
  const sessionDate = new Date(session.scheduled_at).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
  const stars = '⭐'.repeat(fields.student_engagement);
  const notesTruncated = fields.session_notes && fields.session_notes.length > 200
    ? fields.session_notes.slice(0, 200) + '…'
    : fields.session_notes;

  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📋 Session Report Submitted', emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Student:*\n${studentName}` },
        { type: 'mrkdwn', text: `*Tutor:*\n${tutorName}` },
        { type: 'mrkdwn', text: `*Session Date:*\n${sessionDate}` },
        { type: 'mrkdwn', text: `*Engagement:*\n${stars}` },
      ],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Topics Covered:*\n${fields.topics_covered}` },
    },
  ];

  if (notesTruncated) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Session Notes:*\n${notesTruncated}` },
    });
  }

  if (fields.homework_assigned) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Homework Assigned:*\n${fields.homework_assigned}` },
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'View Session Reports →', emoji: true },
        url: 'https://studycore-eight.vercel.app/admin/session-reports',
      },
    ],
  });

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  });
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
