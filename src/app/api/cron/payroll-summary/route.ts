import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createClient } from '@supabase/supabase-js';
import { startOfWeek, endOfWeek, subWeeks, format } from 'date-fns';
import { postToSlack } from '@/lib/slack';
import { computePayableMinutes } from '@/lib/payroll';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;
  const now = new Date();
  const prevWeek    = subWeeks(now, 1);
  const periodStart = format(startOfWeek(prevWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const periodEnd   = format(endOfWeek(prevWeek,   { weekStartsOn: 1 }), 'yyyy-MM-dd');

  // Payroll is attendance-gated: tutor_attended=true → pay, false → $0, null → pending review.
  // ghost_pending/ghost_confirmed sessions are excluded from pay entirely.
  const { data: sessions, error } = await getDb()
    .from('sessions')
    .select('id, tutor_id, duration_minutes, tutor_attended, tutor:tutors(name, hourly_rate)')
    .eq('status', 'completed')
    .gte('scheduled_at', periodStart + 'T00:00:00.000Z')
    .lte('scheduled_at', periodEnd   + 'T23:59:59.999Z')
    .or('attendance_review_status.is.null,attendance_review_status.eq.real_confirmed');

  if (error) {
    console.error('payroll-summary cron error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Fetch session_reports for all sessions in batches of 200 (URL length safety)
  const allSessionIds = (sessions ?? []).map((s: any) => s.id as string);
  const loggedSessionIds = new Set<string>();
  const BATCH_SIZE = 200;
  for (let i = 0; i < allSessionIds.length; i += BATCH_SIZE) {
    const chunk = allSessionIds.slice(i, i + BATCH_SIZE);
    const { data: logs } = await getDb()
      .from('session_reports')
      .select('session_id')
      .in('session_id', chunk);
    for (const log of logs ?? []) loggedSessionIds.add(log.session_id);
  }

  // Group by tutor
  const map = new Map<string, {
    tutorName: string;
    sessionsCount: number;
    logsFiled: number;
    absentSessions: number;  // tutor_attended === false
    pendingReview: number;   // tutor_attended === null
    totalMinutes: number;    // attended sessions only
    payableMinutes: number;  // rounded per policy
    hourlyRate: number;
    amountOwed: number;
  }>();

  const tutorsWithoutRate: { id: string; name: string }[] = [];
  const skippedTutorIds = new Set<string>();

  for (const s of sessions ?? []) {
    const tutor = (s as any).tutor;
    if (!tutor || !s.tutor_id) continue;
    if (tutor.hourly_rate == null) {
      if (!skippedTutorIds.has(s.tutor_id)) {
        tutorsWithoutRate.push({ id: s.tutor_id, name: tutor.name });
        skippedTutorIds.add(s.tutor_id);
      }
      continue;
    }
    if (!map.has(s.tutor_id)) {
      map.set(s.tutor_id, {
        tutorName:      tutor.name,
        sessionsCount:  0,
        logsFiled:      0,
        absentSessions: 0,
        pendingReview:  0,
        totalMinutes:   0,
        payableMinutes: 0,
        hourlyRate:     tutor.hourly_rate,
        amountOwed:     0,
      });
    }
    const line = map.get(s.tutor_id)!;
    const sessionMinutes = (s as any).duration_minutes ?? 0;
    const attended = (s as any).tutor_attended as boolean | null;
    line.sessionsCount += 1;
    if (loggedSessionIds.has(s.id)) line.logsFiled += 1;
    if (attended === false) {
      line.absentSessions += 1;
    } else if (attended === null) {
      line.pendingReview += 1;
    } else {
      line.totalMinutes   += sessionMinutes;
      line.payableMinutes += computePayableMinutes(sessionMinutes);
    }
    line.amountOwed = parseFloat(((line.payableMinutes / 60) * line.hourlyRate).toFixed(2));
  }

  // Alert if any tutors were skipped due to missing hourly rate
  if (tutorsWithoutRate.length > 0) {
    const names = tutorsWithoutRate.map(t => t.name).join(', ');
    const msg = `🚨 Payroll summary skipped ${tutorsWithoutRate.length} tutor(s) with no hourly rate: ${names}. Set their rates at /tutors and re-run.`;
    console.error('[payroll-summary]', msg);
    postToSlack(msg).catch(err => console.error('[payroll-summary] Slack alert failed:', err));
  }

  const lines = Array.from(map.values()).sort((a, b) => a.tutorName.localeCompare(b.tutorName));
  const totalAmount = lines.reduce((sum, l) => sum + l.amountOwed, 0);

  if (lines.length === 0) {
    return NextResponse.json({ ok: true, message: 'No sessions to report', periodStart, periodEnd });
  }

  // Build Slack message
  const tutorLines = lines.map(l => {
    const hasIssue = l.pendingReview > 0 || l.logsFiled < l.sessionsCount;
    const prefix = hasIssue ? '⚠️' : '✅';
    return `${prefix} *${l.tutorName}*: ${l.sessionsCount} sessions, ${l.logsFiled} reports filed, ${l.absentSessions} absent, ${l.pendingReview} pending — $${l.amountOwed.toFixed(2)} (${l.payableMinutes} min @ $${l.hourlyRate}/hr)`;
  });

  const slackMsg = [
    `📊 *Weekly Payroll Summary*`,
    `Period: ${periodStart} to ${periodEnd}`,
    `Total: *$${totalAmount.toFixed(2)}*`,
    ``,
    ...tutorLines,
  ].join('\n');

  postToSlack(slackMsg).catch(err => console.error('[payroll-summary] Slack post failed:', err));

  return NextResponse.json({ ok: true, periodStart, periodEnd, tutors: lines.length, totalAmount });
}
