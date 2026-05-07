import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  subDays, subWeeks, addWeeks,
  startOfWeek, endOfWeek,
  differenceInDays,
} from 'date-fns';
import { sendWeeklyReport, getStudentEmails } from '@/lib/email';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const dynamic = 'force-dynamic';

// ── helpers ────────────────────────────────────────────────────────────────

/** Count consecutive weeks (including current) where student had ≥1 completed session. */
async function calculateStreak(studentId: string, currentWeekStart: Date): Promise<number> {
  const since = subWeeks(currentWeekStart, 51);
  const until = addWeeks(currentWeekStart, 1);

  const { data } = await supabase
    .from('sessions')
    .select('scheduled_at')
    .eq('student_id', studentId)
    .eq('status', 'completed')
    .gte('scheduled_at', since.toISOString())
    .lt('scheduled_at', until.toISOString());

  const sessions = data ?? [];
  let streak = 0;

  for (let i = 0; i < 52; i++) {
    const wStart = subWeeks(currentWeekStart, i);
    const wEnd   = addWeeks(wStart, 1);
    const hasSession = sessions.some(s => {
      const d = new Date(s.scheduled_at);
      return d >= wStart && d < wEnd;
    });
    if (hasSession) streak++;
    else break;
  }

  return streak;
}

/** Compare most-recent total_score this week vs. the one immediately before. */
async function getScoreTrend(
  studentId: string,
  weekStart: Date,
  weekEnd: Date,
): Promise<{ prevScore: number; currScore: number; delta: number } | null> {
  const [{ data: curr }, { data: prev }] = await Promise.all([
    supabase
      .from('student_progress')
      .select('total_score')
      .eq('student_id', studentId)
      .gte('recorded_at', weekStart.toISOString())
      .lte('recorded_at', weekEnd.toISOString())
      .not('total_score', 'is', null)
      .order('recorded_at', { ascending: false })
      .limit(1),
    supabase
      .from('student_progress')
      .select('total_score')
      .eq('student_id', studentId)
      .lt('recorded_at', weekStart.toISOString())
      .not('total_score', 'is', null)
      .order('recorded_at', { ascending: false })
      .limit(1),
  ]);

  if (!curr?.length || !prev?.length) return null;
  const currScore = curr[0].total_score as number;
  const prevScore = prev[0].total_score as number;
  return { prevScore, currScore, delta: currScore - prevScore };
}

/** Average hrs/week over the 3 weeks preceding currentWeekStart, plus projection. */
async function getBurnRate(
  studentId: string,
  currentWeekStart: Date,
  remainingHours: number,
): Promise<{ avgHoursPerWeek: number; weeksRemaining: number | null } | null> {
  const threeWeeksAgo = subWeeks(currentWeekStart, 3);

  const { data } = await supabase
    .from('sessions')
    .select('scheduled_at, duration_minutes')
    .eq('student_id', studentId)
    .eq('status', 'completed')
    .gte('scheduled_at', threeWeeksAgo.toISOString())
    .lt('scheduled_at', currentWeekStart.toISOString());

  if (!data?.length) return null;

  const weeklyHours: number[] = [];
  for (let i = 0; i < 3; i++) {
    const wStart = subWeeks(currentWeekStart, i + 1);
    const wEnd   = subWeeks(currentWeekStart, i);
    const hrs = data
      .filter(s => new Date(s.scheduled_at) >= wStart && new Date(s.scheduled_at) < wEnd)
      .reduce((sum, s) => sum + s.duration_minutes / 60, 0);
    weeklyHours.push(hrs);
  }

  const avg = weeklyHours.reduce((s, h) => s + h, 0) / 3;
  if (avg < 0.1) return null;

  const avgHoursPerWeek = Math.round(avg * 10) / 10;
  const weeksRemaining  = remainingHours > 0 ? Math.round(remainingHours / avgHoursPerWeek) : 0;
  return { avgHoursPerWeek, weeksRemaining };
}

/** Call Claude Haiku for a personalized parent-facing summary of the week. */
async function getAISummary(params: {
  studentName: string;
  sessions: Array<{
    tutorName: string;
    durationMinutes: number;
    topicsCovered: string | null;
    engagement: number | null;
    sessionNotes: string | null;
    homeworkAssigned: string | null;
  }>;
  currentScore: number | null;
  targetScore: number | null;
  remainingHours: number;
}): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return '';
  try {
    const sessionDetails = params.sessions.map(s => {
      const parts: string[] = [];
      if (s.topicsCovered) parts.push(`Topics: ${s.topicsCovered}`);
      if (s.engagement) parts.push(`Engagement: ${s.engagement}/5`);
      if (s.sessionNotes) parts.push(`Notes: ${s.sessionNotes}`);
      if (s.homeworkAssigned) parts.push(`Homework: ${s.homeworkAssigned}`);
      return parts.join('. ');
    }).filter(Boolean).join('\n');

    const scoreContext = params.currentScore && params.targetScore
      ? `Current SAT score: ${params.currentScore}. Target: ${params.targetScore}.`
      : '';

    const prompt = sessionDetails.trim()
      ? `You are a warm, professional academic advisor at StudyCore. Write a 2-3 sentence summary of this student's week for their parent. Be specific, encouraging, and mention any standout topics or progress. Do not use generic filler — reference the actual session content.

Student: ${params.studentName}
${scoreContext}
Hours remaining: ${params.remainingHours.toFixed(1)}
Sessions this week:
${sessionDetails}`
      : `You are a warm academic advisor. Write 2-3 encouraging sentences for a parent whose child (${params.studentName}) attended SAT tutoring this week. Be motivating and mention the value of consistency.`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    return block.type === 'text' ? block.text.trim() : '';
  } catch (err) {
    console.error('AI summary error:', err);
    return '';
  }
}

/** Days remaining until test date + % of programme elapsed since created_at. */
function getTestDateCountdown(student: any): {
  daysRemaining: number;
  pctThrough: number;
  testDate: string;
} | null {
  if (!student.test_date) return null;
  const today        = new Date();
  const testDate     = new Date(student.test_date);
  const programStart = new Date(student.created_at);
  const daysRemaining = Math.max(0, differenceInDays(testDate, today));
  const totalDays    = differenceInDays(testDate, programStart);
  const pctThrough   = totalDays > 0
    ? Math.min(100, Math.max(0, Math.round((differenceInDays(today, programStart) / totalDays) * 100)))
    : 0;
  return { daysRemaining, pctThrough, testDate: student.test_date as string };
}

/** Build a compact HTML snippet for storage in weekly_reports.report_html */
function buildReportHtml(p: {
  studentName: string;
  weekLabel: string;
  aiSummary: string;
  sessions: Array<{ scheduledAt: string; tutorName: string; durationMinutes: number; topicsCovered: string | null; engagement: number | null; homeworkAssigned: string | null }>;
  currentScore: number | null;
  targetScore: number | null;
  purchasedHours: number;
  usedHours: number;
}): string {
  const stars = (n: number | null) => n ? '⭐'.repeat(n) : '—';
  const sessionRows = p.sessions.map(s => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px">${new Date(s.scheduledAt).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px">${s.tutorName}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px">${s.durationMinutes}m</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px">${s.topicsCovered ?? '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px">${stars(s.engagement)}</td>
    </tr>`).join('');

  const remaining = p.purchasedHours - p.usedHours;
  const scoreSection = p.currentScore
    ? `<p><strong>Score:</strong> ${p.currentScore}${p.targetScore ? ` → ${p.targetScore} goal` : ''}</p>`
    : '';

  return `
<div style="font-family:sans-serif;max-width:600px">
  <h2 style="color:#1e2090">Week of ${p.weekLabel} — ${p.studentName}</h2>
  ${p.aiSummary ? `<p style="background:#f0f4ff;border-left:3px solid #1e2090;padding:12px 16px;border-radius:0 6px 6px 0">${p.aiSummary}</p>` : ''}
  <h3>Sessions</h3>
  <table width="100%" style="border-collapse:collapse">
    <thead><tr style="background:#f9fafb">
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280">Date</th>
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280">Tutor</th>
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280">Duration</th>
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280">Topics</th>
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280">Engagement</th>
    </tr></thead>
    <tbody>${sessionRows || '<tr><td colspan="5" style="padding:12px;color:#9ca3af">No sessions this week</td></tr>'}</tbody>
  </table>
  ${scoreSection}
  <p><strong>Hours remaining:</strong> ${remaining.toFixed(1)} of ${p.purchasedHours}</p>
</div>`.trim();
}

// ── main handler ────────────────────────────────────────────────────────────

export async function GET() {
  const now       = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(now,   { weekStartsOn: 1 });
  const pastWeekStart = subDays(now, 7);

  const { data: signedContracts } = await supabase
    .from('contracts')
    .select('student_id')
    .eq('status', 'signed');

  const activeIds = Array.from(
    new Set((signedContracts ?? []).map((c: any) => c.student_id as string)),
  );
  if (activeIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No active students' });
  }

  const { data: students } = await supabase
    .from('students')
    .select('*')
    .in('id', activeIds)
    .gt('purchased_hours', 0)
    .not('parent_email', 'is', null);

  const sent:   string[] = [];
  const failed: string[] = [];

  for (const student of students ?? []) {
    try {
      // ── Sessions this week ───────────────────────────────────────────────
      const { data: rawSessions } = await supabase
        .from('sessions')
        .select('*, tutor:tutors(name), session_logs(*)')
        .eq('student_id', student.id)
        .gte('scheduled_at', pastWeekStart.toISOString())
        .lte('scheduled_at', now.toISOString())
        .in('status', ['completed', 'scheduled'])
        .order('scheduled_at');

      const sessions = (rawSessions ?? []).map((s: any) => ({
        scheduledAt:      s.scheduled_at        as string,
        tutorName:        (s.tutor?.name ?? '—') as string,
        durationMinutes:  s.duration_minutes     as number,
        topicsCovered:    (s.topics_covered      ?? null) as string | null,
        engagement:       (s.student_engagement  ?? null) as number | null,
        sessionNotes:     (s.session_notes ?? s.tutor_notes ?? s.session_logs?.[0]?.went_well ?? null) as string | null,
        wentWell:         (s.tutor_notes ?? s.session_logs?.[0]?.went_well ?? null) as string | null,
        issues:           (s.session_logs?.[0]?.issues ?? null)  as string | null,
        homeworkAssigned: (s.homework_assigned   ?? null)         as string | null,
        notesSubmitted:   !!s.notes_submitted_at || !!s.report_submitted,
      }));

      // ── Latest progress from session logs ───────────────────────────────
      const logsWithScores = (rawSessions ?? [])
        .map((s: any) => s.session_logs?.[0])
        .filter((l: any) => l && (l.math_score || l.reading_score || l.writing_score))
        .sort((a: any, b: any) =>
          new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
        );

      const latest = logsWithScores[0] ?? null;
      const latestProgress = latest ? {
        mathScore:       latest.math_score    ?? null,
        readingScore:    latest.reading_score ?? null,
        writingScore:    latest.writing_score ?? null,
        totalScore:      ((latest.math_score ?? 0) + (latest.reading_score ?? 0) + (latest.writing_score ?? 0)) || null,
        confidenceLevel: latest.confidence_level ?? null,
      } : null;

      // ── Next upcoming session ────────────────────────────────────────────
      const { data: upcoming } = await supabase
        .from('sessions')
        .select('scheduled_at, tutor:tutors(name)')
        .eq('student_id', student.id)
        .eq('status', 'scheduled')
        .gt('scheduled_at', now.toISOString())
        .order('scheduled_at')
        .limit(1);

      const nextRaw    = (upcoming?.[0] as any) ?? null;
      const nextSession = nextRaw
        ? { scheduledAt: nextRaw.scheduled_at as string, tutorName: (nextRaw.tutor?.name ?? '—') as string }
        : null;

      const remainingHours = (student.purchased_hours ?? 0) - (student.used_hours ?? 0);

      // ── 6 enhancements (streak + trend + burn rate run in parallel) ──────
      const [streak, scoreTrend, burnRate] = await Promise.all([
        calculateStreak(student.id, weekStart),
        getScoreTrend(student.id, weekStart, weekEnd),
        getBurnRate(student.id, weekStart, remainingHours),
      ]);

      const homeworkItems = sessions
        .filter(s => s.homeworkAssigned)
        .map(s => ({
          sessionDate: s.scheduledAt,
          homework:    s.homeworkAssigned as string,
          submitted:   s.notesSubmitted,
        }));
      const currentScore   = student.current_score ?? null;
      const targetScore    = student.target_score  ?? null;
      const aiSummary  = await getAISummary({
        studentName: student.name,
        sessions: sessions.map(s => ({
          tutorName:       s.tutorName,
          durationMinutes: s.durationMinutes,
          topicsCovered:   s.topicsCovered,
          engagement:      s.engagement,
          sessionNotes:    s.sessionNotes,
          homeworkAssigned: s.homeworkAssigned,
        })),
        currentScore,
        targetScore,
        remainingHours,
      });
      const testDateCountdown = getTestDateCountdown(student);

      // ── Storable report snapshot ─────────────────────────────────────────
      const reportData = {
        streak,
        sessions,
        latestProgress,
        scoreTrend,
        purchasedHours:   student.purchased_hours ?? 0,
        usedHours:        student.used_hours       ?? 0,
        burnRate,
        homeworkItems,
        testDateCountdown,
        nextSession,
      };

      // ── Send email ───────────────────────────────────────────────────────
      const allEmails = await getStudentEmails(student.id, student.email);
      await sendWeeklyReport({
        studentName:      student.name,
        parentName:       student.parent_name,
        parentEmail:      student.parent_email,
        additionalEmails: allEmails.slice(1),
        weekStart:        weekStart.toISOString(),
        weekEnd:          weekEnd.toISOString(),
        sessions,
        latestProgress,
        purchasedHours:   student.purchased_hours ?? 0,
        usedHours:        student.used_hours       ?? 0,
        nextSession,
        streak,
        scoreTrend,
        burnRate,
        homeworkItems,
        aiSummary,
        testDateCountdown,
      });

      // ── Persist report ────────────────────────────────────────────────────
      const completedSessions = sessions.filter(s => s.notesSubmitted || s.topicsCovered);
      const hoursThisWeek = sessions.reduce((sum, s) => sum + s.durationMinutes / 60, 0);
      const reportHtml = buildReportHtml({
        studentName: student.name,
        weekLabel: weekStart.toISOString().slice(0, 10),
        aiSummary,
        sessions,
        currentScore: student.current_score,
        targetScore: student.target_score,
        purchasedHours: student.purchased_hours ?? 0,
        usedHours: student.used_hours ?? 0,
      });

      await supabase.from('weekly_reports').upsert(
        {
          student_id:      student.id,
          week_of:         weekStart.toISOString().slice(0, 10),
          report_html:     reportHtml,
          ai_summary:      aiSummary || null,
          sessions_count:  completedSessions.length,
          hours_this_week: Math.round(hoursThisWeek * 10) / 10,
        },
        { onConflict: 'student_id,week_of' },
      );

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
