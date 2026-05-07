'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/ui/Badge';
import { ArrowLeft, ExternalLink, FileText, Video } from 'lucide-react';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils';
import { format } from 'date-fns';

export default function TutorStudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tutor, loading } = useTutorAuth();
  const supabase = createClient();

  const [student,          setStudent]          = useState<any>(null);
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([]);
  const [pastSessions,     setPastSessions]     = useState<any[]>([]);
  const [progress,         setProgress]         = useState<any[]>([]);

  useEffect(() => {
    if (!tutor || !id) return;
    const nowIso = new Date().toISOString();

    Promise.all([
      supabase.from('students').select('*').eq('id', id).single(),

      // Upcoming sessions
      supabase.from('sessions')
        .select('*, session_logs(*)')
        .eq('tutor_id', tutor.id)
        .eq('student_id', id)
        .eq('status', 'scheduled')
        .gte('scheduled_at', nowIso)
        .order('scheduled_at', { ascending: true }),

      // Past sessions — anything in the past regardless of status
      supabase.from('sessions')
        .select('*, session_logs(*)')
        .eq('tutor_id', tutor.id)
        .eq('student_id', id)
        .lt('scheduled_at', nowIso)
        .order('scheduled_at', { ascending: false }),

      supabase.from('student_progress')
        .select('*')
        .eq('student_id', id)
        .order('recorded_at', { ascending: false })
        .limit(20),
    ]).then(([s, upcoming, past, prog]) => {
      setStudent(s.data);
      setUpcomingSessions((upcoming.data as any[]) ?? []);
      setPastSessions((past.data as any[]) ?? []);
      setProgress((prog.data as any[]) ?? []);
    });
  }, [tutor, id]); // eslint-disable-line react-hooks/exhaustive-deps

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
              {(() => {
                const email = student?.email;
                const isPlaceholder = !email || email.endsWith('@studycore.import') || email.startsWith('student-');
                return (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 shrink-0">Email</span>
                    {isPlaceholder
                      ? <span className="text-xs text-gray-400 italic">Email not on file</span>
                      : <span className="text-xs text-right break-all">{email}</span>
                    }
                  </div>
                );
              })()}
              {student?.grade && (
                <div className="flex justify-between"><span className="text-gray-500">Grade</span><span>{student.grade}</span></div>
              )}
              {student?.timezone && (
                <div className="flex justify-between"><span className="text-gray-500">Timezone</span><span className="text-xs">{student.timezone}</span></div>
              )}
              {student?.target_score != null && (
                <div className="flex justify-between"><span className="text-gray-500">Target</span><span className="font-semibold">{student.target_score}</span></div>
              )}
              {student?.current_score != null && (
                <div className="flex justify-between"><span className="text-gray-500">Current</span><span className="font-semibold">{student.current_score}</span></div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Purchased</span><span>{student?.purchased_hours ?? 0}h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Used</span><span>{(student?.used_hours ?? 0).toFixed(1)}h</span>
              </div>
              <div className="flex justify-between font-semibold pt-1 border-t border-gray-100">
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

          {/* Game Plan */}
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-400" />
              Game Plan
            </h2>
            {student?.game_plan_url ? (
              <a
                href={student.game_plan_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-navy-900 underline underline-offset-2"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View Game Plan
              </a>
            ) : (
              <p className="text-sm text-gray-400 italic">No game plan uploaded</p>
            )}
          </div>
        </div>

        {/* Sessions + Progress */}
        <div className="col-span-2 space-y-5">
          {/* Score progress table */}
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

          {/* Upcoming sessions */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Upcoming Sessions</h2>
            </div>
            {upcomingSessions.length === 0 ? (
              <p className="px-5 py-5 text-sm text-gray-400">
                No upcoming sessions scheduled. Contact your admin to schedule a session.
              </p>
            ) : (
              <div className="divide-y divide-gray-50">
                {upcomingSessions.map((s: any) => (
                  <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-gray-900">{format(new Date(s.scheduled_at), "EEE, MMM d 'at' h:mm a")}</p>
                      <p className="text-xs text-gray-500">{s.duration_minutes} min</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusBadge status={s.status} />
                      {s.zoom_join_url && (
                        <a
                          href={s.zoom_join_url}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1 text-xs font-medium text-navy-600 hover:text-navy-800"
                        >
                          <Video className="w-3.5 h-3.5" /> Zoom
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past session history */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Session History</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {pastSessions.length === 0 && (
                <p className="px-5 py-6 text-gray-400 text-sm">No past sessions yet.</p>
              )}
              {pastSessions.map((s: any) => {
                const log = s.session_logs?.[0];
                return (
                  <div key={s.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-sm text-gray-900">{formatDateTime(s.scheduled_at)}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{s.duration_minutes}min</span>
                        <StatusBadge status={s.status} />
                        {s.zoom_join_url && (
                          <a
                            href={s.zoom_join_url}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    {log && (
                      <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                        {log.went_well && <p><span className="font-medium text-green-700">✓ </span>{log.went_well}</p>}
                        {log.issues    && <p><span className="font-medium text-amber-700">! </span>{log.issues}</p>}
                        {log.homework  && <p><span className="font-medium text-gray-600">HW: </span>{log.homework}</p>}
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
