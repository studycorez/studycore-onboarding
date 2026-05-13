import { createClient } from '@/lib/supabase/server';
import AdminLayout from '@/components/layout/AdminLayout';
import { StatusBadge } from '@/components/ui/Badge';
import { Users, CalendarCheck, DollarSign, ExternalLink, CalendarDays } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import Link from 'next/link';
import { addDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = createClient();

  const now = new Date();
  const weekLater = addDays(now, 7);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const weekEnd   = endOfWeek(now, { weekStartsOn: 1 });   // Sunday

  const monthStart = startOfMonth(now);
  const monthEnd   = endOfMonth(now);

  const [
    { count: sessionsToday },
    { count: sessionsThisCalWeek },
    { count: activeStudents },
    { data: paidInvoicesThisMonth },
    { data: upcomingSessions },
  ] = await Promise.all([
    // Today's sessions (scheduled)
    supabase.from('sessions').select('*', { count: 'exact', head: true })
      .eq('status', 'scheduled')
      .gte('scheduled_at', startOfDay(now).toISOString())
      .lte('scheduled_at', endOfDay(now).toISOString()),
    // This week's sessions (Mon–Sun)
    supabase.from('sessions').select('*', { count: 'exact', head: true })
      .gte('scheduled_at', weekStart.toISOString())
      .lte('scheduled_at', weekEnd.toISOString()),
    // Active students
    supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    // Revenue this month
    supabase.from('invoices').select('amount').eq('status', 'paid')
      .gte('created_at', monthStart.toISOString())
      .lte('created_at', monthEnd.toISOString()),
    // Upcoming sessions for table
    supabase.from('sessions')
      .select('*, tutor:tutors(name), student:students(name)')
      .eq('status', 'scheduled')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', weekLater.toISOString())
      .order('scheduled_at')
      .limit(10),
  ]);

  const revenueThisMonth = (paidInvoicesThisMonth ?? []).reduce((sum: number, inv: any) => sum + (inv.amount ?? 0), 0);

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Welcome back. Here's what's happening at StudyCore.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6 p-4 bg-navy-950 rounded-2xl">
        {[
          { label: "Today's Sessions",    value: sessionsToday ?? 0,        icon: CalendarDays,  color: 'text-blue-300' },
          { label: 'Sessions This Week',  value: sessionsThisCalWeek ?? 0,  icon: CalendarCheck, color: 'text-green-300' },
          { label: 'Active Students',     value: activeStudents ?? 0,       icon: Users,         color: 'text-purple-300' },
          { label: 'Revenue This Month',  value: `$${revenueThisMonth.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, icon: DollarSign, color: 'text-yellow-300' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
            <div className={`${color} flex-shrink-0`}><Icon className="w-5 h-5" /></div>
            <div>
              <p className="text-white/50 text-xs font-medium">{label}</p>
              <p className="text-white text-xl font-bold leading-tight">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Upcoming Sessions */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Upcoming Sessions (Next 7 Days)</h2>
          <Link href="/book" className="btn-primary text-xs px-3 py-1.5">
            + Quick Book
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-header">Date & Time</th>
                <th className="table-header">Tutor</th>
                <th className="table-header">Student</th>
                <th className="table-header">Duration</th>
                <th className="table-header">Status</th>
                <th className="table-header">Zoom</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {upcomingSessions?.length === 0 && (
                <tr><td colSpan={6} className="table-cell text-gray-400 text-center py-8">No upcoming sessions</td></tr>
              )}
              {upcomingSessions?.map((s: any) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="table-cell font-medium">{formatDateTime(s.scheduled_at)}</td>
                  <td className="table-cell">{s.tutor?.name ?? '—'}</td>
                  <td className="table-cell">{s.student?.name ?? '—'}</td>
                  <td className="table-cell">{s.duration_minutes} min</td>
                  <td className="table-cell"><StatusBadge status={s.status} /></td>
                  <td className="table-cell">
                    {s.zoom_join_url
                      ? <a href={s.zoom_join_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-navy-600 hover:text-navy-800 text-sm font-medium"><ExternalLink className="w-3 h-3" />Join</a>
                      : <span className="text-gray-400 text-sm">—</span>}
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
