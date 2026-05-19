'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle, Clock, CheckCircle, FileText, Edit2, Send,
  ChevronDown, ChevronUp, Loader2, X,
} from 'lucide-react';
import Link from 'next/link';

interface PendingSession {
  session_id: string;
  scheduled_at: string;
  duration_minutes: number;
  student_name: string;
  hours_until_cutoff: number;
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
  const [pending,       setPending]       = useState<PendingSession[]>([]);
  const [filedRecently, setFiledRecently] = useState<FiledReport[]>([]);
  const [past,          setPast]          = useState<FiledReport[]>([]);
  const [dataLoading,   setDataLoading]   = useState(true);

  // Edit request modal
  const [editRequestId,   setEditRequestId]   = useState<string | null>(null);
  const [editReason,      setEditReason]      = useState('');
  const [submittingEdit,  setSubmittingEdit]  = useState(false);
  const [editError,       setEditError]       = useState('');
  const [editSuccess,     setEditSuccess]     = useState<string | null>(null); // report_id

  // Expanded past row (view modal)
  const [viewReport, setViewReport] = useState<FiledReport | null>(null);

  const load = useCallback(async () => {
    setDataLoading(true);
    const res = await fetch('/api/tutor-portal/my-reports');
    if (res.ok) {
      const d = await res.json();
      setPending(d.pending       ?? []);
      setFiledRecently(d.filed_recently ?? []);
      setPast(d.past             ?? []);
    }
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (tutor) load();
  }, [tutor, load]);

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

        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Reports</h1>
          <p className="text-gray-500 text-sm mt-1">File session reports within 72 hours. Submitted reports are editable for 60 minutes.</p>
        </div>

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

        {/* ── B: FILED RECENTLY (auto-edit window) ────────────────── */}
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
                        Submitted {formatDistanceToNow(new Date(r.submitted_at), { addSuffix: true })} ·{' '}
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

        {/* ── C: PAST REPORTS ─────────────────────────────────────── */}
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
                          {' · '}Filed {formatDistanceToNow(new Date(r.submitted_at), { addSuffix: true })}
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
                  Filed {formatDistanceToNow(new Date(viewReport.submitted_at), { addSuffix: true })}
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
    </TutorPortalLayout>
  );
}
