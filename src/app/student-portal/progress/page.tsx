'use client';

import { useEffect, useState } from 'react';
import { useStudentAuth } from '@/hooks/useStudentAuth';
import StudentPortalLayout from '@/components/student-portal/StudentPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/ui/Badge';
import { getColorHex } from '@/lib/xp';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { TrendingUp, Award } from 'lucide-react';

interface Progress {
  id: string;
  math_score: number | null;
  reading_score: number | null;
  total_score: number | null;
  recorded_at: string;
  notes: string | null;
}

interface Session {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  session_notes: string | null;
  tutor_feedback: string | null;
  tutor: { name: string } | null;
}

export default function ProgressPage() {
  const { student, loading } = useStudentAuth();
  const supabase = createClient();
  const [progress, setProgress] = useState<Progress[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!student) return;
    Promise.all([
      supabase
        .from('student_progress')
        .select('id, math_score, reading_score, total_score, recorded_at, notes')
        .eq('student_id', student.id)
        .order('recorded_at'),
      supabase
        .from('sessions')
        .select('id, scheduled_at, duration_minutes, status, session_notes, tutor_feedback, tutor:tutors(name)')
        .eq('student_id', student.id)
        .order('scheduled_at', { ascending: false })
        .limit(20),
    ]).then(([p, s]) => {
      setProgress((p.data as any[]) ?? []);
      setSessions((s.data as any[]) ?? []);
      setDataLoading(false);
    });
  }, [student]);

  if (loading || dataLoading) {
    return (
      <StudentPortalLayout student={null}>
        <div className="animate-pulse space-y-4 max-w-2xl">
          {[1, 2, 3].map(i => <div key={i} className="h-32 card rounded-xl" />)}
        </div>
      </StudentPortalLayout>
    );
  }

  if (!student) return null;

  const colorHex = getColorHex(student.avatar_color);
  const startScore = progress[0]?.total_score ?? student.current_score ?? 0;
  const latestScore = progress[progress.length - 1]?.total_score ?? student.current_score ?? 0;
  const targetScore = student.target_score;
  const improvement = latestScore - startScore;

  // Progress bar (starting score → current → target)
  const rangeStart = Math.min(startScore, 400);
  const rangeEnd   = targetScore ?? Math.max(latestScore + 100, 1600);
  const barPct     = rangeEnd > rangeStart
    ? Math.min(100, Math.max(0, ((latestScore - rangeStart) / (rangeEnd - rangeStart)) * 100))
    : 0;

  // Milestone check: did they recently hit a 50-point milestone?
  const recentMilestone = improvement > 0 && improvement % 50 < 20 ? Math.floor(improvement / 50) * 50 : null;

  // Chart data
  const chartData = progress.map(p => ({
    date: format(new Date(p.recorded_at), 'MMM d'),
    Total: p.total_score,
    Math: p.math_score,
    Reading: p.reading_score,
  }));

  return (
    <StudentPortalLayout student={student}>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Score Progress</h1>
          <p className="text-gray-500 text-sm mt-1">Your SAT journey from start to goal</p>
        </div>

        {/* Milestone banner */}
        {recentMilestone != null && recentMilestone > 0 && (
          <div className="flex items-center gap-3 px-5 py-3.5 bg-amber-50 border border-amber-200 rounded-xl">
            <Award className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <p className="text-sm font-medium text-amber-800">
              🎉 You&apos;ve improved by {recentMilestone} points! Keep it up!
            </p>
          </div>
        )}

        {/* Animated progress bar */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-gray-600">Score Journey</p>
            {improvement !== 0 && (
              <span className={`text-sm font-bold ${improvement > 0 ? 'text-green-600' : 'text-red-500'}`}>
                {improvement > 0 ? '+' : ''}{improvement} pts
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
            <span>Start: {startScore}</span>
            <span className="flex-1" />
            {targetScore && <span className="font-semibold text-navy-700">Goal: {targetScore}</span>}
          </div>
          <div className="relative w-full bg-gray-100 rounded-full h-4">
            <div
              className="h-4 rounded-full transition-all duration-700"
              style={{ width: `${barPct}%`, backgroundColor: colorHex }}
            />
            {targetScore && (
              <div className="absolute right-0 top-0 h-4 w-0.5 bg-navy-700 rounded-full" />
            )}
          </div>
          <div className="flex items-center justify-between mt-2 text-sm">
            <span className="font-semibold text-gray-900">{latestScore}</span>
            {targetScore && (
              <span className="text-navy-600 font-semibold">
                {latestScore >= targetScore ? '🎯 Goal reached!' : `${targetScore - latestScore} pts to go`}
              </span>
            )}
          </div>
        </div>

        {/* Chart */}
        {chartData.length > 1 && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Score History</h2>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis domain={[400, 1600]} tick={{ fontSize: 11 }} stroke="#9ca3af" />
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
                <Line type="monotone" dataKey="Total"   stroke={colorHex}   strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Math"    stroke="#6b84ff"    strokeWidth={1.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Reading" stroke="#10b981"    strokeWidth={1.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Session History */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Session History</h2>
          </div>
          {sessions.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">No sessions yet.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {sessions.map(s => (
                <div key={s.id} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900">
                      {format(new Date(s.scheduled_at), "EEE, MMM d 'at' h:mm a")}
                    </p>
                    <StatusBadge status={s.status as any} />
                  </div>
                  <p className="text-xs text-gray-500">with {(s.tutor as any)?.name ?? '—'} · {s.duration_minutes} min</p>
                  {s.session_notes && (
                    <p className="text-xs text-gray-600 mt-1.5 bg-gray-50 rounded-lg px-3 py-2">{s.session_notes}</p>
                  )}
                  {s.tutor_feedback && (
                    <p className="text-xs text-navy-600 mt-1 italic">"{s.tutor_feedback}"</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </StudentPortalLayout>
  );
}
