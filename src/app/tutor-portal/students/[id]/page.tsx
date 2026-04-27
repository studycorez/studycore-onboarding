'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/ui/Badge';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils';

export default function TutorStudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tutor, loading } = useTutorAuth();
  const supabase = createClient();

  const [student,  setStudent]  = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [progress, setProgress] = useState<any[]>([]);

  useEffect(() => {
    if (!tutor || !id) return;
    Promise.all([
      supabase.from('students').select('*').eq('id', id).single(),
      supabase.from('sessions').select('*, session_logs(*)').eq('tutor_id', tutor.id).eq('student_id', id).order('scheduled_at', { ascending: false }).limit(30),
      supabase.from('student_progress').select('*').eq('student_id', id).order('recorded_at', { ascending: false }).limit(20),
    ]).then(([s, sess, prog]) => {
      setStudent(s.data);
      setSessions((sess.data as any[]) ?? []);
      setProgress((prog.data as any[]) ?? []);
    });
  }, [tutor, id]);

  if (loading) return null;

  const remaining = (student?.purchased_hours ?? 0) - (student?.used_hours ?? 0);

  return (
    <TutorPortalLayout tutor={tutor}>
      <div className="mb-5">
        <Link href="/tutor-portal/students" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to Students
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{student?.name}</h1>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Profile */}
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Student Info</h2>
            <div className="space-y-2 text-sm">
              {student?.grade        && <div className="flex justify-between"><span className="text-gray-500">Grade</span><span>{student.grade}</span></div>}
              {student?.target_score && <div className="flex justify-between"><span className="text-gray-500">Target</span><span className="font-semibold">{student.target_score}</span></div>}
              {student?.current_score&& <div className="flex justify-between"><span className="text-gray-500">Current</span><span className="font-semibold">{student.current_score}</span></div>}
              <div className="flex justify-between">
                <span className="text-gray-500">Purchased</span><span>{student?.purchased_hours ?? 0}h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Used</span><span>{(student?.used_hours ?? 0).toFixed(1)}h</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-gray-500">Remaining</span>
                <span className={remaining < 5 ? 'text-red-600' : 'text-green-700'}>{Math.max(0, remaining).toFixed(1)}h</span>
              </div>
            </div>
            {student?.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 font-medium mb-1">Notes</p>
                <p className="text-sm text-gray-600">{student.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Sessions + Progress */}
        <div className="col-span-2 space-y-5">
          {/* Progress table */}
          {progress.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Score Progress</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="table-header">Date</th>
                      <th className="table-header text-right">Math</th>
                      <th className="table-header text-right">Reading</th>
                      <th className="table-header text-right">Writing</th>
                      <th className="table-header text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {progress.map((p: any) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="table-cell">{formatDateTime(p.recorded_at)}</td>
                        <td className="table-cell text-right">{p.math_score ?? '—'}</td>
                        <td className="table-cell text-right">{p.reading_score ?? '—'}</td>
                        <td className="table-cell text-right">{p.writing_score ?? '—'}</td>
                        <td className="table-cell text-right font-semibold">{p.total_score ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Session history */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Session History</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {sessions.length === 0 && (
                <p className="px-5 py-6 text-gray-400 text-sm">No sessions yet.</p>
              )}
              {sessions.map((s: any) => {
                const log = s.session_logs?.[0];
                return (
                  <div key={s.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-sm text-gray-900">{formatDateTime(s.scheduled_at)}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{s.duration_minutes}min</span>
                        <StatusBadge status={s.status} />
                      </div>
                    </div>
                    {log && (
                      <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                        {log.went_well   && <p><span className="font-medium text-green-700">✓ </span>{log.went_well}</p>}
                        {log.issues      && <p><span className="font-medium text-amber-700">! </span>{log.issues}</p>}
                        {log.homework    && <p><span className="font-medium text-gray-600">HW: </span>{log.homework}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </TutorPortalLayout>
  );
}
