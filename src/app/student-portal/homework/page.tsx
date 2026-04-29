'use client';

import { useEffect, useState, useCallback } from 'react';
import { useStudentAuth } from '@/hooks/useStudentAuth';
import StudentPortalLayout from '@/components/student-portal/StudentPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';
import { CheckCircle, Circle, BookOpen, Zap, Play, ChevronDown, ChevronUp } from 'lucide-react';

interface HomeworkSession {
  id: string;
  scheduled_at: string;
  homework_assigned: string;
  homework_completed: boolean;
  homework_completed_at: string | null;
  fathom_recording_url: string | null;
  fathom_summary: string | null;
  tutor: { name: string } | null;
}

function Confetti() {
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {Array.from({ length: 30 }, (_, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 rounded-sm animate-bounce"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 60}%`,
            backgroundColor: ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa'][i % 5],
            animationDuration: `${0.5 + Math.random()}s`,
            animationDelay: `${Math.random() * 0.3}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function HomeworkPage() {
  const { student, loading } = useStudentAuth();
  const supabase = createClient();
  const [sessions, setSessions] = useState<HomeworkSession[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [xpToast, setXpToast] = useState(false);
  const [expandedSummary, setExpandedSummary] = useState<string | null>(null);

  const load = useCallback(async (studentId: string) => {
    const { data } = await supabase
      .from('sessions')
      .select('id, scheduled_at, homework_assigned, homework_completed, homework_completed_at, fathom_recording_url, fathom_summary, tutor:tutors(name)')
      .eq('student_id', studentId)
      .not('homework_assigned', 'is', null)
      .order('scheduled_at', { ascending: false });
    setSessions((data as any[]) ?? []);
    setDataLoading(false);
  }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (student) load(student.id);
  }, [student, load]);

  async function toggleComplete(sessionId: string, currentlyDone: boolean) {
    setToggling(sessionId);
    const res = await fetch('/api/student-portal/homework', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, completed: !currentlyDone }),
    });
    if (res.ok) {
      setSessions(prev => prev.map(s =>
        s.id === sessionId
          ? { ...s, homework_completed: !currentlyDone, homework_completed_at: !currentlyDone ? new Date().toISOString() : null }
          : s,
      ));
      if (!currentlyDone) {
        setShowConfetti(true);
        setXpToast(true);
        setTimeout(() => { setShowConfetti(false); setXpToast(false); }, 2500);
      }
    }
    setToggling(null);
  }

  if (loading || dataLoading) {
    return (
      <StudentPortalLayout student={null}>
        <div className="animate-pulse space-y-3 max-w-2xl">
          {[1, 2, 3].map(i => <div key={i} className="h-20 card rounded-xl" />)}
        </div>
      </StudentPortalLayout>
    );
  }
  if (!student) return null;

  const pending   = sessions.filter(s => !s.homework_completed);
  const completed = sessions.filter(s => s.homework_completed);

  // Consecutive streak: count completed items in a row from most recent backwards
  let streak = 0;
  const byDate = [...sessions].sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  for (const s of byDate) {
    if (s.homework_completed) streak++;
    else break;
  }

  return (
    <StudentPortalLayout student={student}>
      {showConfetti && <Confetti />}

      {/* XP toast */}
      {xpToast && (
        <div className="fixed top-6 right-6 z-50 bg-amber-500 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-bold">
          <Zap className="w-4 h-4" /> +15 XP — Homework done! 🎉
        </div>
      )}

      <div className="max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Homework</h1>
            <p className="text-gray-500 text-sm mt-1">Check off completed assignments to earn XP</p>
          </div>
          {streak > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-center">
              <p className="text-xl font-black text-amber-700">🔥 {streak}</p>
              <p className="text-xs text-amber-600">in a row</p>
            </div>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="card p-10 text-center">
            <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No homework assigned yet — check back after your next session.</p>
          </div>
        ) : (
          <>
            {/* Pending */}
            {pending.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900">To Do ({pending.length})</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {pending.map(s => (
                    <div key={s.id} className="flex items-start gap-3 px-5 py-4">
                      <button
                        onClick={() => toggleComplete(s.id, false)}
                        disabled={toggling === s.id}
                        className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-green-500 transition-colors"
                      >
                        <Circle className="w-5 h-5" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900">{s.homework_assigned}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {format(new Date(s.scheduled_at), 'MMM d')} · {(s.tutor as any)?.name ?? '—'}
                        </p>
                        {s.fathom_recording_url && (
                          <div className="mt-2 space-y-1">
                            <a
                              href={s.fathom_recording_url}
                              target="_blank"
                              rel="noopener"
                              className="inline-flex items-center gap-1.5 text-xs text-navy-600 hover:text-navy-800 font-medium"
                            >
                              <Play className="w-3 h-3" /> Watch Recording
                            </a>
                            {s.fathom_summary && (
                              <button
                                type="button"
                                onClick={() => setExpandedSummary(expandedSummary === s.id ? null : s.id)}
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 ml-0.5"
                              >
                                {expandedSummary === s.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                AI Summary
                              </button>
                            )}
                            {expandedSummary === s.id && s.fathom_summary && (
                              <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">{s.fathom_summary}</p>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-amber-600 font-semibold flex-shrink-0">+15 XP</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completed */}
            {completed.length > 0 && (
              <div className="card overflow-hidden opacity-70">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-500">Completed ({completed.length})</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {completed.map(s => (
                    <div key={s.id} className="flex items-start gap-3 px-5 py-3">
                      <button
                        onClick={() => toggleComplete(s.id, true)}
                        disabled={toggling === s.id}
                        className="mt-0.5 flex-shrink-0 text-green-500 hover:text-gray-300 transition-colors"
                      >
                        <CheckCircle className="w-5 h-5" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-500 line-through">{s.homework_assigned}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {format(new Date(s.scheduled_at), 'MMM d')} · {(s.tutor as any)?.name ?? '—'}
                          {s.homework_completed_at && (
                            <> · done {format(new Date(s.homework_completed_at), 'MMM d')}</>
                          )}
                        </p>
                        {s.fathom_recording_url && (
                          <div className="mt-1.5 space-y-1">
                            <a
                              href={s.fathom_recording_url}
                              target="_blank"
                              rel="noopener"
                              className="inline-flex items-center gap-1.5 text-xs text-navy-600 hover:text-navy-800 font-medium"
                            >
                              <Play className="w-3 h-3" /> Watch Recording
                            </a>
                            {s.fathom_summary && (
                              <button
                                type="button"
                                onClick={() => setExpandedSummary(expandedSummary === s.id ? null : s.id)}
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 ml-0.5"
                              >
                                {expandedSummary === s.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                AI Summary
                              </button>
                            )}
                            {expandedSummary === s.id && s.fathom_summary && (
                              <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">{s.fathom_summary}</p>
                            )}
                          </div>
                        )}
                      </div>
                      <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </StudentPortalLayout>
  );
}
