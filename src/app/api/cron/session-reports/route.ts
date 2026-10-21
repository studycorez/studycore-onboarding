import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createClient } from '@supabase/supabase-js';
import { sendSessionReport, getStudentEmails } from '@/lib/email';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;
  // Find sessions where tutor submitted notes but parent report hasn't been sent yet
  const { data: sessions } = await getDb()
    .from('sessions')
    .select('*, tutor:tutors(name), student:students(name, email, parent_email, timezone)')
    .not('notes_submitted_at', 'is', null)
    .eq('session_report_sent', false);

  const sent: string[] = [];
  const failed: string[] = [];

  for (const s of sessions ?? []) {
    const tutor   = (s.tutor   as any);
    const student = (s.student as any);

    if (!student?.email) continue;
    if (!s.tutor_notes)  continue;

    try {
      const allEmails = await getStudentEmails(s.student_id, student.email);
      if (student.parent_email && !allEmails.includes(student.parent_email)) {
        allEmails.push(student.parent_email);
      }

      await sendSessionReport({
        toEmails: allEmails,
        studentName: student.name,
        tutorName: tutor?.name ?? 'Your tutor',
        scheduledAt: s.scheduled_at,
        durationMinutes: s.duration_minutes,
        tutorNotes: s.tutor_notes,
        homeworkAssigned: s.homework_assigned ?? null,
        sessionRating: s.session_rating ?? 3,
        timezone: student.timezone ?? undefined,
      });

      await getDb().from('sessions').update({ session_report_sent: true }).eq('id', s.id);
      sent.push(s.id);
    } catch (err) {
      console.error('[session-reports] failed', s.id, err);
      failed.push(s.id);
    }
  }

  return NextResponse.json({ ok: true, sent: sent.length, failed: failed.length, timestamp: new Date().toISOString() });
}
