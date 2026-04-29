'use client';

import { useEffect, useState } from 'react';
import { useStudentAuth } from '@/hooks/useStudentAuth';
import StudentPortalLayout from '@/components/student-portal/StudentPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { format, differenceInCalendarDays, differenceInWeeks } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Award } from 'lucide-react';

interface Progress {
  id: string;
  recorded_at: string;
  total_score: number | null;
  math_score: number | null;
  reading_score: number | null;
  test_type: string | null;
}

const MILESTONES = [1200, 1300, 1400, 1500, 1600];

export default function ScoresPage() {
  const { student, loading } = useStudentAuth();
  const supabase = createClient();
  const [progress, setProgress] = useState<Progress[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!student) return;
    supabase
      .from('student_progress')
      .select('id, recorded_at, total_score, math_score, reading_score, test_type')
      .eq('student_id', student.id)
      .order('recorded_at')
      .then(({ data }) => { setProgress((data as any[]) ?? []); setDataLoading(false); });
  }, [student]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const withTotal = progress.filter(p => p.total_score != null);

  // Linear regression projection on last 3 entries
  let projected: number | null = null;
  let projectedDate: string | null = null;
  if (withTotal.length >= 2) {
    const last3 = withTotal.slice(-3);
    const n = last3.length;
    const xs = last3.map((_, i) => i);
    const ys = last3.map(p => p.total_score!);
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
    const sumX2 = xs.reduce((s, x) => s + x * x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    // weeks between entries
    const avgWeeksBetween = last3.length > 1
      ? differenceInWeeks(new Date(last3[n - 1].recorded_at), new Date(last3[0].recorded_at)) / (n - 1)
      : 2;

    if (student.test_date) {
      const weeksToTest = differenceInWeeks(new Date(student.test_date), new Date(last3[n - 1].recorded_at));
      if (weeksToTest > 0 && avgWeeksBetween > 0) {
        const stepsToTest = weeksToTest / avgWeeksBetween;
        projected = Math.round(ys[n - 1] + slope * stepsToTest);
        projected = Math.min(1600, Math.max(400, projected));
        projectedDate = format(new Date(student.test_date), 'MMM d');
      }
    }
  }

  // Chart data with optional projected point
  const chartData = withTotal.map(p => ({
    date:     format(new Date(p.recorded_at), 'MMM d'),
    Score:    p.total_score,
    Math:     p.math_score,
    Reading:  p.reading_score,
  }));
  if (projected != null && projectedDate) {
    chartData.push({ date: `${projectedDate} (proj.)`, Score: projected, Math: null, Reading: null });
  }

  // Milestones achieved
  const achievedMilestones = MILESTONES.filter(m => withTotal.some(p => p.total_score != null && p.total_score >= m));

  const milestoneDates: Record<number, string> = {};
  for (const m of achievedMilestones) {
    const first = withTotal.find(p => p.total_score != null && p.total_score >= m);
    if (first) milestoneDates[m] = format(new Date(first.recorded_at), 'MMM d, yyyy');
  }

  return (
    <StudentPortalLayout student={student}>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Score History</h1>
          <p className="text-gray-500 text-sm mt-1">Track your progress toward your target score</p>
        </div>

        {withTotal.length === 0 ? (
          <div className="card p-10 text-center">
            <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No scores logged yet — your tutor will log your first score after your diagnostic session.</p>
          </div>
        ) : (
          <>
            {/* Chart */}
            <div className="card p-5">
              <p className="text-sm font-semibold text-gray-900 mb-4">Score Trend</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  {student.target_score && (
                    <ReferenceLine y={student.target_score} stroke="#1e2090" strokeDasharray="6 3"
                      label={{ value: `Goal ${student.target_score}`, position: 'right', fontSize: 11, fill: '#1e2090' }} />
                  )}
                  <Line type="monotone" dataKey="Score" stroke="#1e2090" strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
              {projected != null && (
                <p className="text-xs text-gray-400 mt-2 text-center">
                  Dashed point shows projection at test date based on current pace
                </p>
              )}
            </div>

            {/* Projection card */}
            {projected != null && projectedDate && (
              <div className={`card p-5 border-2 ${
                student.target_score != null && projected >= student.target_score
                  ? 'border-green-300 bg-green-50'
                  : student.target_score != null && student.target_score - projected <= 50
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-red-300 bg-red-50'
              }`}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Score Projection</p>
                <p className="text-2xl font-black text-gray-900">
                  {Math.max(400, projected - 30)} – {Math.min(1600, projected + 30)}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  At current pace, projected score by {projectedDate}
                  {student.target_score != null && (
                    projected >= student.target_score
                      ? ' — on track to hit your goal! 🎉'
                      : ` — ${student.target_score - projected} pts below goal`
                  )}
                </p>
              </div>
            )}

            {/* Milestone callouts */}
            {achievedMilestones.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-900">Milestones</p>
                {achievedMilestones.map(m => (
                  <div key={m} className="card p-4 flex items-center gap-3 bg-amber-50 border border-amber-200">
                    <Award className="w-6 h-6 text-amber-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-amber-800">You broke {m}! 🎉</p>
                      <p className="text-xs text-amber-600">{milestoneDates[m]}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Timeline */}
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">All Scores</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {[...withTotal].reverse().map((p, idx, arr) => {
                  const prev = arr[idx + 1];
                  const delta = prev?.total_score != null && p.total_score != null
                    ? p.total_score - prev.total_score
                    : null;
                  return (
                    <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900">
                          {p.total_score ?? '—'}
                          {p.test_type && (
                            <span className="ml-2 text-xs font-medium bg-blue-100 text-blue-800 rounded-full px-2 py-0.5">
                              {p.test_type}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">{format(new Date(p.recorded_at), 'MMMM d, yyyy')}</p>
                        {(p.math_score != null || p.reading_score != null) && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {p.math_score != null ? `Math ${p.math_score}` : ''}
                            {p.math_score != null && p.reading_score != null ? ' · ' : ''}
                            {p.reading_score != null ? `Reading ${p.reading_score}` : ''}
                          </p>
                        )}
                      </div>
                      {delta != null && (
                        <div className={`flex items-center gap-1 text-sm font-bold flex-shrink-0 ${
                          delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-gray-400'
                        }`}>
                          {delta > 0 ? <TrendingUp className="w-4 h-4" /> : delta < 0 ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                          {delta > 0 ? `+${delta}` : delta}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </StudentPortalLayout>
  );
}
