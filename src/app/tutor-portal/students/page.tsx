'use client';

import { useEffect, useState } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { User } from 'lucide-react';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils';

export default function TutorStudentsPage() {
  const { tutor, loading } = useTutorAuth();
  const supabase = createClient();
  const [students, setStudents] = useState<any[]>([]);

  useEffect(() => {
    if (!tutor) return;

    const now = new Date().toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    Promise.all([
      // Students via non-voided contracts
      supabase
        .from('contracts')
        .select('student_id, student:students(id,name,email,grade,target_score,current_score,purchased_hours,used_hours)')
        .eq('tutor_id', tutor.id)
        .in('status', ['signed', 'pending']),

      // Students via recent/upcoming sessions
      supabase
        .from('sessions')
        .select('student_id, scheduled_at, status, student:students(id,name,email,grade,target_score,current_score,purchased_hours,used_hours)')
        .eq('tutor_id', tutor.id)
        .or(`status.eq.scheduled,and(status.eq.completed,scheduled_at.gte.${thirtyDaysAgo})`)
        .order('scheduled_at', { ascending: false }),

      // Upcoming session counts per student
      supabase
        .from('sessions')
        .select('student_id')
        .eq('tutor_id', tutor.id)
        .eq('status', 'scheduled')
        .gte('scheduled_at', now),
    ]).then(([contracts, sessions, upcoming]) => {
      // Build student map — contracts first, then sessions fill any gaps
      const studentMap = new Map<string, any>();
      for (const c of (contracts.data ?? []) as any[]) {
        const s = Array.isArray(c.student) ? c.student[0] : c.student;
        if (s?.id) studentMap.set(s.id, s);
      }
      for (const row of (sessions.data ?? []) as any[]) {
        const s = Array.isArray(row.student) ? row.student[0] : row.student;
        if (s?.id && !studentMap.has(s.id)) studentMap.set(s.id, s);
      }

      // Last completed session date per student
      const lastSession = new Map<string, string>();
      for (const row of (sessions.data ?? []) as any[]) {
        if (row.status === 'completed' && !lastSession.has(row.student_id)) {
          lastSession.set(row.student_id, row.scheduled_at);
        }
      }

      // Upcoming session count per student
      const upcomingCount = new Map<string, number>();
      for (const row of (upcoming.data ?? []) as any[]) {
        upcomingCount.set(row.student_id, (upcomingCount.get(row.student_id) ?? 0) + 1);
      }

      const list = Array.from(studentMap.values()).map(s => ({
        ...s,
        lastSession:   lastSession.get(s.id) ?? null,
        upcomingCount: upcomingCount.get(s.id) ?? 0,
      }));
      // Sort: students with upcoming sessions first, then by name
      list.sort((a, b) => {
        if (b.upcomingCount !== a.upcomingCount) return b.upcomingCount - a.upcomingCount;
        return (a.name ?? '').localeCompare(b.name ?? '');
      });
      setStudents(list);
    });
  }, [tutor]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return null;

  return (
    <TutorPortalLayout tutor={tutor}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Students</h1>
        <p className="text-gray-500 text-sm mt-1">{students.length} student{students.length !== 1 ? 's' : ''}</p>
      </div>

      {students.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <User className="w-12 h-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No students yet</p>
          <p className="text-gray-400 text-sm">Students will appear once you have a signed contract or session.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {students.map((s: any) => {
            const remaining = (s.purchased_hours ?? 0) - (s.used_hours ?? 0);
            return (
              <Link key={s.id} href={`/tutor-portal/students/${s.id}`} className="card p-5 hover:shadow-md transition-shadow block">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-navy-100 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-navy-500" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{s.name}</h3>
                    {s.grade && <p className="text-xs text-gray-500">Grade {s.grade}</p>}
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  {s.email && (
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500 shrink-0">Email</span>
                      <span className="font-medium text-xs truncate text-right">{s.email}</span>
                    </div>
                  )}
                  {s.target_score != null && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Target</span>
                      <span className="font-medium">{s.target_score}</span>
                    </div>
                  )}
                  {s.current_score != null && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Current</span>
                      <span className="font-medium">{s.current_score}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Hours remaining</span>
                    <span className={`font-medium ${remaining < 5 ? 'text-red-600' : 'text-gray-900'}`}>
                      {Math.max(0, remaining).toFixed(1)}h
                    </span>
                  </div>
                  {s.upcomingCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Upcoming</span>
                      <span className="font-medium text-navy-600">{s.upcomingCount} session{s.upcomingCount !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {s.lastSession && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Last session</span>
                      <span className="font-medium text-xs">{formatDateTime(s.lastSession)}</span>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </TutorPortalLayout>
  );
}
