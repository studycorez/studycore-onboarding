import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { startOfWeek, endOfWeek, subWeeks, format } from 'date-fns';
import { sendPayrollSummary } from '@/lib/email';
import { computePayableMinutes } from '@/lib/payroll';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date();
  const prevWeek    = subWeeks(now, 1);
  const periodStart = format(startOfWeek(prevWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const periodEnd   = format(endOfWeek(prevWeek,   { weekStartsOn: 1 }), 'yyyy-MM-dd');

  // Payroll no longer requires a session_log — scheduled duration is source of truth.
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, tutor_id, duration_minutes, tutor:tutors(name, hourly_rate)')
    .eq('status', 'completed')
    .gte('scheduled_at', periodStart + 'T00:00:00.000Z')
    .lte('scheduled_at', periodEnd   + 'T23:59:59.999Z');

  if (error) {
    console.error('payroll-summary cron error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Fetch session_logs for all sessions in batches of 200 (URL length safety)
  const allSessionIds = (sessions ?? []).map((s: any) => s.id as string);
  const loggedSessionIds = new Set<string>();
  const BATCH_SIZE = 200;
  for (let i = 0; i < allSessionIds.length; i += BATCH_SIZE) {
    const chunk = allSessionIds.slice(i, i + BATCH_SIZE);
    const { data: logs } = await supabase
      .from('session_logs')
      .select('session_id')
      .in('session_id', chunk);
    for (const log of logs ?? []) loggedSessionIds.add(log.session_id);
  }

  // Group by tutor
  const map = new Map<string, {
    tutorName: string;
    sessionsCount: number;
    logsFiled: number;
    totalMinutes: number;   // scheduled minutes (source of truth per policy)
    payableMinutes: number; // rounded per policy (used for pay calc)
    hourlyRate: number;
    amountOwed: number;
  }>();

  for (const s of sessions ?? []) {
    const tutor = (s as any).tutor;
    if (!tutor || !s.tutor_id) continue;
    if (!map.has(s.tutor_id)) {
      map.set(s.tutor_id, {
        tutorName:      tutor.name,
        sessionsCount:  0,
        logsFiled:      0,
        totalMinutes:   0,
        payableMinutes: 0,
        hourlyRate:     tutor.hourly_rate ?? 0,
        amountOwed:     0,
      });
    }
    const line = map.get(s.tutor_id)!;
    const sessionMinutes = s.duration_minutes ?? 0;
    line.sessionsCount  += 1;
    if (loggedSessionIds.has(s.id)) line.logsFiled += 1;
    line.totalMinutes   += sessionMinutes;
    line.payableMinutes += computePayableMinutes(sessionMinutes);
    line.amountOwed      = parseFloat(((line.payableMinutes / 60) * line.hourlyRate).toFixed(2));
  }

  const lines = Array.from(map.values()).sort((a, b) => a.tutorName.localeCompare(b.tutorName));
  const totalAmount = lines.reduce((sum, l) => sum + l.amountOwed, 0);

  if (lines.length === 0) {
    return NextResponse.json({ ok: true, message: 'No sessions to report', periodStart, periodEnd });
  }

  if (!process.env.NEXT_PUBLIC_APP_URL) throw new Error('NEXT_PUBLIC_APP_URL is not set');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  try {
    await sendPayrollSummary({ periodStart, periodEnd, lines, totalAmount, appUrl });
    return NextResponse.json({ ok: true, periodStart, periodEnd, tutors: lines.length, totalAmount });
  } catch (err: any) {
    console.error('payroll-summary email error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
