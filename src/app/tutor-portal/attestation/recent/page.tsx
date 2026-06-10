'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { Loader2, CheckCircle, XCircle, UserX, Ban, X } from 'lucide-react';

interface RecentSession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  student: { id: string; name: string } | null;
  attestation_state: string;
  attested_minutes: number;
  attested_at: string;
  attestation_lock_at: string;
  tutor_no_show_reason: string | null;
  minutes_until_lock: number;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d);
}

function StateBadge({ state, minutes }: { state: string; minutes: number }) {
  switch (state) {
    case 'attended':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Attended {minutes} min</span>;
    case 'student_no_show':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Student no-show</span>;
    case 'tutor_no_show':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Tutor no-show</span>;
    case 'cancelled':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">Cancelled</span>;
    default:
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">{state}</span>;
  }
}

function LockBadge({ minutes }: { minutes: number }) {
  const isUrgent = minutes < 10;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      isUrgent ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {minutes} min left to amend
    </span>
  );
}

function durationOptions(scheduled: number): number[] {
  const max = scheduled * 2;
  const options: number[] = [];
  for (let m = 15; m <= max; m += 15) options.push(m);
  if (!options.includes(scheduled)) { options.push(scheduled); options.sort((a, b) => a - b); }
  return options;
}

export default function RecentAttestationsPage() {
  const { tutor, loading: authLoading } = useTutorAuth();
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<Set<string>>(new Set());

  // Amend modal
  const [amendModal, setAmendModal] = useState<RecentSession | null>(null);
  const [amendAction, setAmendAction] = useState<string>('attended');
  const [amendMinutes, setAmendMinutes] = useState<number>(60);
  const [amendReason, setAmendReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/tutor-portal/attestation/recent');
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? `HTTP ${res.status}`); }
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!authLoading && tutor) load();
  }, [authLoading, tutor, load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function openAmendModal(s: RecentSession) {
    setAmendAction(s.attestation_state);
    setAmendMinutes(s.attested_minutes || s.duration_minutes || 60);
    setAmendReason(s.tutor_no_show_reason ?? '');
    setAmendModal(s);
  }

  function isAmendValid(): boolean {
    if (amendAction === 'tutor_no_show' && amendReason.trim().length < 3) return false;
    return true;
  }

  async function handleAmend() {
    if (!amendModal) return;
    const session = amendModal;
    setAmendModal(null);
    setActionInProgress(prev => new Set(prev).add(session.id));

    try {
      const body: any = { action: amendAction };
      if (amendAction === 'attended') body.minutes = amendMinutes;
      if (amendAction === 'tutor_no_show') body.reason = amendReason;

      const res = await fetch(`/api/tutor-portal/attestation/${session.id}/amend`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        if (res.status === 409) {
          showToast(b.error ?? 'Amendment window expired');
          load();
          return;
        }
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }

      const result = await res.json();

      // Update the session in the list with new state
      setSessions(prev => prev.map(s => {
        if (s.id !== session.id) return s;
        return {
          ...s,
          attestation_state: result.attestation_state,
          attested_minutes: result.attested_minutes,
          tutor_no_show_reason: amendAction === 'tutor_no_show' ? amendReason : null,
        };
      }));

      const labels: Record<string, string> = {
        attended: 'attended', student_no_show: 'student no-show',
        tutor_no_show: 'tutor no-show', cancelled: 'cancelled',
      };
      showToast(`Amended to ${labels[amendAction] ?? amendAction}`);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setActionInProgress(prev => { const n = new Set(prev); n.delete(session.id); return n; });
    }
  }

  if (authLoading) {
    return (
      <TutorPortalLayout tutor={tutor}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </TutorPortalLayout>
    );
  }

  return (
    <TutorPortalLayout tutor={tutor}>
      <div className="max-w-[600px] mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Recent attestations</h1>
        <p className="text-sm text-gray-500 mb-6">
          You can amend confirmations within 60 minutes. After that, ask an admin.
        </p>

        {toast && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 flex items-center justify-between">
            <span>{toast}</span>
            <button onClick={() => setToast(null)} className="ml-2 text-green-400 hover:text-green-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
            <span className="text-gray-400 text-sm">Loading...</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">{error}</div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="text-center py-16">
            <CheckCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              No recent attestations to amend. Once you confirm a session, you can change it here within 60 minutes.
            </p>
          </div>
        )}

        {!loading && !error && sessions.length > 0 && (
          <div className="space-y-3">
            {sessions.map(s => {
              const busy = actionInProgress.has(s.id);
              return (
                <div key={s.id} className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 ${busy ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-base font-semibold text-gray-900">
                        {s.student?.name ?? 'Unknown Student'}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">{formatDate(s.scheduled_at)}</p>
                    </div>
                    <LockBadge minutes={s.minutes_until_lock} />
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <StateBadge state={s.attestation_state} minutes={s.attested_minutes} />
                  </div>

                  {s.tutor_no_show_reason && (
                    <p className="text-xs text-gray-500 mb-2">
                      Reason: {s.tutor_no_show_reason}
                    </p>
                  )}

                  <button
                    disabled={busy}
                    onClick={() => openAmendModal(s)}
                    className="text-sm text-blue-600 hover:text-blue-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Change
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Amend modal ──────────────────────────────────────────────────────── */}
      {amendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Amend attestation</h2>
            <p className="text-sm text-gray-500 mb-4">
              {amendModal.student?.name} — {formatDate(amendModal.scheduled_at)}
            </p>

            <div className="space-y-2 mb-4">
              {(['attended', 'student_no_show', 'tutor_no_show', 'cancelled'] as const).map(opt => {
                const labels: Record<string, { icon: any; label: string }> = {
                  attended:         { icon: CheckCircle, label: 'Attended' },
                  student_no_show:  { icon: XCircle,     label: 'Student no-show' },
                  tutor_no_show:    { icon: UserX,       label: 'Tutor no-show' },
                  cancelled:        { icon: Ban,         label: 'Cancelled' },
                };
                const { icon: Icon, label } = labels[opt];
                const selected = amendAction === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => setAmendAction(opt)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                      selected
                        ? 'bg-blue-50 text-blue-700 ring-2 ring-blue-500'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {label}
                  </button>
                );
              })}
            </div>

            {amendAction === 'attended' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                <select value={amendMinutes} onChange={e => setAmendMinutes(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {durationOptions(amendModal.duration_minutes ?? 60).map(m => (
                    <option key={m} value={m}>{m} min{m === (amendModal.duration_minutes ?? 60) ? ' (scheduled)' : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {amendAction === 'tutor_no_show' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea value={amendReason} onChange={e => setAmendReason(e.target.value)} rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="e.g. Got stuck in traffic, was sick..." />
              </div>
            )}

            <div className="flex gap-2">
              <button
                disabled={!isAmendValid()}
                onClick={handleAmend}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm
              </button>
              <button
                onClick={() => setAmendModal(null)}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </TutorPortalLayout>
  );
}
