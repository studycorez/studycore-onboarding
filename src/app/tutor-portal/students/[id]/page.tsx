'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/ui/Badge';
import { ArrowLeft, ExternalLink, FileText, Video, CalendarPlus, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils';
import { format } from 'date-fns';
import ProposeSessionModal from '@/components/tutor-portal/ProposeSessionModal';

export default function TutorStudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tutor, loading } = useTutorAuth();
  const supabase = createClient();

  const [student,          setStudent]          = useState<any>(null);
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([]);
  const [pastSessions,     setPastSessions]     = useState<any[]>([]);
  const [progress,         setProgress]         = useState<any[]>([]);

  // End program modal
  const [endProgramOpen,    setEndProgramOpen]    = useState(false);
  const [endingProgram,     setEndingProgram]     = useState(false);
  const [endProgramError,   setEndProgramError]   = useState('');
  const [endProgramSuccess, setEndProgramSuccess] = useState(false);

  // Propose session modal
  const [proposeOpen, setProposeOpen] = useState(false);

  useEffect(() => {
    if (!tutor || !id) return;
    const nowIso = new Date().toISOString();

    Promise.all([
      supabase.from('students').select('*').eq('id', id).single(),

      // Upcoming sessions
      supabase.from('sessions')
        .select('*, zoom_join_url, zoom_meeting_id')
        .eq('tutor_id', tutor.id)
        .eq('student_id', id)
        .eq('status', 'scheduled')
        .gte('scheduled_at', nowIso)
        .order('scheduled_at', { ascending: true }),

      // Past sessions — anything in the past regardless of status
      supabase.from('sessions')
        .select('*, session_report:session_reports(id, submitted_at, topics_covered, engagement_rating, private_tutor_notes)')
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

  async function handleEndProgram() {
    setEndingProgram(true);
    setEndProgramError('');
    const res = await fetch('/api/tutor-portal/end-program', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: id }),
    });
    setEndingProgram(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setEndProgramError(data.error ?? 'Failed to end program. Please try again.');
      return;
    }
    setEndProgramSuccess(true);
    setEndProgramOpen(false);
    setStudent((prev: any) => prev ? { ...prev, status: 'completed' } : prev);
  }

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

          {/* Actions */}
          <div className="space-y-2">
            <button
              onClick={() => setProposeOpen(true)}
              className="w-full flex items-center gap-2 justify-center btn-secondary text-sm"
            >
              <CalendarPlus className="w-4 h-4" />
              Propose a Session
            </button>
            {student?.status !== 'completed' && !endProgramSuccess && (
              <button
                onClick={() => setEndProgramOpen(true)}
                className="w-full flex items-center gap-2 justify-center px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
              >
                End Program
              </button>
            )}
            {(student?.status === 'completed' || endProgramSuccess) && (
              <p className="text-center text-xs text-green-700 font-medium bg-green-50 rounded-lg py-2">
                Program marked as completed
              </p>
            )}
          </div>
        </div>

        {/* Propose Session Modal */}
        {tutor && (
          <ProposeSessionModal
            open={proposeOpen}
            onClose={() => setProposeOpen(false)}
            onSuccess={() => {}}
            students={student ? [{ id: id as string, name: student.name }] : []}
            defaultStudentId={id as string}
          />
        )}

        {/* End Program Confirmation Modal */}
        {endProgramOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">End Program</h3>
                  <p className="text-gray-500 text-sm mt-1">
                    Are you sure you want to mark {student?.name}&apos;s program as completed?
                    This will send completion emails to the student, parent, and admin.
                  </p>
                </div>
              </div>
              {endProgramError && (
                <p className="text-red-600 text-sm mb-3">{endProgramError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setEndProgramOpen(false); setEndProgramError(''); }}
                  className="btn-secondary flex-1 justify-center"
                  disabled={endingProgram}
                >
                  Cancel
                </button>
                <button
                  onClick={handleEndProgram}
                  disabled={endingProgram}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {endingProgram ? 'Ending…' : 'Yes, End Program'}
                </button>
              </div>
            </div>
          </div>
        )}

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
                const report = s.session_report;
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
                    {report && (
                      <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                        {report.topics_covered      && <p><span className="font-medium text-gray-600">Topics: </span>{report.topics_covered}</p>}
                        {report.engagement_rating   && <p><span className="font-medium text-gray-600">Engagement: </span>{report.engagement_rating}/5</p>}
                        {report.private_tutor_notes && <p><span className="font-medium text-gray-600">Notes: </span>{report.private_tutor_notes}</p>}
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
