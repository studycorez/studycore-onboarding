'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle, Clock, CheckCircle, FileText, Edit2, Send,
  ChevronDown, ChevronUp, Loader2, X, CalendarX, PlusCircle,
} from 'lucide-react';
import Link from 'next/link';

interface PendingSession {
  session_id: string;
  scheduled_at: string;
  duration_minutes: number;
  student_name: string;
  hours_until_cutoff: number;
}

interface PendingApprovalSession {
  session_id: string;
  scheduled_at: string;
  duration_minutes: number;
  logged_student_name: string | null;
}

interface BacklogSession {
  session_id: string;
  scheduled_at: string;
  duration_minutes: number;
  student_name: string;
}

interface PastDueSession {
  session_id: string;
  scheduled_at: string;
  duration_minutes: number;
  student_name: string;
  late_filing_requested_at: string | null;
  late_filing_approved_at: string | null;
}

interface FiledReport {
  session_id: string;
  report_id: string;
  scheduled_at: string;
  duration_minutes: number;
  student_name: string;
  submitted_at: string;
  minutes_since_submit: number;
  is_auto_editable: boolean;
  is_admin_unlocked: boolean;
  edit_requested_at: string | null;
  edit_unlocked_until: string | null;
  topics_preview: string | null;
}

export default function MyReportsPage() {
  const { tutor, loading } = useTutorAuth();
  const [pendingApproval, setPendingApproval] = useState<PendingApprovalSession[]>([]);
  const [pending,       setPending]       = useState<PendingSession[]>([]);
  const [backlog,       setBacklog]       = useState<BacklogSession[]>([]);
  const [toast,         setToast]         = useState('');
  const [filedRecently, setFiledRecently] = useState<FiledReport[]>([]);
  const [past,          setPast]          = useState<FiledReport[]>([]);
  const [pastDue,       setPastDue]       = useState<PastDueSession[]>([]);
  const [dataLoading,   setDataLoading]   = useState(true);

  // Late filing modal
  const [lateFilingId,        setLateFilingId]        = useState<string | null>(null);
  const [lateFilingReason,    setLateFilingReason]    = useState('');
  const [submittingLateFiling, setSubmittingLateFiling] = useState(false);
  const [lateFilingError,     setLateFilingError]     = useState('');

  // Edit request modal
  const [editRequestId,   setEditRequestId]   = useState<string | null>(null);
  const [editReason,      setEditReason]      = useState('');
  const [submittingEdit,  setSubmittingEdit]  = useState(false);
  const [editError,       setEditError]       = useState('');
  const [editSuccess,     setEditSuccess]     = useState<string | null>(null); // report_id

  // Expanded past row (view modal)
  const [viewReport, setViewReport] = useState<FiledReport | null>(null);

  // Log a Missed Session modal
  const [logMissedOpen,       setLogMissedOpen]       = useState(false);
  const [logMissedForm,       setLogMissedForm]       = useState({
    logged_student_name: '', scheduled_at: '', duration_minutes: '60',
    topics_covered: '', homework_assigned: '',
    engagement_rating: '4', tutor_attended: 'yes', private_tutor_notes: '',
  });
  const [submittingLogMissed, setSubmittingLogMissed] = useState(false);
  const [logMissedError,      setLogMissedError]      = useState('');
  const [logMissedSuccess,    setLogMissedSuccess]    = useState(false);

  const load = useCallback(async () => {
    setDataLoading(true);
    const res = await fetch('/api/tutor-portal/my-reports');
    if (res.ok) {
      const d = await res.json();
      setPendingApproval(d.pending_approval ?? []);
      setPending(d.pending         ?? []);
      setBacklog(d.backlog         ?? []);
      setFiledRecently(d.filed_recently ?? []);
      setPast(d.past               ?? []);
      setPastDue(d.past_due        ?? []);
    }
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (tutor) load();
  }, [tutor, load]);

  function openLogMissed() {
    setLogMissedOpen(true);
    setLogMissedError('');
    setLogMissedSuccess(false);
    setLogMissedForm({
      logged_student_name: '', scheduled_at: '', duration_minutes: '60',
      topics_covered: '', homework_assigned: '',
      engagement_rating: '4', tutor_attended: 'yes', private_tutor_notes: '',
    });
  }

  async function handleLogMissed() {
    setSubmittingLogMissed(true);
    setLogMissedError('');
    const res = await fetch('/api/tutor-portal/log-missed-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...logMissedForm,
        duration_minutes:  parseInt(logMissedForm.duration_minutes),
        engagement_rating: parseInt(logMissedForm.engagement_rating),
      }),
    });
    const d = await res.json();
    setSubmittingLogMissed(false);
    if (!res.ok) { setLogMissedError(d.error ?? 'Failed to submit'); return; }
    setLogMissedSuccess(true);
    setToast('Session submitted — awaiting admin approval.');
    setTimeout(() => setToast(''), 4000);
    load();
  }

  async function handleLateFilingRequest(sessionId: string) {
    if (!lateFilingReason.trim()) return;
    setSubmittingLateFiling(true);
    setLateFilingError('');
    const res = await fetch('/api/tutor-portal/late-filing-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, reason: lateFilingReason.trim() }),
    });
    const d = await res.json();
    setSubmittingLateFiling(false);
    if (!res.ok) { setLateFilingError(d.error ?? 'Failed to submit request'); return; }
    setLateFilingId(null);
    setLateFilingReason('');
    // Optimistically mark as requested
    setPastDue(prev => prev.map(s =>
      s.session_id === sessionId
        ? { ...s, late_filing_requested_at: d.requested_at }
        : s
    ));
  }

  async function handleEditRequest(reportId: string) {
    if (!editReason.trim()) return;
    setSubmittingEdit(true);
    setEditError('');
    const res = await fetch('/api/tutor-portal/report-edit-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_id: reportId, reason: editReason.trim() }),
    });
    const d = await res.json();
    setSubmittingEdit(false);
    if (!res.ok) { setEditError(d.error ?? 'Failed to submit request'); return; }
    setEditSuccess(reportId);
    setEditRequestId(null);
    setEditReason('');
    // Optimistically mark as requested in past list
    setPast(prev => prev.map(r =>
      r.report_id === reportId
        ? { ...r, edit_requested_at: new Date().toISOString() }
        : r
    ));
  }

  if (loading || dataLoading) {
    return (
      <TutorPortalLayout tutor={tutor}>
        <div className="flex items-center gap-2 text-gray-400 mt-10">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      </TutorPortalLayout>
    );
  }

  function urgencyColor(hoursLeft: number) {
    if (hoursLeft < 24) return 'bg-red-100 text-red-700 border-red-200';
    if (hoursLeft < 48) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-gray-50 text-gray-600 border-gray-200';
  }

  return (
    <TutorPortalLayout tutor={tutor}>
      <div className="max-w-3xl space-y-8">

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Reports</h1>
            <p className="text-gray-500 text-sm mt-1">File session reports within 72 hours. Submitted reports are editable for 60 minutes.</p>
          </div>
          <button
            onClick={openLogMissed}
            className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap"
          >
            <PlusCircle className="w-3.5 h-3.5" /> Log a Missed Session
          </button>
        </div>

        {/* ── Toast ───────────────────────────────────────────────── */}
        {toast && (
          <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 font-medium">
            {toast}
          </div>
        )}

        {/* ── AWAITING ADMIN APPROVAL ──────────────────────────────── */}
        {pendingApproval.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-violet-500" /> Awaiting Admin Approval ({pendingApproval.length})
            </h2>
            <div className="space-y-2">
              {pendingApproval.map(s => (
                <div key={s.session_id} className="card px-4 py-3 flex items-center justify-between border border-violet-200 bg-violet-50/40">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {format(new Date(s.scheduled_at), 'EEE, MMM d · h:mm a')}
                      <span className="ml-2 text-gray-500 font-normal">· {s.logged_student_name ?? '—'}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.duration_minutes} min session</p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 font-medium flex-shrink-0">
                    Pending admin approval
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── A: PENDING ──────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" /> Pending ({pending.length})
          </h2>

          {pending.length === 0 ? (
            <div className="card p-6 text-center text-gray-400 text-sm">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
              All caught up — no sessions awaiting reports.
            </div>
          ) : (
            <div className="space-y-2">
              {pending.map(s => (
                <div key={s.session_id} className={`card px-4 py-3 flex items-center justify-between border ${urgencyColor(s.hours_until_cutoff)}`}>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {format(new Date(s.scheduled_at), 'EEE, MMM d · h:mm a')}
                      <span className="ml-2 text-gray-500 font-normal">· {s.student_name}</span>
                    </p>
                    <p className="text-xs mt-0.5">
                      {s.hours_until_cutoff < 24
                        ? <span className="text-red-600 font-semibold"><AlertTriangle className="w-3 h-3 inline mr-0.5" />{s.hours_until_cutoff.toFixed(1)}hr left</span>
                        : <span className="text-amber-600">{s.hours_until_cutoff.toFixed(1)}hr until cutoff</span>
                      }
                    </p>
                  </div>
                  <Link
                    href={`/session-log/${s.session_id}`}
                    className="btn-primary text-xs px-3 py-1.5 flex-shrink-0"
                  >
                    <FileText className="w-3.5 h-3.5 inline mr-1" />File Report
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── C: BACKLOG (May 15+ sessions, file before Jun 1) ────── */}
        {backlog.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-blue-500" /> Backlog — File Before Jun 1 ({backlog.length})
            </h2>
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 mb-3 text-xs text-blue-700">
              These sessions are past the 72hr window but can still be filed without admin approval until June 1.
            </div>
            <div className="space-y-2">
              {backlog.map(s => (
                <div key={s.session_id} className="card px-4 py-3 flex items-center justify-between border border-blue-200 bg-blue-50/40">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {format(new Date(s.scheduled_at), 'EEE, MMM d · h:mm a')}
                      <span className="ml-2 text-gray-500 font-normal">· {s.student_name}</span>
                    </p>
                    <p className="text-xs text-blue-600 mt-0.5">{s.duration_minutes} min session</p>
                  </div>
                  <Link
                    href={`/session-log/${s.session_id}`}
                    className="btn-primary text-xs px-3 py-1.5 flex-shrink-0"
                  >
                    <FileText className="w-3.5 h-3.5 inline mr-1" />File Report
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── B: PAST DUE ─────────────────────────────────────────── */}
        {pastDue.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <CalendarX className="w-3.5 h-3.5 text-red-500" /> Past Due — No Report Filed ({pastDue.length})
            </h2>
            <div className="space-y-2">
              {pastDue.map(s => {
                const isApproved  = !!s.late_filing_approved_at;
                const isRequested = !!s.late_filing_requested_at && !isApproved;
                return (
                  <div key={s.session_id} className="card px-4 py-3 flex items-center justify-between border border-red-100">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {format(new Date(s.scheduled_at), 'EEE, MMM d · h:mm a')}
                        <span className="ml-2 text-gray-500 font-normal">· {s.student_name}</span>
                      </p>
                      <p className="text-xs mt-0.5">
                        {isApproved ? (
                          <span className="text-green-700 font-medium">Filing unlocked by admin</span>
                        ) : isRequested ? (
                          <span className="text-amber-600">Awaiting admin approval</span>
                        ) : (
                          <span className="text-red-500">Past 72hr filing window</span>
                        )}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      {isApproved ? (
                        <Link
                          href={`/session-log/${s.session_id}`}
                          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5" /> File Report
                        </Link>
                      ) : isRequested ? (
                        <span className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
                          Request pending
                        </span>
                      ) : (
                        <button
                          onClick={() => { setLateFilingId(s.session_id); setLateFilingError(''); setLateFilingReason(''); }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          Request Late Filing
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── D: FILED RECENTLY (auto-edit window) ────────────────── */}
        {filedRecently.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Edit2 className="w-3.5 h-3.5" /> Filed Recently — Editable ({filedRecently.length})
            </h2>
            <div className="space-y-2">
              {filedRecently.map(r => {
                const minsLeft = 60 - r.minutes_since_submit;
                return (
                  <div key={r.report_id} className="card px-4 py-3 flex items-center justify-between border border-green-200 bg-green-50">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {format(new Date(r.scheduled_at), 'EEE, MMM d · h:mm a')}
                        <span className="ml-2 text-gray-500 font-normal">· {r.student_name}</span>
                      </p>
                      <p className="text-xs text-green-700 mt-0.5">
                        {r.submitted_at ? <>Submitted {formatDistanceToNow(new Date(r.submitted_at), { addSuffix: true })} · </> : null}
                        <span className="font-medium">{Math.max(0, minsLeft)}min left to edit</span>
                      </p>
                    </div>
                    <Link
                      href={`/session-log/${r.session_id}?edit=true`}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1.5 flex-shrink-0"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Edit Report
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── E: PAST REPORTS ─────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <FileText className="w-3.5 h-3.5" /> Past Reports — Last 30 Days ({past.length})
          </h2>

          {past.length === 0 ? (
            <div className="card p-6 text-center text-gray-400 text-sm">No filed reports in the last 30 days.</div>
          ) : (
            <div className="space-y-2">
              {past.map(r => {
                const hasEditRequest = !!r.edit_requested_at && !r.is_admin_unlocked;
                const isUnlocked = r.is_admin_unlocked;
                const wasJustRequested = editSuccess === r.report_id;

                return (
                  <div key={r.report_id} className="card overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {format(new Date(r.scheduled_at), 'EEE, MMM d · h:mm a')}
                          <span className="ml-2 text-gray-500 font-normal">· {r.student_name}</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-sm">
                          {r.topics_preview ? `Topics: ${r.topics_preview}` : 'Report filed'}
                          {r.submitted_at ? <>{' · '}Filed {formatDistanceToNow(new Date(r.submitted_at), { addSuffix: true })}</> : null}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <button
                          onClick={() => setViewReport(viewReport?.report_id === r.report_id ? null : r)}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          View
                        </button>
                        {isUnlocked ? (
                          <Link
                            href={`/session-log/${r.session_id}?edit=true`}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1"
                          >
                            <Edit2 className="w-3 h-3" /> Edit (unlocked)
                          </Link>
                        ) : hasEditRequest || wasJustRequested ? (
                          <span className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
                            Edit requested
                          </span>
                        ) : (
                          <button
                            onClick={() => { setEditRequestId(r.report_id); setEditError(''); setEditReason(''); }}
                            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                          >
                            Request Edit
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>

      {/* ── Late Filing Request Modal ───────────────────────────────── */}
      {lateFilingId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">Request Late Filing</h3>
              <button onClick={() => setLateFilingId(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Explain why you were unable to file within 72 hours. An admin will review and unlock filing if approved.
            </p>
            <textarea
              value={lateFilingReason}
              onChange={e => setLateFilingReason(e.target.value)}
              placeholder="e.g. I was travelling and didn't have access, technical issues with the portal..."
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
            />
            {lateFilingError && <p className="text-xs text-red-500 mt-2">{lateFilingError}</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={() => setLateFilingId(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => handleLateFilingRequest(lateFilingId)}
                disabled={submittingLateFiling || !lateFilingReason.trim()}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {submittingLateFiling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {submittingLateFiling ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Request Modal ──────────────────────────────────────── */}
      {editRequestId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">Request Report Edit</h3>
              <button onClick={() => setEditRequestId(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Explain why you need to edit this report. An admin will review and unlock it within 1 hour if approved.
            </p>
            <textarea
              value={editReason}
              onChange={e => setEditReason(e.target.value)}
              placeholder="e.g. Wrong student name selected, need to correct homework items..."
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
            />
            {editError && <p className="text-xs text-red-500 mt-2">{editError}</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={() => setEditRequestId(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => handleEditRequest(editRequestId)}
                disabled={submittingEdit || !editReason.trim()}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {submittingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {submittingEdit ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Report Modal (read-only) ───────────────────────────── */}
      {viewReport && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {format(new Date(viewReport.scheduled_at), 'EEE, MMM d')} · {viewReport.student_name}
                </h3>
                <p className="text-xs text-gray-400">
                  {viewReport.submitted_at ? `Filed ${formatDistanceToNow(new Date(viewReport.submitted_at), { addSuffix: true })}` : 'Report filed'}
                </p>
              </div>
              <button onClick={() => setViewReport(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            {viewReport.topics_preview && (
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Topics</p>
                <p>{viewReport.topics_preview}{(viewReport.topics_preview?.length ?? 0) >= 80 ? '…' : ''}</p>
              </div>
            )}
            <p className="text-sm text-gray-400 mt-4 text-center">Full report details available after migration is applied.</p>
          </div>
        </div>
      )}
      {/* ── Log a Missed Session Modal ──────────────────────────────── */}
      {logMissedOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">Log a Missed Session</h3>
              <button onClick={() => setLogMissedOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {logMissedSuccess ? (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="text-base font-semibold text-gray-900">Submitted for admin approval</p>
                <p className="text-sm text-gray-500 mt-1">We'll notify you once the session is reviewed.</p>
                <button
                  onClick={() => setLogMissedOpen(false)}
                  className="btn-primary mt-5 px-6"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-5">
                  Use this form to log a session that was held but not yet in the system (May 15 – today). An admin will approve before it appears in payroll.
                </p>

                <div className="space-y-4">
                  {/* Student name (free text — admin will link the real student at approval) */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Student Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={logMissedForm.logged_student_name}
                      onChange={e => setLogMissedForm(f => ({ ...f, logged_student_name: e.target.value }))}
                      placeholder="e.g. Jane Smith"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">Admin will confirm the exact student match when approving.</p>
                  </div>

                  {/* Date & Time */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Session Date & Time <span className="text-red-500">*</span></label>
                    <input
                      type="datetime-local"
                      value={logMissedForm.scheduled_at}
                      min="2026-05-15T00:00"
                      max={new Date(Date.now() - 60_000).toISOString().slice(0, 16)}
                      onChange={e => setLogMissedForm(f => ({ ...f, scheduled_at: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    />
                  </div>

                  {/* Duration */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Duration (minutes) <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      min="1"
                      value={logMissedForm.duration_minutes}
                      onChange={e => setLogMissedForm(f => ({ ...f, duration_minutes: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    />
                  </div>

                  {/* Topics Covered */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Topics Covered <span className="text-red-500">*</span></label>
                    <textarea
                      value={logMissedForm.topics_covered}
                      onChange={e => setLogMissedForm(f => ({ ...f, topics_covered: e.target.value }))}
                      placeholder="Describe what was covered during the session (min 10 characters)…"
                      rows={3}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
                    />
                  </div>

                  {/* Homework Assigned */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Homework Assigned <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={logMissedForm.homework_assigned}
                      onChange={e => setLogMissedForm(f => ({ ...f, homework_assigned: e.target.value }))}
                      placeholder="e.g. Practice problems 1–10, read chapter 3…"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    />
                  </div>

                  {/* Engagement Rating */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Engagement Rating <span className="text-red-500">*</span></label>
                    <select
                      value={logMissedForm.engagement_rating}
                      onChange={e => setLogMissedForm(f => ({ ...f, engagement_rating: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    >
                      <option value="5">5 — Excellent</option>
                      <option value="4">4 — Good</option>
                      <option value="3">3 — Average</option>
                      <option value="2">2 — Below average</option>
                      <option value="1">1 — Poor</option>
                    </select>
                  </div>

                  {/* Tutor Attended */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Tutor Attendance <span className="text-red-500">*</span></label>
                    <select
                      value={logMissedForm.tutor_attended}
                      onChange={e => setLogMissedForm(f => ({ ...f, tutor_attended: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    >
                      <option value="yes">Yes — full session</option>
                      <option value="partial">Partial</option>
                      <option value="no_show">No show</option>
                    </select>
                  </div>

                  {/* Private Notes */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Private Notes (optional)</label>
                    <textarea
                      value={logMissedForm.private_tutor_notes}
                      onChange={e => setLogMissedForm(f => ({ ...f, private_tutor_notes: e.target.value }))}
                      placeholder="Visible to admins only…"
                      rows={2}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
                    />
                  </div>
                </div>

                {logMissedError && <p className="text-xs text-red-500 mt-3">{logMissedError}</p>}

                <div className="flex gap-3 mt-5">
                  <button onClick={() => setLogMissedOpen(false)} className="btn-secondary flex-1">Cancel</button>
                  <button
                    onClick={handleLogMissed}
                    disabled={submittingLogMissed}
                    className="btn-primary flex-1 flex items-center justify-center gap-2"
                  >
                    {submittingLogMissed ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {submittingLogMissed ? 'Submitting…' : 'Submit for Approval'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </TutorPortalLayout>
  );
}
