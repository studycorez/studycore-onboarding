'use client';

import { useEffect, useState } from 'react';
import { useParentAuth, getOnboardingSteps } from '@/hooks/useParentAuth';
import ParentPortalLayout from '@/components/parent-portal/ParentPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { ExternalLink, Calendar, BookOpen, AlertCircle, Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

interface UpcomingSession {
  id: string;
  student_id: string;
  scheduled_at: string;
  duration_minutes: number;
  zoom_join_url: string | null;
  tutor: { name: string } | null;
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
  const [dataLoading, setDataLoading] = useState(true);

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
        .select('id, student_id, scheduled_at, duration_minutes, zoom_join_url, tutor:tutors(name)')
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
    ]).then(([sess, prog]) => {
      setSessions((sess.data as any[]) ?? []);
      setProgress((prog.data as any[]) ?? []);
      setDataLoading(false);
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
                  <Link
                    href={`/parent-portal/student/${student.id}`}
                    className="btn-secondary text-sm"
                  >
                    View full details →
                  </Link>
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
                      {upcomingSess.map(s => (
                        <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {format(new Date(s.scheduled_at), "EEEE, MMM d 'at' h:mm a")}
                            </p>
                            <p className="text-xs text-gray-500">
                              with {(s.tutor as any)?.name ?? '—'} · {s.duration_minutes} min
                            </p>
                          </div>
                          {s.zoom_join_url && (
                            <a
                              href={s.zoom_join_url}
                              target="_blank"
                              rel="noopener"
                              className="inline-flex items-center gap-1 text-xs text-navy-600 hover:text-navy-800 font-medium flex-shrink-0"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Join Zoom
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ParentPortalLayout>
  );
}
