'use client';

import { useEffect, useState } from 'react';
import { useStudentAuth } from '@/hooks/useStudentAuth';
import StudentPortalLayout from '@/components/student-portal/StudentPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { getLevelInfo, getAnimalEmoji, getColorHex, BADGE_DEFS } from '@/lib/xp';
import { ExternalLink, Trophy, Check, Calendar, Zap } from 'lucide-react';
import Link from 'next/link';
import { format, differenceInCalendarDays, startOfWeek, endOfWeek } from 'date-fns';

interface Session {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  zoom_join_url: string | null;
  tutor: { name: string } | null;
}

export default function StudentDashboardPage() {
  const { student, loading } = useStudentAuth();
  const supabase = createClient();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!student) return;
    supabase
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, status, zoom_join_url, tutor:tutors(name)')
      .eq('student_id', student.id)
      .gte('scheduled_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('scheduled_at')
      .limit(20)
      .then(({ data }) => { setSessions((data as any[]) ?? []); setDataLoading(false); });
  }, [student]);

  if (loading || dataLoading) {
    return (
      <StudentPortalLayout student={null}>
        <div className="animate-pulse space-y-4 max-w-2xl">
          {[1, 2, 3].map(i => <div key={i} className="h-24 card rounded-xl" />)}
        </div>
      </StudentPortalLayout>
    );
  }

  if (!student) return null;

  const levelInfo    = getLevelInfo(student.xp_points);
  const emoji        = getAnimalEmoji(student.avatar_animal);
  const colorHex     = getColorHex(student.avatar_color);
  const firstName    = student.name.split(' ')[0];

  // Days to test date
  const daysToTest = student.test_date
    ? differenceInCalendarDays(new Date(student.test_date), new Date())
    : null;

  // Score progress
  const scoreProgress = student.current_score != null && student.target_score != null
    ? Math.min(100, Math.max(0, Math.round((student.current_score / student.target_score) * 100)))
    : null;
  const pointsToGoal = student.target_score != null && student.current_score != null
    ? student.target_score - student.current_score
    : null;

  // This week's sessions
  const weekStart = startOfWeek(new Date());
  const weekEnd   = endOfWeek(new Date());
  const thisWeek  = sessions.filter(s => {
    const d = new Date(s.scheduled_at);
    return d >= weekStart && d <= weekEnd;
  });

  const upcoming = sessions.filter(s => s.status === 'scheduled' && new Date(s.scheduled_at) > new Date());
  const nextSession = upcoming[0] ?? null;

  // Recent badges (last 3)
  const recentBadges = (student.badges ?? []).slice(-3).reverse();

  return (
    <StudentPortalLayout student={student}>
      <div className="max-w-2xl space-y-6">
        {/* Greeting + Avatar */}
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
            style={{ backgroundColor: colorHex + '22', border: `2px solid ${colorHex}` }}
          >
            {emoji}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome back, {firstName}! 👋</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {student.avatar_color} {student.avatar_animal} · {levelInfo.name}
            </p>
          </div>
        </div>

        {/* XP Bar */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold text-gray-900">Level {levelInfo.level} — {levelInfo.name}</span>
            </div>
            <span className="text-sm text-gray-500">{student.xp_points} XP</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div
              className="h-3 rounded-full transition-all"
              style={{ width: `${levelInfo.pct}%`, backgroundColor: colorHex }}
            />
          </div>
          {levelInfo.nextName && (
            <p className="text-xs text-gray-500 mt-1.5">
              {levelInfo.xpToNext} XP to {levelInfo.nextName}
            </p>
          )}
          {!levelInfo.nextName && (
            <p className="text-xs text-amber-600 font-medium mt-1.5">👑 Max Level — Legend!</p>
          )}
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-4 gap-3">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{student.xp_points}</p>
            <p className="text-xs text-gray-500 mt-1">XP Points</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{student.streak_weeks}</p>
            <p className="text-xs text-gray-500 mt-1">Week Streak 🔥</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{student.current_score ?? '—'}</p>
            <p className="text-xs text-gray-500 mt-1">
              {student.target_score ? `→ ${student.target_score} goal` : 'Current Score'}
            </p>
            {scoreProgress != null && (
              <div className="w-full bg-gray-100 rounded-full h-1 mt-2">
                <div className="h-1 rounded-full bg-navy-600" style={{ width: `${scoreProgress}%` }} />
              </div>
            )}
          </div>
          <div className={`card p-4 text-center ${daysToTest != null && daysToTest <= 14 ? 'bg-red-50 border-red-200' : ''}`}>
            <p className={`text-2xl font-bold ${daysToTest != null && daysToTest <= 14 ? 'text-red-600' : 'text-gray-900'}`}>
              {daysToTest != null ? (daysToTest >= 0 ? daysToTest : 0) : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-1">Days to Test</p>
            {student.test_date && (
              <p className="text-xs text-gray-400 mt-0.5">{format(new Date(student.test_date), 'MMM d')}</p>
            )}
          </div>
        </div>

        {/* This Week */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">This Week</h2>
          </div>
          {thisWeek.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400">No sessions this week.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {thisWeek.map(s => {
                const past = new Date(s.scheduled_at) < new Date();
                const done = s.status === 'completed';
                return (
                  <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-green-500' : past ? 'bg-gray-200' : 'bg-navy-100 border-2 border-navy-300'}`}>
                      {done && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {format(new Date(s.scheduled_at), "EEE, MMM d 'at' h:mm a")}
                      </p>
                      <p className="text-xs text-gray-500">with {(s.tutor as any)?.name ?? '—'} · {s.duration_minutes} min</p>
                    </div>
                    {!done && s.zoom_join_url && !past && (
                      <a href={s.zoom_join_url} target="_blank" rel="noopener"
                        className="text-xs text-navy-600 font-medium hover:text-navy-800 flex-shrink-0">
                        Join
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Next Session */}
        {nextSession && (
          <div className="card p-5 bg-navy-950 text-white">
            <p className="text-xs font-medium text-navy-400 mb-2 uppercase tracking-wide">Next Session</p>
            <p className="text-lg font-bold mb-0.5">
              {format(new Date(nextSession.scheduled_at), "EEEE, MMMM d 'at' h:mm a")}
            </p>
            <p className="text-navy-300 text-sm mb-4">
              with {(nextSession.tutor as any)?.name ?? '—'} · {nextSession.duration_minutes} min
            </p>
            {nextSession.zoom_join_url ? (
              <a
                href={nextSession.zoom_join_url}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-2 bg-white text-navy-900 text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ExternalLink className="w-4 h-4" /> Join Session
              </a>
            ) : (
              <p className="text-navy-400 text-sm">Zoom link coming soon</p>
            )}
          </div>
        )}

        {/* Recent Badges */}
        {recentBadges.length > 0 && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Recent Badges</h2>
              <Link href="/student-portal/badges" className="text-xs text-navy-600 hover:text-navy-800">
                View all →
              </Link>
            </div>
            <div className="flex gap-3">
              {recentBadges.map(key => {
                const badge = BADGE_DEFS[key as keyof typeof BADGE_DEFS];
                if (!badge) return null;
                return (
                  <div key={key} className="flex flex-col items-center gap-1.5 flex-1 bg-amber-50 border border-amber-200 rounded-xl py-3 px-2">
                    <span className="text-2xl">{badge.icon}</span>
                    <p className="text-xs font-semibold text-amber-800 text-center leading-tight">{badge.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Leaderboard teaser */}
        <Link
          href="/student-portal/leaderboard"
          className="card p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors"
        >
          <Trophy className="w-8 h-8 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">Student Leaderboard</p>
            <p className="text-xs text-gray-500">See how you rank against other students</p>
          </div>
          <span className="text-gray-400 text-sm">→</span>
        </Link>
      </div>
    </StudentPortalLayout>
  );
}
