import { createClient } from '@/lib/supabase/server';
import AdminLayout from '@/components/layout/AdminLayout';
import { StatusBadge } from '@/components/ui/Badge';
import { Users, CalendarCheck, ExternalLink, CalendarDays, Phone, AlertTriangle } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import Link from 'next/link';
import { addDays, startOfDay, endOfDay, startOfWeek, endOfWeek, subDays } from 'date-fns';

export const dynamic = 'force-dynamic';

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'xs' }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const palettes = [
    'bg-blue-100 text-blue-700',
    'bg-violet-100 text-violet-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-pink-100 text-pink-700',
    'bg-cyan-100 text-cyan-700',
  ];
  const color = palettes[name.charCodeAt(0) % palettes.length];
  const sz = size === 'xs' ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-xs';
  return (
    <span className={`inline-flex items-center justify-center rounded-full font-semibold flex-shrink-0 ${sz} ${color}`}>
      {initials}
    </span>
  );
}

export default async function DashboardPage() {
  const supabase = createClient();
  const now      = new Date();

  const [
    { count: sessionsToday },
    { count: sessionsThisCalWeek },
    { count: activeStudents },
    { count: pendingCheckIns },
    { data: upcomingSessions },
    { data: recentSessionsWithoutReports },
  ] = await Promise.all([
    supabase.from('sessions').select('*', { count: 'exact', head: true })
      .eq('status', 'scheduled')
      .gte('scheduled_at', startOfDay(now).toISOString())
      .lte('scheduled_at', endOfDay(now).toISOString()),
    supabase.from('sessions').select('*', { count: 'exact', head: true })
      .gte('scheduled_at', startOfWeek(now, { weekStartsOn: 1 }).toISOString())
      .lte('scheduled_at', endOfWeek(now, { weekStartsOn: 1 }).toISOString()),
    supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('check_ins').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('sessions')
      .select('*, tutor:tutors(name), student:students(name)')
      .eq('status', 'scheduled')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', addDays(now, 7).toISOString())
      .order('scheduled_at')
      .limit(10),
    supabase.from('sessions')
      .select('id, scheduled_at, tutor:tutors(name), student:students(name)')
      .eq('status', 'scheduled')
      .eq('report_submitted', false)
      .gte('scheduled_at', subDays(now, 3).toISOString())
      .lte('scheduled_at', now.toISOString())
      .order('scheduled_at', { ascending: false })
      .limit(10),
  ]);

  const kpis = [
    { label: "Today's Sessions", value: sessionsToday ?? 0,       icon: CalendarDays,  accentColor: '#3b82f6', bgColor: '#eff6ff' },
    { label: 'Sessions This Week',value: sessionsThisCalWeek ?? 0,icon: CalendarCheck, accentColor: '#10b981', bgColor: '#ecfdf5' },
    { label: 'Active Students',   value: activeStudents ?? 0,     icon: Users,         accentColor: '#8b5cf6', bgColor: '#f5f3ff' },
    {
      label: 'Pending Check-ins',
      value: pendingCheckIns ?? 0,
      icon: Phone,
      accentColor: (pendingCheckIns ?? 0) > 0 ? '#f59e0b' : '#d1d5db',
      bgColor:     (pendingCheckIns ?? 0) > 0 ? '#fffbeb' : '#f9fafb',
    },
  ];

  return (
    <AdminLayout>

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-0.5">
          {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {kpis.map(({ label, value, icon: Icon, accentColor, bgColor }) => (
          <div
            key={label}
            className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200"
            style={{ borderTop: `3px solid ${accentColor}` }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="rounded-xl p-2.5" style={{ background: bgColor }}>
                <Icon className="w-4 h-4" style={{ color: accentColor }} />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900 leading-none">{value}</p>
            <p className="text-xs text-gray-400 font-medium mt-1.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Missing reports alert */}
      {(recentSessionsWithoutReports?.length ?? 0) > 0 && (
        <div className="mb-6 rounded-2xl overflow-hidden border border-amber-100 bg-white shadow-sm">
          <div className="flex items-center gap-3 px-5 py-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-sm font-semibold text-amber-800">
              Missing Reports
            </p>
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
              {recentSessionsWithoutReports?.length}
            </span>
            <p className="text-xs text-amber-600/60 ml-0.5">Sessions from past 3 days with no report submitted</p>
          </div>
          <div className="divide-y divide-gray-50">
            {recentSessionsWithoutReports?.map((s: any) => (
              <div key={s.id} className="flex items-center gap-5 px-5 py-3 hover:bg-gray-50/60 transition-colors">
                <span className="text-xs text-gray-400 w-36 flex-shrink-0 tabular-nums">{formatDateTime(s.scheduled_at)}</span>
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar name={s.tutor?.name ?? '?'} size="xs" />
                  <span className="text-sm font-medium text-gray-800 truncate">{s.tutor?.name ?? '—'}</span>
                </div>
                <span className="text-gray-200 text-sm">→</span>
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar name={s.student?.name ?? '?'} size="xs" />
                  <span className="text-sm text-gray-500 truncate">{s.student?.name ?? '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming sessions */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Upcoming Sessions</h2>
            <p className="text-xs text-gray-400 mt-0.5">Next 7 days</p>
          </div>
          <Link href="/book" className="btn-primary text-xs px-3 py-1.5">
            + Quick Book
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-50">
              <tr>
                <th className="table-header pl-5">Date & Time</th>
                <th className="table-header">Tutor</th>
                <th className="table-header">Student</th>
                <th className="table-header">Duration</th>
                <th className="table-header">Status</th>
                <th className="table-header pr-5">Zoom</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {upcomingSessions?.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-14 text-sm text-gray-400">
                    No upcoming sessions in the next 7 days
                  </td>
                </tr>
              )}
              {upcomingSessions?.map((s: any) => (
                <tr key={s.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="table-cell pl-5">
                    <span className="font-medium text-gray-800 text-xs tabular-nums">{formatDateTime(s.scheduled_at)}</span>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <Avatar name={s.tutor?.name ?? '?'} size="xs" />
                      <span>{s.tutor?.name ?? '—'}</span>
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <Avatar name={s.student?.name ?? '?'} size="xs" />
                      <span>{s.student?.name ?? '—'}</span>
                    </div>
                  </td>
                  <td className="table-cell">
                    <span className="text-gray-400 tabular-nums">{s.duration_minutes} min</span>
                  </td>
                  <td className="table-cell">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="table-cell pr-5">
                    {s.zoom_join_url ? (
                      <a
                        href={s.zoom_join_url}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-700 text-sm font-medium transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Join
                      </a>
                    ) : (
                      <span className="text-gray-300 text-sm">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
