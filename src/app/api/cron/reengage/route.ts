import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendReengagementEmail } from '@/lib/email';
import { subDays } from 'date-fns';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const dynamic = 'force-dynamic';

export async function GET() {
  const now       = new Date();
  const day14Ago  = subDays(now, 14);
  const day7Ago   = subDays(now, 7);

  // Students who are active
  const { data: activeStudents, error: stuErr } = await supabase
    .from('students')
    .select('id, name, parent_email, parent_name, last_reengage_sent_at')
    .eq('status', 'active')
    .not('parent_email', 'is', null);

  if (stuErr) return NextResponse.json({ error: stuErr.message }, { status: 500 });

  // Recent sessions (completed or scheduled in the last 14 days or upcoming)
  const { data: recentSessions } = await supabase
    .from('sessions')
    .select('student_id, scheduled_at, status')
    .gte('scheduled_at', day14Ago.toISOString())
    .in('status', ['completed', 'scheduled', 'no_show_student']);

  const { data: upcomingSessions } = await supabase
    .from('sessions')
    .select('student_id')
    .eq('status', 'scheduled')
    .gte('scheduled_at', now.toISOString());

  const recentStudentIds  = new Set((recentSessions ?? []).map(s => s.student_id));
  const upcomingStudentIds = new Set((upcomingSessions ?? []).map(s => s.student_id));

  let sent = 0;
  let failed = 0;

  for (const student of activeStudents ?? []) {
    // Skip if they have a recent or upcoming session
    if (recentStudentIds.has(student.id)) continue;
    if (upcomingStudentIds.has(student.id)) continue;

    // Deduplicate: skip if already sent within the past 7 days
    if (student.last_reengage_sent_at) {
      const lastSent = new Date(student.last_reengage_sent_at);
      if (lastSent > day7Ago) continue;
    }

    if (!student.parent_email) continue;

    try {
      await sendReengagementEmail({
        parentEmail: student.parent_email,
        parentName:  student.parent_name ?? 'Parent',
        studentName: student.name,
      });
      // Record send time to prevent duplicates
      await supabase
        .from('students')
        .update({ last_reengage_sent_at: now.toISOString() })
        .eq('id', student.id);
      sent++;
    } catch (err) {
      console.error('reengage send error:', student.id, err);
      failed++;
    }
  }

  return NextResponse.json({ sent, failed });
}
