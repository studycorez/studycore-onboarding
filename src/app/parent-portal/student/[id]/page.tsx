'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useParentAuth } from '@/hooks/useParentAuth';
import ParentPortalLayout from '@/components/parent-portal/ParentPortalLayout';
import { StatusBadge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';
import { ExternalLink, ArrowLeft, FileText } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface Session {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  zoom_join_url: string | null;
  session_notes: string | null;
  tutor_feedback: string | null;
  tutor: { name: string } | null;
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

  const [sessions,  setSessions]  = useState<Session[]>([]);
  const [progress,  setProgress]  = useState<Progress[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [authorized, setAuthorized] = useState(true);

  useEffect(() => {
    if (authLoading || !parent) return;

    // Verify this student belongs to the parent
    const student = parent.students.find(s => s.id === id);
    if (!student) { setAuthorized(false); setLoading(false); return; }

    Promise.all([
      supabase
        .from('sessions')
        .select('id, scheduled_at, duration_minutes, status, zoom_join_url, session_notes, tutor_feedback, tutor:tutors(name)')
        .eq('student_id', id)
        .order('scheduled_at', { ascending: false })
        .limit(20),
      supabase
        .from('student_progress')
        .select('id, recorded_at, total_score, math_score, reading_score, writing_score')
        .eq('student_id', id)
        .order('recorded_at'),
    ]).then(([sess, prog]) => {
      setSessions((sess.data as any[]) ?? []);
      setProgress((prog.data as any[]) ?? []);
      setLoading(false);
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

  const chartData = progress.map(p => ({
    date:    format(new Date(p.recorded_at), 'MMM d'),
    Total:   p.total_score,
    Math:    p.math_score,
    Reading: p.reading_score,
    Writing: p.writing_score,
  }));

  const now = new Date();
  const upcoming = sessions.filter(s => s.status === 'scheduled' && new Date(s.scheduled_at) >= now);
  const past     = sessions.filter(s => new Date(s.scheduled_at) < now || s.status !== 'scheduled');

  const purchased  = student.purchased_hours ?? 0;
  const used       = student.used_hours ?? 0;
  const remaining  = purchased - used;
  const isLow      = purchased > 0 && remaining < 5;

  return (
    <ParentPortalLayout parent={parent}>
      <div className="mb-6">
        <Link href="/parent-portal/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>
        {student.grade && <p className="text-gray-500 text-sm">Grade {student.grade}</p>}
      </div>

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
          <p className="text-3xl font-bold text-gray-900">{currentScore ?? '—'}</p>
          {targetScore && <p className="text-xs text-navy-600 mt-1">Goal: {targetScore}</p>}
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

      {/* Score progress chart */}
      {chartData.length > 0 && (
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
                {s.session_notes && (
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
              </div>
            ))}
          </div>
        )}
      </div>
    </ParentPortalLayout>
  );
}
