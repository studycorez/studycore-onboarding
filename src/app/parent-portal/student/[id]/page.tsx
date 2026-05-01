'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useParentAuth } from '@/hooks/useParentAuth';
import ParentPortalLayout from '@/components/parent-portal/ParentPortalLayout';
import { StatusBadge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';
import { ExternalLink, ArrowLeft, FileText, ChevronDown, ChevronUp, Play } from 'lucide-react';
import { TutorScoreBadge } from '@/components/TutorScoreBadge';
import { calculateTutorScore } from '@/lib/tutorScore';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface WeeklyReportData {
  streak: number;
  sessions: { scheduledAt: string; tutorName: string; durationMinutes: number; homeworkAssigned?: string | null; notesSubmitted?: boolean }[];
  latestProgress: { mathScore: number | null; readingScore: number | null; writingScore: number | null; totalScore: number | null } | null;
  scoreTrend: { prevScore: number; currScore: number; delta: number } | null;
  purchasedHours: number;
  usedHours: number;
  burnRate: { avgHoursPerWeek: number; weeksRemaining: number | null } | null;
  homeworkItems: { sessionDate: string; homework: string; submitted: boolean }[];
  testDateCountdown: { daysRemaining: number; pctThrough: number; testDate: string } | null;
  nextSession: { scheduledAt: string; tutorName: string } | null;
}

interface WeeklyReport {
  id: string;
  week_start: string;
  week_end: string;
  report_data: WeeklyReportData;
  ai_summary: string | null;
  sent_at: string | null;
  created_at: string;
}

interface Session {
  id: string;
  tutor_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  zoom_join_url: string | null;
  session_notes: string | null;
  tutor_feedback: string | null;
  tutor_notes: string | null;
  homework_assigned: string | null;
  session_rating: number | null;
  fathom_recording_url: string | null;
  fathom_summary: string | null;
  tutor: { id: string; name: string; subjects: string[] | null; bio: string | null; created_at: string; resume_url: string | null } | null;
}

interface Progress {
  id: string;
  recorded_at: string;
  total_score: number | null;
  math_score: number | null;
  reading_score: number | null;
  writing_score: number | null;
}

export default function ParentStudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { parent, loading: authLoading } = useParentAuth();
  const supabase = createClient();

  const [sessions,       setSessions]       = useState<Session[]>([]);
  const [progress,       setProgress]       = useState<Progress[]>([]);
  const [weeklyReports,  setWeeklyReports]  = useState<WeeklyReport[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [authorized,     setAuthorized]     = useState(true);
  const [activeTab,        setActiveTab]        = useState<'overview' | 'reports'>('overview');
  const [expandedReport,   setExpandedReport]   = useState<string | null>(null);
  const [expandedSummary,  setExpandedSummary]  = useState<string | null>(null);
  const [primaryTutorScore, setPrimaryTutorScore] = useState<number | null>(null);

  useEffect(() => {
    if (authLoading || !parent) return;

    // Verify this student belongs to the parent
    const student = parent.students.find(s => s.id === id);
    if (!student) { setAuthorized(false); setLoading(false); return; }

    Promise.all([
      supabase
        .from('sessions')
        .select('id, tutor_id, scheduled_at, duration_minutes, status, zoom_join_url, session_notes, tutor_feedback, tutor_notes, homework_assigned, session_rating, fathom_recording_url, fathom_summary, tutor:tutors(id, name, subjects, bio, created_at, resume_url)')
        .eq('student_id', id)
        .order('scheduled_at', { ascending: false })
        .limit(20),
      supabase
        .from('student_progress')
        .select('id, recorded_at, total_score, math_score, reading_score, writing_score')
        .eq('student_id', id)
        .order('recorded_at'),
      supabase
        .from('weekly_reports')
        .select('id, week_start, week_end, report_data, ai_summary, sent_at, created_at')
        .eq('student_id', id)
        .order('week_start', { ascending: false })
        .limit(52),
    ]).then(([sess, prog, rpts]) => {
      const sessData = (sess.data as any[]) ?? [];
      setSessions(sessData);
      setProgress((prog.data as any[]) ?? []);
      setWeeklyReports((rpts.data as any[]) ?? []);
      setLoading(false);
      // Compute score for primary tutor (most sessions)
      const counts: Record<string, number> = {};
      sessData.forEach((s: any) => { if (s.tutor_id) counts[s.tutor_id] = (counts[s.tutor_id] ?? 0) + 1; });
      const topTutorId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (topTutorId) {
        calculateTutorScore(topTutorId, supabase).then(r => setPrimaryTutorScore(r.composite));
      }
    });
  }, [parent, authLoading, id]);

  const student = parent?.students.find(s => s.id === id);

  if (authLoading || loading) {
    return (
      <ParentPortalLayout parent={parent}>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-40 card rounded-xl" />)}
        </div>
      </ParentPortalLayout>
    );
  }

  if (!authorized || !student) {
    return (
      <ParentPortalLayout parent={parent}>
        <p className="text-gray-500">Student not found or access denied.</p>
      </ParentPortalLayout>
    );
  }

  // Score stats
  const progressWithTotal = progress.filter(p => p.total_score != null);
  const startingScore = progressWithTotal[0]?.total_score ?? student.current_score;
  const currentScore  = progressWithTotal.length > 0
    ? progressWithTotal[progressWithTotal.length - 1].total_score!
    : student.current_score;
  const targetScore   = student.target_score;
  const pointsToGoal  = currentScore != null && targetScore != null ? targetScore - currentScore : null;
  const goalRange     = startingScore != null && targetScore != null && targetScore !== startingScore
    ? targetScore - startingScore : null;
  const pctToGoal     = goalRange != null && currentScore != null && startingScore != null
    ? Math.min(100, Math.max(0, ((currentScore - startingScore) / goalRange) * 100))
    : null;
  const barColor      = pointsToGoal == null ? 'bg-gray-300'
    : pointsToGoal <= 50  ? 'bg-green-500'
    : pointsToGoal <= 150 ? 'bg-amber-400'
    : 'bg-red-500';

  // Score projection — linear regression on total scores
  let projectedScore: number | null = null;
  let projectionChartData: { date: string; Projected?: number }[] = [];

  if (progressWithTotal.length >= 2 && student.test_date) {
    const xs = progressWithTotal.map((p, i) => i);
    const ys = progressWithTotal.map(p => p.total_score!);
    const n = xs.length;
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const sumXX = xs.reduce((a, x) => a + x * x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // How many "steps" (avg interval) between last data point and test date
    const lastDate = new Date(progressWithTotal[progressWithTotal.length - 1].recorded_at);
    const testDate = new Date(student.test_date);
    const avgIntervalMs = (lastDate.getTime() - new Date(progressWithTotal[0].recorded_at).getTime()) / Math.max(1, progressWithTotal.length - 1);
    const stepsToTest = avgIntervalMs > 0 ? (testDate.getTime() - lastDate.getTime()) / avgIntervalMs : 0;
    const projectedX = n - 1 + stepsToTest;
    projectedScore = Math.min(1600, Math.max(400, Math.round(slope * projectedX + intercept)));

    // Build projection overlay points: last real point → test date
    const midpointDate = new Date((lastDate.getTime() + testDate.getTime()) / 2);
    const midpointX = n - 1 + stepsToTest / 2;
    projectionChartData = [
      { date: format(lastDate, 'MMM d'), Projected: ys[ys.length - 1] },
      { date: format(midpointDate, 'MMM d'), Projected: Math.min(1600, Math.max(400, Math.round(slope * midpointX + intercept))) },
      { date: format(testDate, 'MMM d') + ' (Test)', Projected: projectedScore },
    ];
  }

  const chartData = [
    ...progress.map(p => ({
      date:    format(new Date(p.recorded_at), 'MMM d'),
      Total:   p.total_score,
      Math:    p.math_score,
      Reading: p.reading_score,
      Writing: p.writing_score,
    })),
    ...projectionChartData.slice(1), // append projected points after the last real one
  ];

  const now = new Date();
  const upcoming = sessions.filter(s => s.status === 'scheduled' && new Date(s.scheduled_at) >= now);
  const past     = sessions.filter(s => new Date(s.scheduled_at) < now || s.status !== 'scheduled');

  const purchased  = student.purchased_hours ?? 0;
  const used       = student.used_hours ?? 0;
  const remaining  = purchased - used;
  const isLow      = purchased > 0 && remaining < 5;

  // Primary tutor — most sessions
  const tutorSessionCounts: Record<string, number> = {};
  sessions.forEach(s => { if (s.tutor_id) tutorSessionCounts[s.tutor_id] = (tutorSessionCounts[s.tutor_id] ?? 0) + 1; });
  const primaryTutorId = Object.entries(tutorSessionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const primaryTutorSessions = primaryTutorId ? sessions.filter(s => s.tutor_id === primaryTutorId) : [];
  const primaryTutorInfo = primaryTutorId ? sessions.find(s => s.tutor_id === primaryTutorId)?.tutor ?? null : null;
  const ratingsForTutor = primaryTutorSessions.map(s => s.session_rating).filter((r): r is number => r != null);
  const avgRating = ratingsForTutor.length > 0 ? ratingsForTutor.reduce((a, b) => a + b, 0) / ratingsForTutor.length : null;
  const tutorTenureMonths = primaryTutorInfo?.created_at
    ? Math.round((Date.now() - new Date(primaryTutorInfo.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30))
    : null;
  const tutorInitials = primaryTutorInfo?.name
    ? primaryTutorInfo.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <ParentPortalLayout parent={parent}>
      <div className="mb-6">
        <Link href="/parent-portal/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>
        {student.grade && <p className="text-gray-500 text-sm">Grade {student.grade}</p>}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['overview', 'reports'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-navy-600 text-navy-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'reports' ? `Reports${weeklyReports.length ? ` (${weeklyReports.length})` : ''}` : 'Overview'}
          </button>
        ))}
      </div>

      {/* ── REPORTS TAB ── */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          {weeklyReports.length === 0 ? (
            <div className="card p-8 text-center text-gray-400 text-sm">
              No weekly reports yet. Reports are generated automatically each week.
            </div>
          ) : weeklyReports.map(rpt => {
            const rd = rpt.report_data;
            const isExpanded = expandedReport === rpt.id;
            const weekLabel = `${format(new Date(rpt.week_start), 'MMM d')} – ${format(new Date(rpt.week_end), 'MMM d, yyyy')}`;
            const trend = rd.scoreTrend;
            const remaining = rd.purchasedHours - rd.usedHours;
            const pct = rd.purchasedHours > 0 ? Math.min(100, Math.round((rd.usedHours / rd.purchasedHours) * 100)) : 0;

            return (
              <div key={rpt.id} className="card overflow-hidden">
                {/* Card header — always visible */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm">{weekLabel}</p>
                        {(rd.streak ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                            🔥 {rd.streak}-week streak
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {rd.sessions.length} session{rd.sessions.length !== 1 ? 's' : ''} this week
                      </p>
                      {trend && (
                        <p className="text-sm mt-1.5 font-medium">
                          <span className="text-gray-500">{trend.prevScore} → </span>
                          <span className="text-gray-900">{trend.currScore}</span>
                          <span className={trend.delta >= 0 ? 'text-green-600 ml-1' : 'text-red-500 ml-1'}>
                            {trend.delta >= 0 ? '↑' : '↓'} {trend.delta >= 0 ? '+' : ''}{trend.delta} pts
                          </span>
                        </p>
                      )}
                      {rpt.ai_summary && !isExpanded && (
                        <p className="text-xs text-gray-500 mt-2 line-clamp-2">{rpt.ai_summary}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setExpandedReport(isExpanded ? null : rpt.id)}
                      className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5"
                    >
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded full report */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 pb-5 space-y-5">

                    {/* AI Summary */}
                    {rpt.ai_summary && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4">
                        <p className="text-sm text-amber-900 leading-relaxed">{rpt.ai_summary}</p>
                      </div>
                    )}

                    {/* Sessions */}
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sessions</h3>
                      {rd.sessions.length === 0 ? (
                        <p className="text-sm text-gray-400">No sessions this week.</p>
                      ) : (
                        <div className="space-y-2">
                          {rd.sessions.map((s, i) => (
                            <div key={i} className="flex items-start justify-between gap-3 text-sm">
                              <div>
                                <span className="font-medium text-gray-800">{format(new Date(s.scheduledAt), 'EEE, MMM d')}</span>
                                <span className="text-gray-400 ml-2">with {s.tutorName} · {s.durationMinutes} min</span>
                                {s.homeworkAssigned && (
                                  <p className="text-xs text-gray-500 mt-0.5">HW: {s.homeworkAssigned}</p>
                                )}
                              </div>
                              {s.homeworkAssigned && (
                                <span className={`text-xs font-medium flex-shrink-0 ${s.notesSubmitted ? 'text-green-600' : 'text-gray-400'}`}>
                                  {s.notesSubmitted ? '✓ submitted' : 'pending'}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Score trend */}
                    {student.parent_can_see_scores && trend && (
                      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Practice Score</h3>
                        <p className="text-base font-semibold text-gray-800">
                          {trend.prevScore}
                          <span className="text-gray-400 mx-1.5">→</span>
                          {trend.currScore}
                          <span className={`ml-2 ${trend.delta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {trend.delta >= 0 ? '↑ +' : '↓ '}{trend.delta} pts
                          </span>
                        </p>
                      </div>
                    )}

                    {/* Progress scores */}
                    {rd.latestProgress && (rd.latestProgress.mathScore || rd.latestProgress.readingScore || rd.latestProgress.writingScore) && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Section Scores</h3>
                        <div className="grid grid-cols-3 gap-2">
                          {rd.latestProgress.mathScore && (
                            <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                              <p className="text-xs text-gray-500">Math</p>
                              <p className="font-bold text-gray-900">{rd.latestProgress.mathScore}</p>
                            </div>
                          )}
                          {rd.latestProgress.readingScore && (
                            <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                              <p className="text-xs text-gray-500">Reading</p>
                              <p className="font-bold text-gray-900">{rd.latestProgress.readingScore}</p>
                            </div>
                          )}
                          {rd.latestProgress.writingScore && (
                            <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                              <p className="text-xs text-gray-500">Writing</p>
                              <p className="font-bold text-gray-900">{rd.latestProgress.writingScore}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Homework */}
                    {student.parent_can_see_homework && rd.homeworkItems?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Homework</h3>
                        <div className="space-y-1.5">
                          {rd.homeworkItems.map((h, i) => (
                            <div key={i} className="flex items-center justify-between gap-3 text-sm">
                              <span className="text-gray-700">{format(new Date(h.sessionDate), 'MMM d')}: {h.homework}</span>
                              <span className={`text-xs font-medium flex-shrink-0 ${h.submitted ? 'text-green-600' : 'text-gray-400'}`}>
                                {h.submitted ? '✓ submitted' : 'pending'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Hours burn rate */}
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Hours</h3>
                      <div className="flex items-center gap-4 text-sm mb-2">
                        <span className="text-gray-600">{rd.usedHours.toFixed(1)} of {rd.purchasedHours} hrs used</span>
                        <span className={remaining < 5 ? 'text-red-600 font-semibold' : 'text-green-600 font-medium'}>
                          {remaining.toFixed(1)} remaining
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                        <div
                          className={`h-2 rounded-full ${pct >= 80 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-400' : 'bg-green-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {rd.burnRate && (
                        <p className="text-xs text-gray-500 mt-1">
                          Avg {rd.burnRate.avgHoursPerWeek} hrs/week
                          {rd.burnRate.weeksRemaining != null && ` · ~${rd.burnRate.weeksRemaining} week${rd.burnRate.weeksRemaining !== 1 ? 's' : ''} remaining at this pace`}
                        </p>
                      )}
                    </div>

                    {/* Test date countdown */}
                    {rd.testDateCountdown && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Test Date Countdown</h3>
                        <p className="text-sm font-semibold text-gray-800 mb-1.5">
                          {rd.testDateCountdown.daysRemaining} days until {format(new Date(rd.testDateCountdown.testDate), 'MMMM d, yyyy')}
                        </p>
                        <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                          <div
                            className={`h-2 rounded-full ${rd.testDateCountdown.pctThrough >= 80 ? 'bg-red-500' : rd.testDateCountdown.pctThrough >= 50 ? 'bg-amber-400' : 'bg-navy-600'}`}
                            style={{ width: `${rd.testDateCountdown.pctThrough}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-400">{rd.testDateCountdown.pctThrough}% through the programme</p>
                      </div>
                    )}

                    {/* Next session */}
                    {rd.nextSession && (
                      <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600">
                        Next: <strong>{format(new Date(rd.nextSession.scheduledAt), "EEE, MMM d 'at' h:mm a")}</strong> with {rd.nextSession.tutorName}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && <>

      {/* Game Plan button */}
      {student.game_plan_url && (
        <a
          href={student.game_plan_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mb-5 px-4 py-2.5 bg-navy-50 border border-navy-200 text-navy-700 rounded-lg text-sm font-semibold hover:bg-navy-100 transition-colors"
        >
          <FileText className="w-4 h-4" />
          View Game Plan
          <ExternalLink className="w-3.5 h-3.5 opacity-60" />
        </a>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <p className="text-xs font-medium text-gray-500 mb-1">Current Score</p>
          {student.parent_can_see_scores
            ? <><p className="text-3xl font-bold text-gray-900">{currentScore ?? '—'}</p>{targetScore && <p className="text-xs text-navy-600 mt-1">Goal: {targetScore}</p>}</>
            : <p className="text-sm text-gray-400 italic mt-1">Private</p>
          }
        </div>
        <div className={`card p-5 ${isLow ? 'border-red-200 bg-red-50' : ''}`}>
          <p className="text-xs font-medium text-gray-500 mb-1">Hours Remaining</p>
          <p className={`text-3xl font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>{remaining.toFixed(1)}</p>
          <p className="text-xs text-gray-400 mt-1">{used.toFixed(1)} used of {purchased}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium text-gray-500 mb-1">Upcoming Sessions</p>
          <p className="text-3xl font-bold text-gray-900">{upcoming.length}</p>
          {upcoming[0] && (
            <p className="text-xs text-gray-500 mt-1">
              Next: {format(new Date(upcoming[0].scheduled_at), 'MMM d')}
            </p>
          )}
        </div>
      </div>

      {/* Tutor profile card */}
      {primaryTutorInfo && (
        <div className="card p-5 mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Your Tutor</p>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-navy-100 flex items-center justify-center text-navy-700 font-bold text-lg flex-shrink-0">
              {tutorInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-gray-900 text-lg leading-tight">{primaryTutorInfo.name}</p>
                {primaryTutorScore != null && <TutorScoreBadge score={primaryTutorScore} />}
              </div>
              {primaryTutorInfo.subjects && primaryTutorInfo.subjects.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {primaryTutorInfo.subjects.map((s: string) => (
                    <span key={s} className="text-xs bg-navy-50 text-navy-700 rounded-full px-2.5 py-0.5 font-medium">{s}</span>
                  ))}
                </div>
              )}
              {primaryTutorInfo.bio && (
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">{primaryTutorInfo.bio}</p>
              )}
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-600">
                {(primaryTutorInfo as any)?.resume_url && (
                  <a
                    href={(primaryTutorInfo as any).resume_url}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-navy-700 bg-navy-50 border border-navy-200 rounded-lg px-2.5 py-1 hover:bg-navy-100 transition-colors"
                  >
                    📄 View Resume
                  </a>
                )}
                <span>
                  <span className="font-semibold text-gray-900">{primaryTutorSessions.length}</span> sessions together
                </span>
                {avgRating != null && (
                  <span>
                    <span className="text-amber-500">{'★'.repeat(Math.round(avgRating))}{'☆'.repeat(5 - Math.round(avgRating))}</span>
                    <span className="ml-1 font-semibold text-gray-900">{avgRating.toFixed(1)}</span> avg rating
                  </span>
                )}
                {tutorTenureMonths != null && tutorTenureMonths > 0 && (
                  <span>
                    <span className="font-semibold text-gray-900">{tutorTenureMonths > 12 ? `${Math.floor(tutorTenureMonths / 12)}y` : `${tutorTenureMonths}mo`}</span> with StudyCore
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Score progress chart */}
      {!student.parent_can_see_scores && (
        <div className="card p-5 mb-6 text-center text-sm text-gray-400 italic">
          Your student has chosen to keep their scores private.
        </div>
      )}
      {student.parent_can_see_scores && chartData.length > 0 && (
        <div className="card p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Score Progress</h2>

          {(currentScore != null || targetScore != null) && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-0.5">Current</p>
                <p className="text-xl font-bold text-gray-900">{currentScore ?? '—'}</p>
              </div>
              <div className="bg-navy-50 rounded-xl p-3 text-center">
                <p className="text-xs text-navy-600 mb-0.5">Goal</p>
                <p className="text-xl font-bold text-navy-900">{targetScore ?? '—'}</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${
                pointsToGoal == null ? 'bg-gray-50' :
                pointsToGoal <= 50  ? 'bg-green-50' :
                pointsToGoal <= 150 ? 'bg-amber-50' : 'bg-red-50'
              }`}>
                <p className={`text-xs mb-0.5 ${
                  pointsToGoal == null ? 'text-gray-500' :
                  pointsToGoal <= 50  ? 'text-green-600' :
                  pointsToGoal <= 150 ? 'text-amber-600' : 'text-red-600'
                }`}>Points to Goal</p>
                <p className={`text-xl font-bold ${
                  pointsToGoal == null ? 'text-gray-400' :
                  pointsToGoal <= 50  ? 'text-green-700' :
                  pointsToGoal <= 150 ? 'text-amber-700' : 'text-red-700'
                }`}>
                  {pointsToGoal != null ? (pointsToGoal <= 0 ? '✓ Reached!' : `−${pointsToGoal}`) : '—'}
                </p>
              </div>
            </div>
          )}

          {pctToGoal != null && (
            <div className="mb-5">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                <span>Progress toward goal</span>
                <span className="font-semibold text-gray-700">{Math.round(pctToGoal)}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div className={`h-2.5 rounded-full transition-all ${barColor}`} style={{ width: `${pctToGoal}%` }} />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{startingScore}</span>
                <span>{targetScore}</span>
              </div>
            </div>
          )}

          {projectedScore != null && (
            <div className="mb-4 flex items-center gap-3 bg-navy-50 border border-navy-100 rounded-xl px-4 py-3">
              <div className="flex-1">
                <p className="text-xs font-semibold text-navy-600 uppercase tracking-wide">Projected Score at Test Date</p>
                <p className="text-2xl font-bold text-navy-900 mt-0.5">{projectedScore}</p>
              </div>
              {targetScore != null && (
                <div className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${projectedScore >= targetScore ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {projectedScore >= targetScore ? '✓ On track' : `${targetScore - projectedScore} pts short`}
                </div>
              )}
            </div>
          )}

          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis domain={[400, 1600]} tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <Tooltip />
              <Legend />
              {targetScore != null && (
                <ReferenceLine
                  y={targetScore}
                  stroke="#6b7280"
                  strokeDasharray="6 3"
                  label={{ value: `Goal ${targetScore}`, position: 'right', fontSize: 11, fill: '#6b7280' }}
                />
              )}
              <Line type="monotone" dataKey="Total" stroke="#1e2090" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="Math" stroke="#6b84ff" strokeWidth={1.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Reading" stroke="#10b981" strokeWidth={1.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Writing" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 3 }} />
              {projectedScore != null && (
                <Line
                  type="monotone"
                  dataKey="Projected"
                  stroke="#1e2090"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={{ r: 4, fill: '#fff', stroke: '#1e2090', strokeWidth: 2 }}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Upcoming sessions */}
      {upcoming.length > 0 && (
        <div className="card overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Upcoming Sessions</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {upcoming.map(s => (
              <div key={s.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-sm text-gray-900">
                    {format(new Date(s.scheduled_at), "EEEE, MMMM d 'at' h:mm a")}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    with {(s.tutor as any)?.name ?? '—'} · {s.duration_minutes} min
                  </p>
                </div>
                {s.zoom_join_url && (
                  <a
                    href={s.zoom_join_url}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1.5 text-sm text-navy-600 hover:text-navy-800 font-medium flex-shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Join Zoom
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session history with tutor notes */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Session History</h2>
        </div>
        {past.length === 0 ? (
          <p className="px-6 py-6 text-sm text-gray-400">No past sessions yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {past.map(s => (
              <div key={s.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4 mb-1">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {format(new Date(s.scheduled_at), "EEEE, MMM d, yyyy 'at' h:mm a")}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      with {(s.tutor as any)?.name ?? '—'} · {s.duration_minutes} min
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                {s.tutor_notes && (
                  <div className="mt-2 px-3 py-2 bg-indigo-50 rounded-lg text-xs text-indigo-800">
                    {s.session_rating && (
                      <span className="inline-block mb-1 text-amber-500">
                        {'★'.repeat(s.session_rating)}{'☆'.repeat(5 - s.session_rating)}
                      </span>
                    )}
                    <p><span className="font-semibold">Session notes: </span>{s.tutor_notes}</p>
                    {s.homework_assigned && student.parent_can_see_homework && (
                      <p className="mt-1"><span className="font-semibold">Homework: </span>{s.homework_assigned}</p>
                    )}
                  </div>
                )}
                {!s.tutor_notes && s.session_notes && (
                  <div className="mt-2 px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-600">
                    <span className="font-medium text-gray-700">Session notes: </span>
                    {s.session_notes}
                  </div>
                )}
                {s.tutor_feedback && (
                  <div className="mt-2 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-700">
                    <span className="font-medium">Tutor feedback: </span>
                    {s.tutor_feedback}
                  </div>
                )}
                {s.fathom_recording_url && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <a
                      href={s.fathom_recording_url}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-navy-600 hover:text-navy-800 bg-navy-50 border border-navy-100 rounded-lg px-3 py-1.5"
                    >
                      <Play className="w-3 h-3" /> Watch Recording
                    </a>
                    {s.fathom_summary && (
                      <button
                        type="button"
                        onClick={() => setExpandedSummary(expandedSummary === s.id ? null : s.id)}
                        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                      >
                        {expandedSummary === s.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        AI Summary
                      </button>
                    )}
                  </div>
                )}
                {expandedSummary === s.id && s.fathom_summary && (
                  <div className="mt-2 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-900 leading-relaxed">
                    {s.fathom_summary}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      </> /* end overview tab */}
    </ParentPortalLayout>
  );
}
