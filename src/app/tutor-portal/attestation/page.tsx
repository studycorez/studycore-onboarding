'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { Loader2, CheckCircle, XCircle, Ban, X } from 'lucide-react';

interface PendingSession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  student: { id: string; name: string } | null;
  attestation_state: string;
  age_hours: number;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

function AgeBadge({ hours }: { hours: number }) {
  if (hours <= 24) return null;
  const isUrgent = hours > 36;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      isUrgent
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-700'
    }`}>
      Pending {hours}h
    </span>
  );
}

// ── Duration picker options ──────────────────────────────────────────────────
function durationOptions(scheduled: number): number[] {
  const max = scheduled * 2;
  const options: number[] = [];
  for (let m = 15; m <= max; m += 15) {
    options.push(m);
  }
  if (!options.includes(scheduled)) {
    options.push(scheduled);
    options.sort((a, b) => a - b);
  }
  return options;
}

export default function AttestationPage() {
  const { tutor, loading: authLoading } = useTutorAuth();
  const [sessions, setSessions] = useState<PendingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [cardError, setCardError] = useState<Record<string, string>>({});

  // Attend modal state
  const [attendModal, setAttendModal] = useState<PendingSession | null>(null);
  const [attendMinutes, setAttendMinutes] = useState<number>(60);

  // Cancel modal state
  const [cancelModal, setCancelModal] = useState<PendingSession | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tutor-portal/attestation/pending');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && tutor) load();
  }, [authLoading, tutor, load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function markInProgress(id: string) {
    setActionInProgress(prev => new Set(prev).add(id));
  }
  function clearInProgress(id: string) {
    setActionInProgress(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }
  function removeSession(id: string) {
    setSessions(prev => prev.filter(s => s.id !== id));
  }

  // ── Attend action ──────────────────────────────────────────────────────────
  async function handleAttend(session: PendingSession, minutes: number) {
    setAttendModal(null);
    markInProgress(session.id);
    setCardError(prev => { const n = { ...prev }; delete n[session.id]; return n; });

    try {
      const res = await fetch(`/api/tutor-portal/attestation/${session.id}/attend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      removeSession(session.id);
      showToast(`${session.student?.name ?? 'Session'} confirmed — ${minutes} min`);
    } catch (err: any) {
      setCardError(prev => ({ ...prev, [session.id]: err.message }));
    } finally {
      clearInProgress(session.id);
    }
  }

  // ── Student no-show action ─────────────────────────────────────────────────
  async function handleNoShow(session: PendingSession) {
    markInProgress(session.id);
    setCardError(prev => { const n = { ...prev }; delete n[session.id]; return n; });

    try {
      const res = await fetch(`/api/tutor-portal/attestation/${session.id}/student-no-show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      removeSession(session.id);
      showToast(`${session.student?.name ?? 'Session'} marked as no-show`);
    } catch (err: any) {
      setCardError(prev => ({ ...prev, [session.id]: err.message }));
    } finally {
      clearInProgress(session.id);
    }
  }

  // ── Cancel action ──────────────────────────────────────────────────────────
  async function handleCancel(session: PendingSession, reason: string) {
    setCancelModal(null);
    setCancelReason('');
    markInProgress(session.id);
    setCardError(prev => { const n = { ...prev }; delete n[session.id]; return n; });

    try {
      const res = await fetch(`/api/tutor-portal/attestation/${session.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      removeSession(session.id);
      showToast(`${session.student?.name ?? 'Session'} marked as cancelled`);
    } catch (err: any) {
      setCardError(prev => ({ ...prev, [session.id]: err.message }));
    } finally {
      clearInProgress(session.id);
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
        <h1 className="text-xl font-bold text-gray-900 mb-1">Sessions to confirm</h1>
        <p className="text-sm text-gray-500 mb-6">
          Confirm attendance for each session. Unconfirmed sessions expire after 48 hours.
        </p>

        {/* Toast */}
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
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="text-center py-16">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              All caught up. Sessions appear here 1 hour after their scheduled end.
            </p>
          </div>
        )}

        {!loading && !error && sessions.length > 0 && (
          <div className="space-y-3">
            {sessions.map(s => {
              const busy = actionInProgress.has(s.id);
              return (
                <div
                  key={s.id}
                  className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 ${busy ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-base font-semibold text-gray-900">
                        {s.student?.name ?? 'Unknown Student'}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {formatDate(s.scheduled_at)}
                      </p>
                    </div>
                    <AgeBadge hours={s.age_hours} />
                  </div>

                  <p className="text-xs text-gray-400 mb-3">
                    {s.duration_minutes} min scheduled
                  </p>

                  {cardError[s.id] && (
                    <div className="mb-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
                      {cardError[s.id]}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => { setAttendMinutes(s.duration_minutes ?? 60); setAttendModal(s); }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Attended
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => handleNoShow(s)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      No-show
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => { setCancelReason(''); setCancelModal(s); }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Ban className="w-4 h-4" />
                      Cancelled
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Attend modal ─────────────────────────────────────────────────────── */}
      {attendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Confirm attendance</h2>
            <p className="text-sm text-gray-500 mb-4">
              {attendModal.student?.name} — {formatDate(attendModal.scheduled_at)}
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Session duration</label>
            <select
              value={attendMinutes}
              onChange={e => setAttendMinutes(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {durationOptions(attendModal.duration_minutes ?? 60).map(m => (
                <option key={m} value={m}>
                  {m} min{m === (attendModal.duration_minutes ?? 60) ? ' (scheduled)' : ''}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => handleAttend(attendModal, attendMinutes)}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setAttendModal(null)}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel modal ─────────────────────────────────────────────────────── */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Mark as cancelled</h2>
            <p className="text-sm text-gray-500 mb-4">
              {cancelModal.student?.name} — {formatDate(cancelModal.scheduled_at)}
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="e.g. Student rescheduled, family emergency..."
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleCancel(cancelModal, cancelReason)}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-800 text-white transition-colors"
              >
                Confirm cancellation
              </button>
              <button
                onClick={() => setCancelModal(null)}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}
    </TutorPortalLayout>
  );
}
