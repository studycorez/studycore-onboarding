'use client';

import { useEffect, useState } from 'react';
import { useParentAuth, getOnboardingSteps } from '@/hooks/useParentAuth';
import ParentPortalLayout from '@/components/parent-portal/ParentPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { ExternalLink, Calendar, BookOpen, AlertCircle, Check, FileText, Video, CalendarClock, Users, BarChart2, X } from 'lucide-react';
import RescheduleModal from '@/components/portal/RescheduleModal';
import { TutorScoreBadge } from '@/components/TutorScoreBadge';
import { calculateAllTutorScores } from '@/lib/tutorScore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

interface WeeklyReport {
  id: string;
  student_id: string;
  studentName: string;
  week_of: string;
  report_html: string | null;
  ai_summary: string | null;
  sessions_count: number | null;
  hours_this_week: number | null;
}

interface UpcomingSession {
  id: string;
  student_id: string;
  scheduled_at: string;
  duration_minutes: number;
  zoom_join_url: string | null;
  tutor: { id: string; name: string; resume_url: string | null } | null;
}

interface ProgressEntry {
  student_id: string;
  total_score: number | null;
  math_score: number | null;
  reading_score: number | null;
  recorded_at: string;
}

export default function ParentDashboardPage() {
  const { parent, loading } = useParentAuth();
  const router = useRouter();
  const supabase = createClient();

  const [sessions, setSessions]   = useState<UpcomingSession[]>([]);
  const [progress, setProgress]   = useState<ProgressEntry[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [tutorScores,  setTutorScores]  = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => new Date());
  const [rescheduleSession, setRescheduleSession] = useState<UpcomingSession | null>(null);
  const [reportModal, setReportModal] = useState<WeeklyReport | null>(null);

  // Tick every 30s to keep Join Zoom window accurate
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Auto-redirect to onboarding if intake not completed for any student
  useEffect(() => {
    if (!parent?.students?.length) return;
    const needsIntake = parent.students.some(s => !s.intake_form_completed);
    if (needsIntake) router.push('/parent-portal/onboarding');
  }, [parent, router]);

  useEffect(() => {
    if (!parent?.students?.length) { setDataLoading(false); return; }
    const ids = parent.students.map(s => s.id);
    const now = new Date().toISOString();

    Promise.all([
      supabase
        .from('sessions')
        .select('id, student_id, scheduled_at, duration_minutes, zoom_join_url, tutor:tutors(id, name, resume_url)')
        .in('student_id', ids)
        .eq('status', 'scheduled')
        .gte('scheduled_at', now)
        .order('scheduled_at')
        .limit(20),
      supabase
        .from('student_progress')
        .select('student_id, total_score, math_score, reading_score, recorded_at')
        .in('student_id', ids)
        .order('recorded_at', { ascending: false })
        .limit(50),
      fetch('/api/parent-portal/weekly-reports').then(r => r.ok ? r.json() : { reports: [] }),
    ]).then(([sess, prog, weeklyData]) => {
      const sessData = (sess.data as any[]) ?? [];
      setSessions(sessData);
      setProgress((prog.data as any[]) ?? []);
      setWeeklyReports((weeklyData as any).reports ?? []);
      setDataLoading(false);
      // Load scores for unique tutors in background
      const tutorIds = Array.from(new Set(sessData.map((s: any) => s.tutor?.id).filter(Boolean))) as string[];
      if (tutorIds.length) {
        calculateAllTutorScores(tutorIds, supabase).then(results => {
          const composites: Record<string, number> = {};
          for (const [tid, r] of Object.entries(results)) composites[tid] = r.composite;
          setTutorScores(composites);
        });
      }
    });
  }, [parent]);

  if (loading || dataLoading) {
    return (
      <ParentPortalLayout parent={null}>
        <div className="animate-pulse space-y-4">
          {[1, 2].map(i => <div key={i} className="h-48 card rounded-xl" />)}
        </div>
      </ParentPortalLayout>
    );
  }

  const sessionsByStudent = (studentId: string) =>
    sessions.filter(s => s.student_id === studentId).slice(0, 5);

  const progressByStudent = (studentId: string) =>
    progress.filter(p => p.student_id === studentId).slice(0, 3);

  return (
    <ParentPortalLayout parent={parent}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
        <p className="text-gray-500 text-sm mt-1">
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </p>
      </div>

      {/* Onboarding banner */}
      {parent?.students?.map(student => {
        const steps = getOnboardingSteps(student);
        const incomplete = steps.filter(s => !s.complete).length;
        if (incomplete === 0) return (
          <div key={`ob-${student.id}`} className="flex items-center gap-3 px-5 py-3.5 bg-green-50 border border-green-200 rounded-xl mb-4">
            <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
              <Check className="w-3.5 h-3.5 text-white" />
            </div>
            <p className="text-sm font-medium text-green-800">
              {parent.students.length > 1 ? `${student.name} — ` : ''}Onboarding complete! You&apos;re all set.
            </p>
          </div>
        );
        return (
          <div key={`ob-${student.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 bg-amber-50 border border-amber-200 rounded-xl mb-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <p className="text-sm font-medium text-amber-800">
                {parent.students.length > 1 ? `${student.name} — ` : ''}
                {incomplete} onboarding {incomplete === 1 ? 'step' : 'steps'} remaining
              </p>
            </div>
            <Link
              href="/parent-portal/onboarding"
              className="text-xs font-semibold text-amber-700 hover:text-amber-900 whitespace-nowrap flex-shrink-0"
            >
              Complete setup →
            </Link>
          </div>
        );
      })}

      {parent?.students?.length === 0 ? (
        <div className="card p-12 text-center">
          <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No students found for your account. Contact your admin.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {parent?.students.map(student => {
            const upcomingSess = sessionsByStudent(student.id);
            const recentProg   = progressByStudent(student.id);
            const purchased    = student.purchased_hours ?? 0;
            const used         = student.used_hours ?? 0;
            const remaining    = purchased - used;
            const isLow        = purchased > 0 && remaining < 5;

            const current = recentProg[0]?.total_score ?? student.current_score;
            const target  = student.target_score;
            const allEntries = progress.filter(p => p.student_id === student.id);
            const first   = allEntries.length > 0
              ? allEntries[allEntries.length - 1].total_score  // reversed order (desc)
              : student.current_score;
            // allEntries is desc, so last element is oldest
            const oldest  = allEntries.length > 0
              ? allEntries[allEntries.length - 1].total_score
              : null;
            const pctToGoal = target != null && oldest != null && current != null && target !== oldest
              ? Math.min(100, Math.max(0, ((current - oldest) / (target - oldest)) * 100))
              : null;
            const diff = current != null && target != null ? target - current : null;
            const barColor = diff == null ? 'bg-gray-300'
              : diff <= 50  ? 'bg-green-500'
              : diff <= 150 ? 'bg-amber-400'
              : 'bg-red-500';

            return (
              <div key={student.id}>
                {/* Student header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{student.name}</h2>
                    {student.grade && (
                      <p className="text-sm text-gray-500">Grade {student.grade}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {(student as any).game_plan_url && (
                      <a
                        href={(student as any).game_plan_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-navy-50 border border-navy-200 text-navy-700 rounded-lg text-xs font-semibold hover:bg-navy-100 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Game Plan
                      </a>
                    )}
                    <Link
                      href={`/parent-portal/student/${student.id}`}
                      className="btn-secondary text-sm"
                    >
                      View full details →
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  {/* Score progress */}
                  <div className="card p-5">
                    <p className="text-xs font-medium text-gray-500 mb-3">Score Progress</p>
                    <div className="flex items-baseline gap-2 mb-3">
                      <span className="text-2xl font-bold text-gray-900">{current ?? '—'}</span>
                      {target && (
                        <span className="text-sm text-gray-400">→ <span className="text-navy-700 font-semibold">{target}</span> goal</span>
                      )}
                    </div>
                    {pctToGoal != null && (
                      <>
                        <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                          <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${pctToGoal}%` }} />
                        </div>
                        <p className="text-xs text-gray-500">{Math.round(pctToGoal)}% toward goal</p>
                      </>
                    )}
                    {diff != null && diff > 0 && (
                      <p className={`text-xs font-medium mt-1 ${diff <= 50 ? 'text-green-600' : diff <= 150 ? 'text-amber-600' : 'text-red-600'}`}>
                        {diff} points to go
                      </p>
                    )}
                    {diff != null && diff <= 0 && (
                      <p className="text-xs font-medium mt-1 text-green-600">Goal reached!</p>
                    )}
                  </div>

                  {/* Hours */}
                  <div className="card p-5">
                    <p className="text-xs font-medium text-gray-500 mb-3">Hours</p>
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div>
                        <p className="text-xs text-gray-400">Purchased</p>
                        <p className="font-bold text-gray-900">{purchased}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Used</p>
                        <p className="font-bold text-gray-900">{used.toFixed(1)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Left</p>
                        <p className={`font-bold ${isLow ? 'text-red-600' : 'text-green-600'}`}>{remaining.toFixed(1)}</p>
                      </div>
                    </div>
                    {purchased > 0 && (
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${(used / purchased) >= 0.8 ? 'bg-red-400' : (used / purchased) >= 0.6 ? 'bg-amber-400' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(100, (used / purchased) * 100)}%` }}
                        />
                      </div>
                    )}
                    {isLow && (
                      <p className="text-xs text-red-600 font-medium mt-2">Low hours — contact your admin</p>
                    )}
                  </div>

                  {/* Recent scores */}
                  <div className="card p-5">
                    <p className="text-xs font-medium text-gray-500 mb-3">Recent Scores</p>
                    {recentProg.length === 0 ? (
                      <p className="text-sm text-gray-400">No scores logged yet</p>
                    ) : (
                      <div className="space-y-2">
                        {recentProg.map((p, i) => (
                          <div key={i} className="text-xs">
                            <p className="text-gray-400 mb-0.5">{format(new Date(p.recorded_at), 'MMM d')}</p>
                            <div className="flex gap-3">
                              {p.total_score != null && <span className="font-bold text-gray-900">Total: {p.total_score}</span>}
                              {p.math_score != null && <span className="text-blue-600">M: {p.math_score}</span>}
                              {p.reading_score != null && <span className="text-green-600">R: {p.reading_score}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Upcoming sessions */}
                <div className="card overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <h3 className="text-sm font-semibold text-gray-900">Upcoming Sessions</h3>
                  </div>
                  {upcomingSess.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-gray-400">No upcoming sessions scheduled.</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {upcomingSess.map(s => {
                        const startMs = new Date(s.scheduled_at).getTime();
                        const endMs   = startMs + s.duration_minutes * 60_000;
                        const sessionOngoing = now.getTime() >= startMs && now.getTime() < endMs;
                        const sessionCanJoin = (startMs - now.getTime()) <= 30 * 60_000 || sessionOngoing;
                        const browserTz = typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/New_York';
                        const sessionTimeStr = new Date(s.scheduled_at).toLocaleString('en-US', { timeZone: browserTz, weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
                        const sessionIsToday = new Date(s.scheduled_at).toLocaleDateString('en-CA', { timeZone: browserTz }) === new Date().toLocaleDateString('en-CA', { timeZone: browserTz });
                        const sessionDiff = startMs - now.getTime();
                        const cdText = sessionDiff > 0 && sessionDiff <= 24 * 60 * 60_000
                          ? (sessionDiff >= 3_600_000 ? `in ${Math.floor(sessionDiff / 3_600_000)}h ${Math.floor((sessionDiff % 3_600_000) / 60_000)}m` : `in ${Math.floor(sessionDiff / 60_000)} min`)
                          : null;
                        return (
                        <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-gray-900">
                              {sessionTimeStr}
                            </p>
                            {sessionIsToday && <span className="text-xs font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-md">Today</span>}
                            {cdText && <span className="text-xs font-semibold text-amber-600">{cdText}</span>}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap mt-0.5">
                              <p className="text-xs text-gray-500">
                                with {(s.tutor as any)?.name ?? '—'} · {s.duration_minutes} min
                              </p>
                              {s.tutor?.id && tutorScores[s.tutor.id] != null && (
                                <TutorScoreBadge score={tutorScores[s.tutor.id]} />
                              )}
                              {s.tutor?.resume_url && (
                                <a
                                  href={s.tutor.resume_url}
                                  target="_blank"
                                  rel="noopener"
                                  className="text-xs text-navy-600 hover:text-navy-800 font-medium flex items-center gap-0.5"
                                >
                                  📄 View Resume
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Reschedule — only if >24h away */}
                          {new Date(s.scheduled_at).getTime() - now.getTime() > 24 * 60 * 60 * 1000 && (
                            <button
                              onClick={() => setRescheduleSession(s)}
                              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 rounded-lg px-2.5 py-1.5 transition-colors"
                            >
                              <CalendarClock className="w-3 h-3" />
                              Reschedule
                            </button>
                          )}
                          {s.zoom_join_url && (
                              <a
                                href={s.zoom_join_url}
                                target="_blank"
                                rel="noopener"
                                className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                                  sessionCanJoin
                                    ? `text-white bg-green-600 hover:bg-green-700 ${sessionOngoing ? 'animate-pulse' : ''}`
                                    : 'text-navy-700 bg-navy-50 border border-navy-200 hover:bg-navy-100'
                                }`}
                              >
                                <Video className="w-3 h-3" />
                                {sessionOngoing ? 'Join Now' : 'Join Session'}
                              </a>
                          )}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Group Sessions Card — shown once per parent if any student is eligible */}
      {parent?.students?.some(s => s.group_sessions_enabled) && (() => {
        const monJoin = 'https://us06web.zoom.us/j/88498800127?pwd=TvUwlKqQBzKZJavDDEEPqJSiFEZb80.1';
        const satJoin = 'https://us06web.zoom.us/j/81335609717?pwd=aApUwMaEkLZSEmbquA6vDt2uvTWabM.1';
        const eligibleStudents = parent.students.filter(s => s.group_sessions_enabled);
        return (
          <div className="mt-6 card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-navy-500" />
              <h2 className="text-sm font-semibold text-gray-900">Group Sessions</h2>
            </div>
            {eligibleStudents.map(student => {
              const remaining = Math.max(0, (student.group_session_hours_allocated ?? 0) - (student.group_session_hours_used ?? 0));
              return (
                <div key={student.id} className="mb-3 pb-3 border-b border-gray-100 last:border-0 last:mb-0 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-700">{student.name}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${remaining > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {remaining} hr{remaining !== 1 ? 's' : ''} left
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="space-y-2 mt-2">
              {[
                { label: 'Monday Group Session', time: '7:00–8:00 PM ET', url: monJoin },
                { label: 'Saturday Group Session', time: '4:30–5:30 PM ET', url: satJoin },
              ].map(({ label, time, url }) => (
                <div key={label} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{label}</p>
                    <p className="text-xs text-gray-500">{time} · Every week</p>
                  </div>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-white bg-green-600 hover:bg-green-700 transition-colors whitespace-nowrap"
                  >
                    <Video className="w-3.5 h-3.5" /> Join Zoom
                  </a>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Weekly Reports */}
      {weeklyReports.length > 0 && (
        <div className="mt-6 card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Weekly Reports</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {weeklyReports.slice(0, 8).map(r => (
              <div key={r.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Week of {format(new Date(r.week_of), 'MMM d, yyyy')}
                    {parent?.students && parent.students.length > 1 && (
                      <span className="ml-2 text-xs text-gray-400">· {r.studentName}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {r.sessions_count ?? 0} session{r.sessions_count !== 1 ? 's' : ''}
                    {r.hours_this_week != null && ` · ${r.hours_this_week}h`}
                  </p>
                </div>
                {r.report_html && (
                  <button
                    onClick={() => setReportModal(r)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-700 bg-navy-50 border border-navy-200 hover:bg-navy-100 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                  >
                    <FileText className="w-3 h-3" />
                    View
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly Report Modal */}
      {reportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Weekly Report</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {reportModal.studentName && `${reportModal.studentName} · `}
                  Week of {format(new Date(reportModal.week_of), 'MMM d, yyyy')}
                </p>
              </div>
              <button onClick={() => setReportModal(null)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div
              className="px-6 py-5 prose prose-sm max-w-none text-gray-800"
              dangerouslySetInnerHTML={{ __html: reportModal.report_html ?? '' }}
            />
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button onClick={() => setReportModal(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {rescheduleSession && (
        <RescheduleModal
          open={!!rescheduleSession}
          onClose={() => setRescheduleSession(null)}
          sessionId={rescheduleSession.id}
          sessionTime={rescheduleSession.scheduled_at}
          tutorName={(rescheduleSession.tutor as any)?.name ?? '—'}
          studentName={parent?.students.find(s => s.id === rescheduleSession.student_id)?.name ?? ''}
          durationMinutes={rescheduleSession.duration_minutes}
          apiBase="parent-portal"
        />
      )}
    </ParentPortalLayout>
  );
}
