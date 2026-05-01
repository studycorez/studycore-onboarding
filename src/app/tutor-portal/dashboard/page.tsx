'use client';

import { useEffect, useState } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/ui/Badge';
import { ExternalLink } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { format, startOfDay, endOfDay, addDays } from 'date-fns';

export default function TutorDashboardPage() {
  const { tutor, loading } = useTutorAuth();
  const supabase = createClient();

  const [todaySessions,    setTodaySessions]    = useState<any[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([]);
  const [stats,            setStats]            = useState({ students: 0, sessionsMonth: 0, hoursMonth: 0, earningsMonth: 0 });

  useEffect(() => {
    if (!tutor) return;
    const now = new Date();
    const todayStart = startOfDay(now).toISOString();
    const todayEnd   = endOfDay(now).toISOString();
    const weekEnd    = addDays(now, 7).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    Promise.all([
      supabase.from('sessions').select('*, student:students(name)').eq('tutor_id', tutor.id)
        .gte('scheduled_at', todayStart).lte('scheduled_at', todayEnd).order('scheduled_at'),
      supabase.from('sessions').select('*, student:students(name)').eq('tutor_id', tutor.id)
        .gt('scheduled_at', todayEnd).lte('scheduled_at', weekEnd).eq('status', 'scheduled').order('scheduled_at').limit(10),
      supabase.from('sessions').select('student_id').eq('tutor_id', tutor.id)
        .or(`status.eq.scheduled,and(status.eq.completed,scheduled_at.gte.${thirtyDaysAgo})`),
      supabase.from('sessions').select('duration_minutes').eq('tutor_id', tutor.id)
        .eq('status', 'completed').gte('scheduled_at', monthStart),
    ]).then(([today, upcoming, activeSessions, monthSessions]) => {
      setTodaySessions((today.data as any[]) ?? []);
      setUpcomingSessions((upcoming.data as any[]) ?? []);
      const hours = (monthSessions.data ?? []).reduce((s: number, x: any) => s + x.duration_minutes / 60, 0);
      setStats({
        students:      new Set((activeSessions.data ?? []).map((s: any) => s.student_id)).size,
        sessionsMonth: monthSessions.data?.length ?? 0,
        hoursMonth:    Math.round(hours * 10) / 10,
        earningsMonth: Math.round(hours * tutor.hourly_rate * 100) / 100,
      });
    });
  }, [tutor]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (loading) return null;

  return (
    <TutorPortalLayout tutor={tutor}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{greeting}, {tutor?.name?.split(' ')[0]}!</h1>
        <p className="text-gray-500 text-sm mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Active Students',   value: stats.students },
          { label: 'Sessions This Month', value: stats.sessionsMonth },
          { label: 'Hours This Month',  value: `${stats.hoursMonth}h` },
          { label: 'Earnings This Month', value: `$${stats.earningsMonth.toFixed(2)}` },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <p className="text-xs text-gray-500 font-medium">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Today's sessions */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Today's Sessions</h2>
          </div>
          {todaySessions.length === 0 ? (
            <p className="px-5 py-6 text-gray-400 text-sm">No sessions today.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {todaySessions.map((s: any) => (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm text-gray-900">{s.student?.name}</p>
                    <p className="text-xs text-gray-500">{format(new Date(s.scheduled_at), 'h:mm a')} · {s.duration_minutes}min</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={s.status} />
                    {s.zoom_join_url && (
                      <a href={s.zoom_join_url} target="_blank" rel="noopener"
                        className="inline-flex items-center gap-1 text-xs text-navy-600 hover:text-navy-800 font-medium">
                        <ExternalLink className="w-3 h-3" /> Join
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming this week */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Upcoming This Week</h2>
          </div>
          {upcomingSessions.length === 0 ? (
            <p className="px-5 py-6 text-gray-400 text-sm">No upcoming sessions this week.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {upcomingSessions.map((s: any) => (
                <div key={s.id} className="px-5 py-3">
                  <p className="font-medium text-sm text-gray-900">{s.student?.name}</p>
                  <p className="text-xs text-gray-500">{formatDateTime(s.scheduled_at)} · {s.duration_minutes}min</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </TutorPortalLayout>
  );
}
