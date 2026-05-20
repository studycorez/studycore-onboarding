import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';
import { PAYROLL_CUTOFF, BACKLOG_WINDOW_END } from '@/lib/payroll-eligibility';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();

  // Fetch completed sessions from last 30 days for this tutor
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, status, late_filing_requested_at, late_filing_approved_at, student:students(id, name)')
    .eq('tutor_id', payload.tutorId)
    .gte('scheduled_at', since)
    .in('status', ['completed', 'scheduled'])
    .order('scheduled_at', { ascending: false });

  if (!sessions?.length) {
    return NextResponse.json({ pending: [], filed_recently: [], past: [] });
  }

  const sessionIds = sessions.map((s: any) => s.id as string);

  const { data: reports } = await supabase
    .from('session_reports')
    .select('id, session_id, submitted_at, edit_requested_at, edit_unlocked_until, topics_covered, engagement_rating')
    .in('session_id', sessionIds);

  const reportBySessionId = new Map((reports ?? []).map((r: any) => [r.session_id, r]));

  const now = Date.now();
  const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
  const SIXTY_MIN_MS = 60 * 60 * 1000;
  const payrollCutoffMs  = new Date(PAYROLL_CUTOFF).getTime();
  const backlogWindowEndMs = new Date(BACKLOG_WINDOW_END).getTime();
  const backlogWindowOpen  = now < backlogWindowEndMs;

  const pending:       any[] = [];
  const backlog:       any[] = [];
  const filedRecently: any[] = [];
  const past:          any[] = [];
  const pastDue:       any[] = [];

  for (const s of sessions as any[]) {
    const scheduledMs  = new Date(s.scheduled_at).getTime();
    const msSince      = now - scheduledMs;
    const report       = reportBySessionId.get(s.id) ?? null;
    const studentName  = s.student?.name ?? '—';

    if (!report) {
      // No report filed yet
      if (s.status === 'completed' && msSince <= SEVENTY_TWO_HOURS_MS) {
        const hoursLeft = (SEVENTY_TWO_HOURS_MS - msSince) / (1000 * 60 * 60);
        pending.push({
          session_id:         s.id,
          scheduled_at:       s.scheduled_at,
          duration_minutes:   s.duration_minutes,
          student_name:       studentName,
          hours_until_cutoff: Math.round(hoursLeft * 10) / 10,
        });
      } else if (s.status === 'completed' && msSince > SEVENTY_TWO_HOURS_MS) {
        const scheduledMs = new Date(s.scheduled_at).getTime();
        const isBacklog = scheduledMs >= payrollCutoffMs && backlogWindowOpen;
        if (isBacklog) {
          // Backlog window: session is >= PAYROLL_CUTOFF and window is still open —
          // tutor can file without admin approval. Surface distinctly from pending.
          backlog.push({
            session_id:       s.id,
            scheduled_at:     s.scheduled_at,
            duration_minutes: s.duration_minutes,
            student_name:     studentName,
          });
        } else {
          // Past the 72hr window, not in backlog — late filing territory
          pastDue.push({
            session_id:                s.id,
            scheduled_at:              s.scheduled_at,
            duration_minutes:          s.duration_minutes,
            student_name:              studentName,
            late_filing_requested_at:  s.late_filing_requested_at ?? null,
            late_filing_approved_at:   s.late_filing_approved_at ?? null,
          });
        }
      }
    } else {
      // null submitted_at means the report was just filed (pre-fix rows): treat as auto-editable
      const submittedMs      = report.submitted_at ? new Date(report.submitted_at).getTime() : now;
      const mssinceSubmit    = now - submittedMs;
      const isAutoEditable   = mssinceSubmit <= SIXTY_MIN_MS;
      const isAdminUnlocked  = report.edit_unlocked_until
        ? new Date(report.edit_unlocked_until).getTime() > now
        : false;

      const row = {
        session_id:          s.id,
        report_id:           report.id,
        scheduled_at:        s.scheduled_at,
        duration_minutes:    s.duration_minutes,
        student_name:        studentName,
        submitted_at:        report.submitted_at,
        minutes_since_submit: Math.round(mssinceSubmit / (1000 * 60)),
        is_auto_editable:    isAutoEditable,
        is_admin_unlocked:   isAdminUnlocked,
        edit_requested_at:   report.edit_requested_at,
        edit_unlocked_until: report.edit_unlocked_until,
        topics_preview:      report.topics_covered ? (report.topics_covered as string).slice(0, 80) : null,
      };

      if (isAutoEditable) {
        filedRecently.push(row);
      } else {
        past.push(row);
      }
    }
  }

  return NextResponse.json({ pending, backlog, filed_recently: filedRecently, past, past_due: pastDue });
}

