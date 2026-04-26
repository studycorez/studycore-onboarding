import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { subDays, startOfWeek, endOfWeek } from 'date-fns';
import { sendWeeklyReport } from '@/lib/email';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date();
  // Week = Mon–Sun containing "now"
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(now,   { weekStartsOn: 1 });
  const pastWeekStart = subDays(now, 7);

  // ── 1. Get active students (signed contract + purchased_hours > 0) ─────────
  const { data: signedContracts } = await supabase
    .from('contracts')
    .select('student_id')
    .eq('status', 'signed');

  const idSet = new Set((signedContracts ?? []).map((c: any) => c.student_id as string));
  const activeIds = Array.from(idSet);
  if (activeIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No active students' });
  }

  const { data: students } = await supabase
    .from('students')
    .select('*')
    .in('id', activeIds)
    .gt('purchased_hours', 0)
    .not('parent_email', 'is', null);

  const sent: string[] = [];
  const failed: string[] = [];

  for (const student of students ?? []) {
    try {
      // ── Sessions this week with their logs ───────────────────────────────
      const { data: rawSessions } = await supabase
        .from('sessions')
        .select('*, tutor:tutors(name), session_logs(*)')
        .eq('student_id', student.id)
        .gte('scheduled_at', pastWeekStart.toISOString())
        .lte('scheduled_at', now.toISOString())
        .in('status', ['completed', 'scheduled'])
        .order('scheduled_at');

      const sessions = (rawSessions ?? []).map((s: any) => ({
        scheduledAt:     s.scheduled_at,
        tutorName:       s.tutor?.name ?? '—',
        durationMinutes: s.duration_minutes,
        wentWell:        s.session_logs?.[0]?.went_well ?? null,
        issues:          s.session_logs?.[0]?.issues ?? null,
      }));

      // ── Latest progress from session logs this week ──────────────────────
      const logsWithScores = (rawSessions ?? [])
        .map((s: any) => s.session_logs?.[0])
        .filter((l: any) => l && (l.math_score || l.reading_score || l.writing_score))
        .sort((a: any, b: any) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());

      const latest = logsWithScores[0] ?? null;
      const latestProgress = latest ? {
        mathScore:       latest.math_score    ?? null,
        readingScore:    latest.reading_score ?? null,
        writingScore:    latest.writing_score ?? null,
        totalScore:      (latest.math_score ?? 0) + (latest.reading_score ?? 0) + (latest.writing_score ?? 0) || null,
        confidenceLevel: latest.confidence_level ?? null,
      } : null;

      // ── Next upcoming session ────────────────────────────────────────────
      const { data: upcomingSessions } = await supabase
        .from('sessions')
        .select('scheduled_at, tutor:tutors(name)')
        .eq('student_id', student.id)
        .eq('status', 'scheduled')
        .gt('scheduled_at', now.toISOString())
        .order('scheduled_at')
        .limit(1);

      const next = upcomingSessions?.[0] as any ?? null;
      const nextSession = next ? { scheduledAt: next.scheduled_at, tutorName: next.tutor?.name ?? '—' } : null;

      await sendWeeklyReport({
        studentName:    student.name,
        parentName:     student.parent_name,
        parentEmail:    student.parent_email,
        weekStart:      weekStart.toISOString(),
        weekEnd:        weekEnd.toISOString(),
        sessions,
        latestProgress,
        purchasedHours: student.purchased_hours ?? 0,
        usedHours:      student.used_hours ?? 0,
        nextSession,
      });

      sent.push(student.name);
    } catch (err: any) {
      console.error(`Weekly report failed for ${student.name}:`, err);
      failed.push(student.name);
    }
  }

  return NextResponse.json({
    ok: true,
    sent: sent.length,
    failed: failed.length,
    sentTo: sent,
    failedFor: failed,
    timestamp: now.toISOString(),
  });
}
