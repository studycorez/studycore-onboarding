import { createClient } from '@/lib/supabase/server';
import AdminLayout from '@/components/layout/AdminLayout';
import StatCard from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/Badge';
import { Users, GraduationCap, CalendarCheck, DollarSign, ExternalLink, TrendingUp, Target } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import Link from 'next/link';
import { addDays, startOfDay, endOfDay } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = createClient();

  const now = new Date();
  const weekLater = addDays(now, 7);

  const [
    { count: tutorCount },
    { count: sessionsThisWeek },
    upcomingToday,
    unpaidSessions,
    { data: upcomingSessions },
    { data: allStudents },
    { data: allProgress },
  ] = await Promise.all([
    supabase.from('tutors').select('*', { count: 'exact', head: true }),
    supabase.from('sessions').select('*', { count: 'exact', head: true })
      .eq('status', 'scheduled')
      .gte('scheduled_at', startOfDay(now).toISOString())
      .lte('scheduled_at', endOfDay(weekLater).toISOString()),
    supabase.from('sessions').select('*', { count: 'exact', head: true })
      .eq('status', 'scheduled')
      .gte('scheduled_at', startOfDay(now).toISOString())
      .lte('scheduled_at', endOfDay(now).toISOString()),
    supabase.from('sessions').select('*', { count: 'exact', head: true })
      .eq('payment_status', 'pending')
      .eq('status', 'completed'),
    supabase.from('sessions')
      .select('*, tutor:tutors(name), student:students(name)')
      .eq('status', 'scheduled')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', weekLater.toISOString())
      .order('scheduled_at')
      .limit(10),
    supabase.from('students').select('id, current_score, target_score'),
    supabase.from('student_progress')
      .select('student_id, total_score, recorded_at')
      .not('total_score', 'is', null)
      .order('recorded_at'),
  ]);

  // ── Score goal stats ──────────────────────────────────────────────────────
  // Group progress entries by student
  const progressByStudent = new Map<string, { total_score: number; recorded_at: string }[]>();
  for (const p of allProgress ?? []) {
    if (!progressByStudent.has(p.student_id)) progressByStudent.set(p.student_id, []);
    progressByStudent.get(p.student_id)!.push(p as any);
  }

  let studentsOnTrack = 0;
  const improvements: number[] = [];

  for (const student of allStudents ?? []) {
    const entries = progressByStudent.get(student.id) ?? [];
    const tgt = student.target_score;
    if (entries.length === 0) continue;

    const first = entries[0].total_score;
    const last  = entries[entries.length - 1].total_score;

    // Avg improvement: students with ≥2 entries
    if (entries.length >= 2) {
      improvements.push(last - first);
    }

    // On track: >= 50% of the way from starting to goal
    if (tgt != null && tgt > first) {
      const pct = ((last - first) / (tgt - first)) * 100;
      if (pct >= 50) studentsOnTrack++;
    }
  }

  const avgImprovement = improvements.length > 0
    ? Math.round(improvements.reduce((a, b) => a + b, 0) / improvements.length)
    : null;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Welcome back. Here's what's happening at StudyCore.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-5 mb-5">
        <StatCard
          title="Active Tutors"
          value={tutorCount ?? 0}
          icon={GraduationCap}
          iconColor="text-navy-600"
        />
        <StatCard
          title="Sessions This Week"
          value={sessionsThisWeek ?? 0}
          icon={CalendarCheck}
          iconColor="text-blue-600"
        />
        <StatCard
          title="Sessions Today"
          value={(upcomingToday as any).count ?? 0}
          icon={Users}
          iconColor="text-green-600"
        />
        <StatCard
          title="Unpaid Sessions"
          value={(unpaidSessions as any).count ?? 0}
          icon={DollarSign}
          iconColor="text-yellow-600"
          subtitle="completed, awaiting payment"
        />
      </div>

      {/* Score goal stat cards */}
      <div className="grid grid-cols-2 gap-5 mb-8">
        <StatCard
          title="Students On Track"
          value={studentsOnTrack}
          icon={Target}
          iconColor="text-green-600"
          subtitle="≥ 50% of the way to their score goal"
        />
        <StatCard
          title="Avg Score Improvement"
          value={avgImprovement != null ? `+${avgImprovement} pts` : '—'}
          icon={TrendingUp}
          iconColor="text-blue-600"
          subtitle="across students with 2+ progress entries"
        />
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
