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
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Active = upcoming scheduled OR completed in last 30 days
    supabase
      .from('sessions')
      .select('student_id, scheduled_at, status, student:students(id,name,grade,target_score,current_score,purchased_hours,used_hours)')
      .eq('tutor_id', tutor.id)
      .or(`status.eq.scheduled,and(status.eq.completed,scheduled_at.gte.${thirtyDaysAgo})`)
      .order('scheduled_at', { ascending: false })
      .then(({ data: sessions }) => {
        const seen = new Map<string, any>();
        const lastSession = new Map<string, string>();
        for (const s of sessions ?? []) {
          const student = s.student as any;
          if (!student?.id) continue;
          if (!seen.has(student.id)) seen.set(student.id, student);
          if (s.status === 'completed' && !lastSession.has(student.id)) {
            lastSession.set(student.id, s.scheduled_at);
          }
        }
        setStudents(Array.from(seen.values()).map(s => ({
          ...s,
          lastSession: lastSession.get(s.id) ?? null,
        })));
      });
  }, [tutor]);

  if (loading) return null;

  return (
    <TutorPortalLayout tutor={tutor}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Students</h1>
        <p className="text-gray-500 text-sm mt-1">{students.length} active student{students.length !== 1 ? 's' : ''}</p>
      </div>

      {students.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <User className="w-12 h-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No students yet</p>
          <p className="text-gray-400 text-sm">Students will appear once you have a signed contract.</p>
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
                  {s.target_score && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Target</span>
                      <span className="font-medium">{s.target_score}</span>
                    </div>
                  )}
                  {s.current_score && (
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
