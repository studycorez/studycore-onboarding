'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import { CheckCircle, XCircle, ChevronDown, ChevronUp, Loader2, AlertTriangle, User } from 'lucide-react';

interface PendingReport {
  id: string;
  session_id: string;
  override_student_name: string | null;
  topics_covered: string | null;
  homework_assigned: string | null;
  concerns_for_parent: string | null;
  engagement_rating: number | null;
  student_attended: string | null;
  tutor_attended: string | null;
  duration_minutes: number | null;
  submitted_at: string;
  session: {
    id: string;
    scheduled_at: string;
    duration_minutes: number;
    student: { id: string; name: string } | null;
    tutor: { id: string; name: string } | null;
  } | null;
}

interface Student {
  id: string;
  name: string;
}

export default function PendingReviewsPage() {
  const supabase = createClient();

  const [reports,  setReports]  = useState<PendingReport[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Per-row UI state
  const [expandedId,    setExpandedId]    = useState<string | null>(null);
  const [approveId,     setApproveId]     = useState<string | null>(null);
  const [matchedStudent, setMatchedStudent] = useState<string>('');
  const [actingId,      setActingId]      = useState<string | null>(null);
  const [error,         setError]         = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/session-reports/pending').then(r => r.json()),
      supabase.from('students').select('id, name').order('name'),
    ]).then(([reportData, { data: studentData }]) => {
      setReports(reportData.reports ?? []);
      setStudents(studentData ?? []);
      setLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openApprove(report: PendingReport) {
    setApproveId(report.id);
    setExpandedId(null);
    // Pre-select the student if override_student_name fuzzy-matches a known student
    const suggestion = report.override_student_name?.toLowerCase() ?? '';
    const match = students.find(s => s.name.toLowerCase().includes(suggestion) || suggestion.includes(s.name.toLowerCase().split(' ')[0]));
    setMatchedStudent(match?.id ?? '');
    setError('');
  }

  async function handleApprove(reportId: string) {
    setActingId(reportId);
    setError('');
    const body: { matched_student_id?: string } = {};
    if (matchedStudent) body.matched_student_id = matchedStudent;

    const res = await fetch(`/api/admin/session-reports/${reportId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setActingId(null);

    if (!res.ok) {
      setError(d.error ?? 'Approve failed');
      return;
    }
    setReports(prev => prev.filter(r => r.id !== reportId));
    setApproveId(null);
  }

  async function handleReject(report: PendingReport) {
    const sessionDate = report.session?.scheduled_at
      ? format(new Date(report.session.scheduled_at), 'MMM d')
      : 'this session';
    const tutorName = report.session?.tutor?.name ?? 'the tutor';
    const confirmed = window.confirm(
      `Reject and delete this report?\n\nSession: ${sessionDate} with ${tutorName}\nOverride name: ${report.override_student_name ?? '—'}\n\nThe tutor will need to resubmit.`
    );
    if (!confirmed) return;

    setActingId(report.id);
    setError('');
    const res = await fetch(`/api/admin/session-reports/${report.id}/reject`, { method: 'POST' });
    const d = await res.json();
    setActingId(null);

    if (!res.ok) {
      setError(d.error ?? 'Reject failed');
      return;
    }
    setReports(prev => prev.filter(r => r.id !== report.id));
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center gap-2 text-gray-400 mt-10">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Pending Reviews</h1>
        {reports.length > 0 && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
            {reports.length} pending
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}

      {reports.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-400" />
          <p className="text-sm">No pending reports — all caught up.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(report => {
            const session    = report.session;
            const sessionDate = session?.scheduled_at
              ? format(new Date(session.scheduled_at), 'EEE, MMM d · h:mm a')
              : '—';
            const submittedAgo = formatDistanceToNow(new Date(report.submitted_at), { addSuffix: true });
            const isActing   = actingId === report.id;
            const isApproving = approveId === report.id;
            const isExpanded  = expandedId === report.id;

            return (
              <div key={report.id} className="card overflow-hidden">
                {/* Main row */}
                <div className="px-5 py-4 grid grid-cols-[1fr_140px_140px_180px_1fr_140px_auto] items-center gap-4">
                  {/* Session date */}
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{sessionDate}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{session?.duration_minutes ?? report.duration_minutes ?? '?'}m</p>
                  </div>

                  {/* Tutor */}
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Tutor</p>
                    <p className="text-sm text-gray-900">{session?.tutor?.name ?? '—'}</p>
                  </div>

                  {/* Assigned student */}
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Assigned</p>
                    <p className="text-sm text-gray-900">{session?.student?.name ?? '—'}</p>
                  </div>

                  {/* Override name */}
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Tutor typed</p>
                    <p className="text-sm font-semibold text-amber-700">{report.override_student_name ?? '—'}</p>
                  </div>

                  {/* Topics */}
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Topics</p>
                    <p className="text-sm text-gray-600 truncate max-w-xs">
                      {report.topics_covered ? report.topics_covered.slice(0, 80) + (report.topics_covered.length > 80 ? '…' : '') : '—'}
                    </p>
                  </div>

                  {/* Submitted */}
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Submitted</p>
                    <p className="text-sm text-gray-600">{submittedAgo}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => { setExpandedId(isExpanded ? null : report.id); setApproveId(null); }}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      View
                    </button>
                    <button
                      onClick={() => { isApproving ? setApproveId(null) : openApprove(report); setExpandedId(null); }}
                      disabled={isActing}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1 disabled:opacity-50"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {isApproving ? 'Cancel' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleReject(report)}
                      disabled={isActing}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1 disabled:opacity-50"
                    >
                      {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                      Reject
                    </button>
                  </div>
                </div>

                {/* Expanded: full report */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 space-y-3">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Full Report</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-gray-400 font-medium mb-0.5">Student attended</p>
                        <p className="text-gray-900">{report.student_attended ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium mb-0.5">Tutor attended</p>
                        <p className="text-gray-900">{report.tutor_attended ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium mb-0.5">Engagement</p>
                        <p className="text-gray-900">{report.engagement_rating ? `${report.engagement_rating}/5` : '—'}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-gray-400 font-medium mb-0.5">Topics Covered</p>
                        <p className="text-gray-900 whitespace-pre-wrap">{report.topics_covered ?? '—'}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-gray-400 font-medium mb-0.5">Homework Assigned</p>
                        <p className="text-gray-900 whitespace-pre-wrap">{report.homework_assigned ?? '—'}</p>
                      </div>
                      {report.concerns_for_parent && (
                        <div className="col-span-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <p className="text-xs text-amber-700 font-medium mb-0.5">Concerns for Parent</p>
                          <p className="text-amber-900 text-sm whitespace-pre-wrap">{report.concerns_for_parent}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Expanded: approve form */}
                {isApproving && (
                  <div className="border-t border-gray-100 bg-green-50 px-5 py-4">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Approve Report</h3>
                    <div className="flex items-end gap-4">
                      <div className="flex-1">
                        <label className="text-xs font-medium text-gray-600 block mb-1.5">
                          <User className="w-3.5 h-3.5 inline mr-1" />
                          Match to student
                          {report.override_student_name && (
                            <span className="ml-2 text-amber-600 font-normal">
                              (tutor typed: <strong>{report.override_student_name}</strong>)
                            </span>
                          )}
                        </label>
                        <select
                          value={matchedStudent}
                          onChange={e => setMatchedStudent(e.target.value)}
                          className="input w-full"
                        >
                          <option value="">— Keep as-is, just approve —</option>
                          {students.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        {matchedStudent && (
                          <p className="text-xs text-green-700 mt-1">
                            Will reassign session + homework items to <strong>{students.find(s => s.id === matchedStudent)?.name}</strong>.
                          </p>
                        )}
                        {!matchedStudent && (
                          <p className="text-xs text-gray-400 mt-1">No reassignment — report approved as filed.</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleApprove(report.id)}
                        disabled={isActing}
                        className="btn-primary flex items-center gap-2 flex-shrink-0"
                      >
                        {isActing
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <CheckCircle className="w-4 h-4" />
                        }
                        {isActing ? 'Approving…' : 'Confirm Approve'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
