'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import { CheckCircle, XCircle, ChevronDown, ChevronUp, Loader2, AlertTriangle, User, Edit2 } from 'lucide-react';

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

interface EditRequest {
  id: string;
  session_id: string;
  edit_requested_at: string;
  edit_request_reason: string | null;
  topics_covered: string | null;
  submitted_at: string;
  session: {
    scheduled_at: string;
    student: { name: string } | null;
    tutor: { name: string } | null;
  } | null;
}

interface Student {
  id: string;
  name: string;
}

export default function PendingReviewsPage() {
  const supabase = createClient();

  const [tab, setTab] = useState<'approvals' | 'edits'>('approvals');

  // Student approvals tab
  const [reports,  setReports]  = useState<PendingReport[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(true);

  // Per-row UI state (approvals)
  const [expandedId,    setExpandedId]    = useState<string | null>(null);
  const [approveId,     setApproveId]     = useState<string | null>(null);
  const [matchedStudent, setMatchedStudent] = useState<string>('');
  const [actingId,      setActingId]      = useState<string | null>(null);
  const [error,         setError]         = useState('');

  // Edit requests tab
  const [editRequests,    setEditRequests]    = useState<EditRequest[]>([]);
  const [loadingEdits,    setLoadingEdits]    = useState(true);
  const [editActingId,    setEditActingId]    = useState<string | null>(null);
  const [editError,       setEditError]       = useState('');
  const [editExpandedId,  setEditExpandedId]  = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/session-reports/pending').then(r => r.json()),
      supabase.from('students').select('id, name').order('name'),
    ]).then(([reportData, { data: studentData }]) => {
      setReports(reportData.reports ?? []);
      setStudents(studentData ?? []);
      setLoadingApprovals(false);
    });

    fetch('/api/admin/session-reports/edit-requests').then(r => r.json()).then(d => {
      setEditRequests(d.requests ?? []);
      setLoadingEdits(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openApprove(report: PendingReport) {
    setApproveId(report.id);
    setExpandedId(null);
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

  async function handleApproveEdit(req: EditRequest) {
    setEditActingId(req.id);
    setEditError('');
    const res = await fetch(`/api/admin/session-reports/${req.id}/approve-edit`, { method: 'POST' });
    const d = await res.json();
    setEditActingId(null);
    if (!res.ok) { setEditError(d.error ?? 'Approve failed'); return; }
    setEditRequests(prev => prev.filter(r => r.id !== req.id));
  }

  async function handleRejectEdit(req: EditRequest) {
    const confirmed = window.confirm(
      `Reject this edit request?\n\nThe report will remain as-is and the tutor's request will be cleared.`
    );
    if (!confirmed) return;
    setEditActingId(req.id);
    setEditError('');
    const res = await fetch(`/api/admin/session-reports/${req.id}/reject-edit`, { method: 'POST' });
    const d = await res.json();
    setEditActingId(null);
    if (!res.ok) { setEditError(d.error ?? 'Reject failed'); return; }
    setEditRequests(prev => prev.filter(r => r.id !== req.id));
  }

  const totalPending = reports.length + editRequests.length;

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Pending Reviews</h1>
        {totalPending > 0 && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
            {totalPending} pending
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setTab('approvals')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'approvals'
              ? 'border-navy-600 text-navy-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Student Approvals
          {reports.length > 0 && (
            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
              {reports.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('edits')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'edits'
              ? 'border-navy-600 text-navy-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Edit Requests
          {editRequests.length > 0 && (
            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
              {editRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* ── STUDENT APPROVALS TAB ─────────────────────────────────── */}
      {tab === 'approvals' && (
        <>
          {error && (
            <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
            </div>
          )}

          {loadingApprovals ? (
            <div className="flex items-center gap-2 text-gray-400 mt-10">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading…
            </div>
          ) : reports.length === 0 ? (
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
                    <div className="px-5 py-4 grid grid-cols-[1fr_140px_140px_180px_1fr_140px_auto] items-center gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{sessionDate}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{session?.duration_minutes ?? report.duration_minutes ?? '?'}m</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Tutor</p>
                        <p className="text-sm text-gray-900">{session?.tutor?.name ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Assigned</p>
                        <p className="text-sm text-gray-900">{session?.student?.name ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Tutor typed</p>
                        <p className="text-sm font-semibold text-amber-700">{report.override_student_name ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Topics</p>
                        <p className="text-sm text-gray-600 truncate max-w-xs">
                          {report.topics_covered ? report.topics_covered.slice(0, 80) + (report.topics_covered.length > 80 ? '…' : '') : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Submitted</p>
                        <p className="text-sm text-gray-600">{submittedAgo}</p>
                      </div>
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
        </>
      )}

      {/* ── EDIT REQUESTS TAB ────────────────────────────────────── */}
      {tab === 'edits' && (
        <>
          {editError && (
            <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {editError}
            </div>
          )}

          {loadingEdits ? (
            <div className="flex items-center gap-2 text-gray-400 mt-10">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading…
            </div>
          ) : editRequests.length === 0 ? (
            <div className="card p-10 text-center text-gray-400">
              <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-400" />
              <p className="text-sm">No pending edit requests.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {editRequests.map(req => {
                const sessionDate = req.session?.scheduled_at
                  ? format(new Date(req.session.scheduled_at), 'EEE, MMM d · h:mm a')
                  : '—';
                const requestedAgo = formatDistanceToNow(new Date(req.edit_requested_at), { addSuffix: true });
                const isActing    = editActingId === req.id;
                const isExpanded  = editExpandedId === req.id;

                return (
                  <div key={req.id} className="card overflow-hidden">
                    <div className="px-5 py-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {sessionDate}
                          <span className="ml-2 text-gray-500 font-normal">· {req.session?.student?.name ?? '—'}</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Tutor: {req.session?.tutor?.name ?? '—'} · Requested {requestedAgo}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => setEditExpandedId(isExpanded ? null : req.id)}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          Reason
                        </button>
                        <button
                          onClick={() => handleApproveEdit(req)}
                          disabled={isActing}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1 disabled:opacity-50"
                        >
                          {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Edit2 className="w-3.5 h-3.5" />}
                          Approve Edit
                        </button>
                        <button
                          onClick={() => handleRejectEdit(req)}
                          disabled={isActing}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1 disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-amber-50 px-5 py-4">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Edit Reason</p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">
                          {req.edit_request_reason ?? '(no reason provided)'}
                        </p>
                        {req.topics_covered && (
                          <div className="mt-3">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Current Topics (filed)</p>
                            <p className="text-sm text-gray-600">{req.topics_covered.slice(0, 120)}{req.topics_covered.length > 120 ? '…' : ''}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
