'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Loader2, CheckCircle, XCircle, Clock, X } from 'lucide-react';

export const dynamic = 'force-dynamic';

type ProposalStatus = 'pending' | 'approved' | 'rejected';

interface Proposal {
  id: string;
  tutor_id: string;
  tutor_name: string;
  tutor_timezone: string;
  student_id: string;
  student_name: string;
  scheduled_at: string;
  duration_minutes: number;
  what_covered: string | null;
  tutor_notes: string | null;
  status: ProposalStatus;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  created_session_id: string | null;
}

type TabFilter = 'pending' | 'approved' | 'rejected' | 'all';

function formatDate(iso: string, tz?: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(tz ? { timeZone: tz } : {}),
  }).format(new Date(iso));
}

function tzAbbr(tz: string): string {
  return ({ 'America/New_York': 'ET', 'America/Chicago': 'CT', 'America/Denver': 'MT', 'America/Los_Angeles': 'PT' } as Record<string, string>)[tz] ?? tz;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'pending':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700"><Clock className="w-3 h-3" />Pending</span>;
    case 'approved':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700"><CheckCircle className="w-3 h-3" />Approved</span>;
    case 'rejected':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700"><XCircle className="w-3 h-3" />Rejected</span>;
    default:
      return null;
  }
}

export default function SessionProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>('pending');
  const [toast, setToast] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<Set<string>>(new Set());

  // Reject modal
  const [rejectModal, setRejectModal] = useState<Proposal | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Per-card errors
  const [cardError, setCardError] = useState<Record<string, string>>({});

  const load = useCallback(async (status: TabFilter) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/session-proposals?status=${status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProposals(data.proposals ?? []);
    } catch {
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  async function handleApprove(proposal: Proposal) {
    setActionInProgress(prev => new Set(prev).add(proposal.id));
    setCardError(prev => { const n = { ...prev }; delete n[proposal.id]; return n; });

    try {
      const res = await fetch(`/api/admin/session-proposals/${proposal.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      setProposals(prev => prev.filter(p => p.id !== proposal.id));
      showToast(`Approved: ${proposal.tutor_name} → ${proposal.student_name}`);
    } catch (err: any) {
      setCardError(prev => ({ ...prev, [proposal.id]: err.message }));
    } finally {
      setActionInProgress(prev => { const n = new Set(prev); n.delete(proposal.id); return n; });
    }
  }

  async function handleReject(proposal: Proposal, reason: string) {
    setRejectModal(null);
    setRejectReason('');
    setRejectError(null);
    setActionInProgress(prev => new Set(prev).add(proposal.id));
    setCardError(prev => { const n = { ...prev }; delete n[proposal.id]; return n; });

    try {
      const res = await fetch(`/api/admin/session-proposals/${proposal.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: reason }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      setProposals(prev => prev.filter(p => p.id !== proposal.id));
      showToast(`Rejected: ${proposal.tutor_name} → ${proposal.student_name}`);
    } catch (err: any) {
      setCardError(prev => ({ ...prev, [proposal.id]: err.message }));
    } finally {
      setActionInProgress(prev => { const n = new Set(prev); n.delete(proposal.id); return n; });
    }
  }

  const tabBtn = (value: TabFilter, label: string) => (
    <button
      onClick={() => setTab(value)}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        tab === value
          ? 'bg-navy-700 text-white'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );

  const emptyMessages: Record<TabFilter, string> = {
    pending: 'No pending proposals to review.',
    approved: 'No approved proposals yet.',
    rejected: 'No rejected proposals yet.',
    all: 'No proposals submitted yet.',
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Backlog Session Proposals</h1>
        <p className="text-sm text-gray-500 mt-1">Tutor-submitted past sessions awaiting review</p>
      </div>

      <div className="flex gap-1 mb-6">
        {tabBtn('pending', 'Pending')}
        {tabBtn('approved', 'Approved')}
        {tabBtn('rejected', 'Rejected')}
        {tabBtn('all', 'All')}
      </div>

      {toast && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 flex items-center justify-between">
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-green-400 hover:text-green-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-gray-400 mt-10">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading proposals...
        </div>
      )}

      {!loading && proposals.length === 0 && (
        <div className="text-center py-16">
          <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{emptyMessages[tab]}</p>
        </div>
      )}

      {!loading && proposals.length > 0 && (
        <div className="space-y-3">
          {proposals.map(p => {
            const busy = actionInProgress.has(p.id);
            return (
              <div key={p.id} className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 ${busy ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-base font-semibold text-gray-900">
                      {p.tutor_name} <span className="text-gray-400 font-normal">→</span> {p.student_name}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">{formatDate(p.scheduled_at, p.tutor_timezone)} <span className="text-gray-400">({tzAbbr(p.tutor_timezone)})</span> · {p.duration_minutes} min</p>
                  </div>
                  {tab !== 'pending' && <StatusBadge status={p.status} />}
                </div>

                {p.what_covered && (
                  <p className="text-sm text-gray-700 mb-2">{p.what_covered}</p>
                )}

                {p.tutor_notes && (
                  <p className="text-sm text-gray-500 italic mb-2">{p.tutor_notes}</p>
                )}

                <p className="text-xs text-gray-400 mb-3">
                  Submitted {relativeTime(p.created_at)} by tutor
                </p>

                {p.status === 'approved' && p.reviewed_at && (
                  <p className="text-xs text-green-600 mb-2">
                    Approved on {formatDate(p.reviewed_at, p.tutor_timezone)}
                    {p.created_session_id && (
                      <> · <a href={`/sessions?search=${p.created_session_id}`} className="underline hover:text-green-700">View session</a></>
                    )}
                  </p>
                )}

                {p.status === 'rejected' && (
                  <p className="text-xs text-red-500 mb-2">
                    Rejected{p.reviewed_at ? ` on ${formatDate(p.reviewed_at, p.tutor_timezone)}` : ''}
                    {p.admin_notes ? `: ${p.admin_notes}` : ''}
                  </p>
                )}

                {cardError[p.id] && (
                  <div className="mb-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
                    {cardError[p.id]}
                  </div>
                )}

                {p.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => handleApprove(p)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-green-500 hover:bg-green-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Approve
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => { setRejectReason(''); setRejectError(null); setRejectModal(p); }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-red-50 hover:bg-red-100 text-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Reject modal ─────────────────────────────────────────────────────── */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Reject proposal</h2>
            <p className="text-sm text-gray-500 mb-4">
              {rejectModal.tutor_name} → {rejectModal.student_name} · {formatDate(rejectModal.scheduled_at, rejectModal.tutor_timezone)}
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rejection reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              placeholder="Why is this being rejected? The tutor will see this."
            />
            {rejectError && (
              <p className="text-xs text-red-500 mb-3">{rejectError}</p>
            )}
            <div className="flex gap-2">
              <button
                disabled={rejectReason.trim().length < 3}
                onClick={() => handleReject(rejectModal, rejectReason)}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reject
              </button>
              <button
                onClick={() => setRejectModal(null)}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
