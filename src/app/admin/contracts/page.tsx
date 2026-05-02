'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { StatusBadge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';
import type { Contract } from '@/types';
import { formatDateTime } from '@/lib/utils';
import {
  AlertTriangle, Check, Download, Loader2, RefreshCw, Send, Slash, Trash2, X,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface ContractViolation {
  id: string;
  contract_id: string;
  violation_type: string;
  reason: string;
  violation_date: string;
  session_id: string | null;
  created_at: string;
  session?: { scheduled_at: string; duration_minutes: number } | null;
}

interface RecentSession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
}

const VIOLATION_TYPES = [
  'Missed Session',
  'Late Cancellation',
  'No Show',
  'Unprofessional Conduct',
  'Other',
] as const;

const TYPE_COLORS: Record<string, string> = {
  'Missed Session':        'bg-red-100 text-red-700',
  'Late Cancellation':     'bg-amber-100 text-amber-700',
  'No Show':               'bg-orange-100 text-orange-700',
  'Unprofessional Conduct':'bg-purple-100 text-purple-700',
  'Other':                 'bg-gray-100 text-gray-600',
};

function conseqText(n: number): string {
  if (n === 1) return 'A warning email will be sent to the tutor.';
  if (n === 2) return 'A final warning email will be sent to the tutor.';
  return 'A termination notice will be sent to the tutor. The contract will be voided.';
}
function conseqColor(n: number): string {
  if (n <= 1) return 'text-amber-700 bg-amber-50 border-amber-200';
  if (n === 2) return 'text-orange-700 bg-orange-50 border-orange-200';
  return 'text-red-700 bg-red-50 border-red-200';
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function AdminContractsPage() {
  const supabase = createClient();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading]     = useState(true);
  const [acting, setActing]       = useState<string | null>(null);
  const [toast, setToast]         = useState('');

  // ── Add Violation modal state ──────────────────────────────────────────
  const [vOpen, setVOpen]         = useState(false);
  const [vContract, setVContract] = useState<Contract | null>(null);
  const [vType, setVType]         = useState<string>(VIOLATION_TYPES[0]);
  const [vDate, setVDate]         = useState('');
  const [vReason, setVReason]     = useState('');
  const [vSessionId, setVSessionId] = useState('');
  const [vSessions, setVSessions] = useState<RecentSession[]>([]);
  const [vSubmitting, setVSubmitting] = useState(false);
  const [vError, setVError]       = useState('');

  // ── View Violations modal state ────────────────────────────────────────
  const [listOpen, setListOpen]       = useState(false);
  const [listContract, setListContract] = useState<Contract | null>(null);
  const [violations, setViolations]   = useState<ContractViolation[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);

  // ── Regen PDF state ────────────────────────────────────────────────────
  const [regenToast, setRegenToast] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('contracts')
      .select('*, tutor:tutors(name, email, hourly_rate), student:students(name)')
      .order('created_at', { ascending: false });
    setContracts((data as Contract[]) ?? []);
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // ── Generic action helper ──────────────────────────────────────────────
  async function action(contractId: string, endpoint: string) {
    setActing(contractId);
    await fetch(`/api/contracts/${contractId}/${endpoint}`, { method: 'POST' });
    await load();
    setActing(null);
  }

  async function handleVoid(contractId: string) {
    if (!window.confirm('Void this contract? The tutor will no longer be able to sign it.')) return;
    await action(contractId, 'void');
  }

  async function handleRemind(contractId: string) {
    setActing(contractId);
    const res  = await fetch(`/api/contracts/${contractId}/remind`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      setToast(data.error ?? 'Remind failed');
    } else {
      // Optimistically update last_emailed_at in local state
      if (data.lastEmailedAt) {
        setContracts(prev => prev.map(c =>
          c.id === contractId ? { ...c, last_emailed_at: data.lastEmailedAt } : c
        ));
      }
      setToast('Reminder sent');
    }
    setTimeout(() => setToast(''), 4000);
    setActing(null);
  }

  async function handleRegenPdf(contractId: string) {
    setActing(contractId);
    const res  = await fetch(`/api/contracts/${contractId}/regenerate-pdf`, { method: 'POST' });
    const data = await res.json();
    setActing(null);
    if (res.ok) {
      await load();
      setRegenToast('PDF regenerated successfully');
      setTimeout(() => setRegenToast(''), 4000);
    } else {
      setRegenToast(data.error ?? 'PDF regeneration failed');
      setTimeout(() => setRegenToast(''), 4000);
    }
  }

  // ── Open Add Violation modal ───────────────────────────────────────────
  async function openViolationModal(c: Contract) {
    setVContract(c);
    setVType(VIOLATION_TYPES[0]);
    setVDate(new Date().toISOString().slice(0, 10));
    setVReason('');
    setVSessionId('');
    setVError('');
    setVOpen(true);

    // Load recent sessions for this tutor-student pair
    const { data } = await supabase
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, status')
      .eq('tutor_id', c.tutor_id)
      .eq('student_id', c.student_id)
      .order('scheduled_at', { ascending: false })
      .limit(20);
    setVSessions((data ?? []) as RecentSession[]);
  }

  async function submitViolation() {
    if (!vContract) return;
    if (vReason.trim().length < 20) {
      setVError('Reason must be at least 20 characters.');
      return;
    }
    setVSubmitting(true);
    setVError('');
    try {
      const res = await fetch(`/api/contracts/${vContract.id}/violation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          violation_type: vType,
          reason:         vReason.trim(),
          violation_date: vDate,
          session_id:     vSessionId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setVError(data.error ?? 'Failed to record violation'); return; }
      setVOpen(false);
      await load();
      setToast(`Violation #${data.violationCount} recorded. Warning email sent to ${data.tutorName}.`);
      setTimeout(() => setToast(''), 5000);
    } finally {
      setVSubmitting(false);
    }
  }

  // ── Open Violations list modal ─────────────────────────────────────────
  async function openViolationsList(c: Contract) {
    setListContract(c);
    setListOpen(true);
    setListLoading(true);
    const res  = await fetch(`/api/contracts/${c.id}/violations`);
    const data = await res.json();
    setViolations(Array.isArray(data) ? data : []);
    setListLoading(false);
  }

  async function deleteViolation(v: ContractViolation, idx: number) {
    if (!listContract) return;
    if (!window.confirm('Delete this violation? This cannot be undone.')) return;
    setDeletingId(v.id);
    await fetch(`/api/contracts/${listContract.id}/violations/${v.id}`, { method: 'DELETE' });
    // Refresh the list and the contracts table
    const [listRes] = await Promise.all([
      fetch(`/api/contracts/${listContract.id}/violations`),
      load(),
    ]);
    const listData = await listRes.json();
    setViolations(Array.isArray(listData) ? listData : []);
    // Also update listContract's violation count so the modal reflects current state
    setListContract(prev => prev
      ? { ...prev, violation_count: Math.max(0, (prev.violation_count ?? 1) - 1) }
      : prev
    );
    setDeletingId(null);
    setToast(`Violation #${idx + 1} deleted.`);
  }

  // ── Derived ───────────────────────────────────────────────────────────
  const nextViolationNumber = (vContract?.violation_count ?? 0) + 1;

  return (
    <AdminLayout>
      {/* Toast */}
      {(toast || regenToast) && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1e2090] text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <Check className="w-4 h-4 flex-shrink-0" />
          {toast || regenToast}
        </div>
      )}

      {/* ══ Add Violation Modal ══════════════════════════════════════════════ */}
      {vOpen && vContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Add Violation</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {(vContract.tutor as any)?.name} / {(vContract.student as any)?.name}
                </p>
              </div>
              <button onClick={() => setVOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Violation type */}
              <div>
                <label className="label">Violation Type</label>
                <select
                  value={vType}
                  onChange={e => setVType(e.target.value)}
                  className="input"
                >
                  {VIOLATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  value={vDate}
                  onChange={e => setVDate(e.target.value)}
                  className="input"
                />
              </div>

              {/* Session selector */}
              <div>
                <label className="label">
                  Linked Session <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <select
                  value={vSessionId}
                  onChange={e => setVSessionId(e.target.value)}
                  className="input"
                >
                  <option value="">— None —</option>
                  {vSessions.map(s => (
                    <option key={s.id} value={s.id}>
                      {fmtDateTime(s.scheduled_at)} · {s.duration_minutes} min · {s.status}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reason */}
              <div>
                <label className="label">Reason <span className="text-red-500">*</span></label>
                <textarea
                  value={vReason}
                  onChange={e => setVReason(e.target.value)}
                  placeholder="Describe what happened..."
                  rows={4}
                  className="input resize-none"
                />
                <p className={`text-xs mt-1 text-right ${vReason.trim().length < 20 ? 'text-gray-400' : 'text-green-600'}`}>
                  {vReason.trim().length}/20 min chars
                </p>
              </div>

              {/* Consequences preview */}
              <div className={`rounded-lg border px-4 py-3 text-sm ${conseqColor(nextViolationNumber)}`}>
                <span className="font-semibold">This will be violation #{nextViolationNumber}. </span>
                {conseqText(nextViolationNumber)}
              </div>

              {vError && (
                <p className="text-sm text-red-500">{vError}</p>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setVOpen(false)}
                className="btn-secondary flex-1 justify-center"
              >
                Cancel
              </button>
              <button
                onClick={submitViolation}
                disabled={vSubmitting || vReason.trim().length < 20}
                className="flex-1 justify-center inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {vSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                {vSubmitting ? 'Recording…' : 'Add Violation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ View Violations Modal ════════════════════════════════════════════ */}
      {listOpen && listContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Violations</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {(listContract.tutor as any)?.name} / {(listContract.student as any)?.name}
                  {' · '}{listContract.violation_count} total
                </p>
              </div>
              <button onClick={() => setListOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
              {listLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : violations.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No violations recorded</p>
              ) : (
                <div className="space-y-3">
                  {violations.map((v, i) => (
                    <div key={v.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-bold text-gray-500">#{i + 1}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[v.violation_type] ?? 'bg-gray-100 text-gray-600'}`}>
                            {v.violation_type}
                          </span>
                          <span className="text-xs text-gray-400">{fmtDate(v.violation_date)}</span>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{v.reason}</p>
                        {v.session && (
                          <p className="text-xs text-gray-400 mt-1">
                            Linked session: {fmtDateTime(v.session.scheduled_at)} · {v.session.duration_minutes} min
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">Added {fmtDateTime(v.created_at)}</p>
                      </div>
                      <button
                        onClick={() => deleteViolation(v, i)}
                        disabled={deletingId === v.id}
                        title="Delete this violation"
                        className="flex-shrink-0 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                      >
                        {deletingId === v.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 pb-6 pt-2 flex justify-end">
              <button onClick={() => setListOpen(false)} className="btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Page content ════════════════════════════════════════════════════ */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contracts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage tutor commitment contracts. Create new contracts from a tutor&apos;s profile page.
          </p>
        </div>
        <span className="text-xs text-gray-400 mt-1">{contracts.length} total</span>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">Loading…</div>
        ) : contracts.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">
            No contracts yet. Go to a tutor&apos;s profile to send one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header">Tutor</th>
                  <th className="table-header">Student</th>
                  <th className="table-header">Rate</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Signed</th>
                  <th className="table-header">Violations</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {contracts.map(c => {
                  const tutor   = (c.tutor   as any);
                  const student = (c.student as any);
                  const busy    = acting === c.id;
                  const isVoided = c.status === 'voided';
                  const isSigned = c.status === 'signed';

                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="table-cell">
                        <div className="font-medium text-gray-900">{tutor?.name ?? '—'}</div>
                        <div className="text-xs text-gray-400">{tutor?.email ?? ''}</div>
                      </td>
                      <td className="table-cell text-gray-700">{student?.name ?? '—'}</td>
                      <td className="table-cell text-gray-700">
                        ${(c.hourly_rate || tutor?.hourly_rate || 0)}/hr
                        {!c.hourly_rate && tutor?.hourly_rate ? (
                          <span className="ml-1 text-xs text-amber-500" title="Rate pulled from tutor profile — contract rate was $0">*</span>
                        ) : null}
                      </td>
                      <td className="table-cell"><StatusBadge status={c.status} /></td>
                      <td className="table-cell text-gray-500 text-sm">
                        {c.signed_at ? formatDateTime(c.signed_at) : '—'}
                      </td>

                      {/* Violations count — clickable to open list */}
                      <td className="table-cell">
                        <button
                          onClick={() => openViolationsList(c)}
                          className={`font-semibold text-sm underline-offset-2 hover:underline transition-colors ${
                            c.violation_count >= 3 ? 'text-red-600' :
                            c.violation_count > 0  ? 'text-amber-600' :
                            'text-gray-400 hover:text-gray-600'
                          }`}
                          title="View violations"
                        >
                          {c.violation_count}
                        </button>
                      </td>

                      <td className="table-cell">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Download PDF */}
                          {isSigned && (c as any).pdf_url && (
                            <a
                              href={(c as any).pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                            >
                              <Download className="w-3 h-3" /> PDF
                            </a>
                          )}

                          {/* Regenerate PDF */}
                          {isSigned && (
                            <button
                              onClick={() => handleRegenPdf(c.id)}
                              disabled={busy}
                              title={(c as any).pdf_url ? 'Regenerate signed PDF' : 'Generate signed PDF'}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:border-[#1e2090] hover:text-[#1e2090] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} />
                              {(c as any).pdf_url ? 'Regen PDF' : 'Gen PDF'}
                            </button>
                          )}

                          {/* Remind */}
                          <div className="flex flex-col items-start gap-0.5">
                            <button
                              onClick={() => handleRemind(c.id)}
                              disabled={busy || isSigned || isVoided}
                              title="Resend contract email"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:border-navy-300 hover:text-navy-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                              Remind
                            </button>
                            {c.last_emailed_at && (
                              <span className="text-[10px] text-gray-400 pl-0.5" title={fmtDateTime(c.last_emailed_at)}>
                                Last: {fmtDateTime(c.last_emailed_at)}
                              </span>
                            )}
                          </div>

                          {/* Log Violation — now opens modal */}
                          <button
                            onClick={() => openViolationModal(c)}
                            disabled={busy || isVoided}
                            title="Log a violation"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <AlertTriangle className="w-3 h-3" /> Violation
                          </button>

                          {/* Void */}
                          <button
                            onClick={() => handleVoid(c.id)}
                            disabled={busy || isVoided}
                            title="Void this contract"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <Slash className="w-3 h-3" /> Void
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
