import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createClient } from '@supabase/supabase-js';
import { sendMidweekCheckin } from '@/lib/email';
import { addDays } from 'date-fns';

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
  // Only runs on Wednesdays (vercel cron enforces schedule, but double-check)
  const dayOfWeek = new Date().getDay(); // 0=Sun, 3=Wed
  if (dayOfWeek !== 3) {
    return NextResponse.json({ skipped: true, reason: 'Not Wednesday' });
  }

  const now = new Date();
  const sevenDaysOut = addDays(now, 7);

  // Find active students who have a session in the next 7 days
  const { data: sessions, error } = await getDb()
    .from('sessions')
    .select('id, scheduled_at, student_id, tutor_id, student:students(name, parent_email, parent_name), tutor:tutors(name)')
    .eq('status', 'scheduled')
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', sevenDaysOut.toISOString())
    .order('scheduled_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Deduplicate — one email per parent (take their soonest session)
  const seen = new Set<string>();
  let sent = 0;
  let failed = 0;

  for (const s of sessions ?? []) {
    const student = s.student as any;
    const tutor   = s.tutor   as any;
    if (!student?.parent_email) continue;
    if (seen.has(student.parent_email)) continue;
    seen.add(student.parent_email);

    try {
      await sendMidweekCheckin({
        parentEmail:   student.parent_email,
        parentName:    student.parent_name ?? 'Parent',
        studentName:   student.name,
        tutorName:     tutor?.name ?? 'your tutor',
        nextSessionAt: s.scheduled_at,
      });
      sent++;
    } catch (err) {
      console.error('midweek-checkin send error:', err);
      failed++;
    }
  }

  return NextResponse.json({ sent, failed });
}
