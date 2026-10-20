import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { format } from 'date-fns';
import { formatDt } from '@/lib/email';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
function getResend() { return new Resend(process.env.RESEND_API_KEY); }
const FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@studycore.net';
const ADMIN_EMAIL = 'info@studycore.net';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { type } = (await req.json()) as { type: 'student' | 'tutor' | 'both' };
  if (!['student', 'tutor', 'both'].includes(type)) {
    return NextResponse.json({ error: 'type must be student, tutor, or both' }, { status: 400 });
  }

  const statusMap = {
    student: 'no_show_student',
    tutor:   'no_show_tutor',
    both:    'no_show_both',
  } as const;
  const newStatus = statusMap[type];

  // Fetch session with joins
  const { data: session, error: fetchErr } = await supabase
    .from('sessions')
    .select('*, tutor:tutors(name, email), student:students(name, email, timezone)')
    .eq('id', params.id)
    .single();

  if (fetchErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const tutor   = (session as any).tutor   as { name: string; email: string } | null;
  const student = (session as any).student as { name: string; email: string; timezone?: string } | null;
  const studentTz = student?.timezone ?? 'America/New_York';
  const dt = formatDt(session.scheduled_at, studentTz);
  const noteEntry = `[No-show: ${type}] Marked on ${format(new Date(), 'MMM d, yyyy h:mm a')}`;
  const updatedNotes = session.session_notes
    ? `${session.session_notes}\n${noteEntry}`
    : noteEntry;

  // Update session
  const { error: updateErr } = await supabase
    .from('sessions')
    .update({ status: newStatus, session_notes: updatedNotes })
    .eq('id', params.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Email admin when tutor no-showed
  if (type === 'tutor' || type === 'both') {
    const subject = `Tutor No-Show — ${tutor?.name ?? 'Unknown Tutor'} on ${dt}`;
    const html = `
      <p>A tutor no-show has been recorded.</p>
      <ul>
        <li><strong>Tutor:</strong> ${tutor?.name ?? '—'} (${tutor?.email ?? '—'})</li>
        <li><strong>Student:</strong> ${student?.name ?? '—'}</li>
        <li><strong>Session:</strong> ${dt}</li>
        <li><strong>Type:</strong> ${type === 'both' ? 'Both student and tutor' : 'Tutor'}</li>
      </ul>
      <p>Please follow up with the tutor.</p>
    `;
    await getResend().emails.send({ from: FROM, to: ADMIN_EMAIL, reply_to: 'support@studycore.net', subject, html }).catch(console.error);
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
