import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendPaymentNotification } from '@/lib/email';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface PayrollLine {
  tutor_id: string;
  tutor_name: string;
  sessions_count: number;
  total_minutes: number;
  amount_owed: number;
}

export async function POST(req: NextRequest) {
  const { lines, period_start, period_end } = await req.json() as {
    lines: PayrollLine[];
    period_start: string;
    period_end: string;
  };

  if (!lines?.length || !period_start || !period_end) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Show archived tutors here — payroll emails go to tutors for work already done; must include archived tutors
  const tutorIds = lines.map(l => l.tutor_id);
  const { data: tutors } = await supabase
    .from('tutors')
    .select('id, email')
    .in('id', tutorIds);

  const emailMap = new Map((tutors ?? []).map(t => [t.id, t.email]));

  let sent = 0;
  let failed = 0;

  for (const line of lines) {
    const email = emailMap.get(line.tutor_id);
    if (!email) { failed++; continue; }

    try {
      await sendPaymentNotification({
        tutorEmail:    email,
        tutorName:     line.tutor_name,
        periodStart:   period_start,
        periodEnd:     period_end,
        sessionsCount: line.sessions_count,
        totalHours:    line.total_minutes / 60,
        amountOwed:    line.amount_owed,
      });
      sent++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ ok: true, sent, failed });
}
