'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { formatDateTime } from '@/lib/utils';
import { CalendarClock, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface UpcomingSession {
  id: string;
  scheduled_at: string;
  status: string;
  student: { id: string; name: string } | null;
}

interface RescheduleRequest {
  id: string;
  session_id: string;
  original_time: string;
  requested_time: string;
  note: string | null;
  status: string;
  created_at: string;
  student: { id: string; name: string } | null;
}

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  denied:   'bg-red-100 text-red-600',
};

function toLocalDatetimeValue(isoStr: string): string {
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TutorReschedulePage() {
  const { tutor, loading: authLoading } = useTutorAuth();
  const supabase = createClient();

  const [sessions,  setSessions]  = useState<UpcomingSession[]>([]);
  const [requests,  setRequests]  = useState<RescheduleRequest[]>([]);
  const [loading,   setLoading]   = useState(true);

  // Modal state
  const [modalSession, setModalSession] = useState<UpcomingSession | null>(null);
  const [reason,       setReason]       = useState('');
  const [proposedAt,   setProposedAt]   = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState('');

  const load = useCallback(async () => {
    if (!tutor) return;
    setLoading(true);

    const [{ data: sessData }, reqRes] = await Promise.all([
      supabase
        .from('sessions')
        .select('id, scheduled_at, status, student:students(id, name)')
        .eq('tutor_id', tutor.id)
        .eq('status', 'scheduled')
        .gt('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(30),
      fetch('/api/tutor-portal/reschedule-requests'),
    ]);

    setSessions(((sessData ?? []) as unknown as UpcomingSession[]));

    if (reqRes.ok) {
      setRequests(await reqRes.json());
    }

    setLoading(false);
  }, [tutor, supabase]);

  useEffect(() => { if (!authLoading) load(); }, [authLoading, load]);

  function openModal(session: UpcomingSession) {
    setModalSession(session);
    setReason('');
    setProposedAt(toLocalDatetimeValue(session.scheduled_at));
    setSubmitError('');
  }

  function closeModal() {
    if (submitting) return;
    setModalSession(null);
  }

  async function submitRequest() {
    if (!modalSession) return;
    setSubmitting(true);
    setSubmitError('');

    const res = await fetch('/api/tutor-portal/reschedule-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: modalSession.id,
        reason,
        proposed_at: new Date(proposedAt).toISOString(),
      }),
    });

    if (res.ok) {
      setModalSession(null);
      await load();
    } else {
      const d = await res.json().catch(() => ({}));
      setSubmitError(d.error ?? 'Failed to submit request');
    }
    setSubmitting(false);
  }

  // Sessions that already have a pending request
  const pendingSessionIds = new Set(
    requests.filter(r => r.status === 'pending').map(r => r.session_id),
  );

  if (authLoading) return null;

  return (
    <TutorPortalLayout tutor={tutor}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reschedule Requests</h1>
        <p className="text-gray-500 text-sm mt-1">
          Request to reschedule an upcoming session. An admin will review and confirm.
        </p>
      </div>

      {/* Pending / recent requests */}
      {requests.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            My Requests
          </h2>
          <div className="card divide-y divide-gray-100">
            {requests.map(rr => (
              <div key={rr.id} className="flex items-start gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-gray-900">
                      {rr.student?.name ?? 'Unknown student'}
                    </span>
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full font-medium',
                      STATUS_STYLES[rr.status] ?? 'bg-gray-100 text-gray-600',
                    )}>
                      {rr.status.charAt(0).toUpperCase() + rr.status.slice(1)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    <span className="line-through">{formatDateTime(rr.original_time)}</span>
                    {' → '}
                    <span className="font-medium text-gray-700">{formatDateTime(rr.requested_time)}</span>
                  </p>
                  {rr.note && (
                    <p className="text-xs text-gray-400 mt-0.5 italic">"{rr.note}"</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {new Date(rr.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming sessions */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Upcoming Sessions
        </h2>

        {loading ? (
          <div className="card p-6 flex items-center justify-center text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : sessions.length === 0 ? (
          <div className="card p-8 text-center text-gray-400 text-sm">
            No upcoming scheduled sessions.
          </div>
        ) : (
          <div className="card divide-y divide-gray-100">
            {sessions.map(s => {
              const hasPending = pendingSessionIds.has(s.id);
              return (
                <div key={s.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {(s.student as any)?.name ?? 'Unknown student'}
                    </p>
                    <p className="text-xs text-gray-500">{formatDateTime(s.scheduled_at)}</p>
                  </div>
                  {hasPending ? (
                    <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded-lg">
                      Request pending
                    </span>
                  ) : (
                    <button
                      onClick={() => openModal(s)}
                      className="btn-secondary text-sm flex items-center gap-1.5"
                    >
                      <CalendarClock className="w-3.5 h-3.5" />
                      Request Reschedule
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal */}
      {modalSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Request Reschedule</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {(modalSession.student as any)?.name} — {formatDateTime(modalSession.scheduled_at)}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Proposed New Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  className="input w-full"
                  value={proposedAt}
                  onChange={e => setProposedAt(e.target.value)}
                  min={toLocalDatetimeValue(new Date().toISOString())}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  className="input w-full resize-none"
                  rows={3}
                  placeholder="e.g. Conflict with another commitment"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                />
              </div>

              {submitError && (
                <p className="text-sm text-red-500">{submitError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={submitRequest}
                  disabled={submitting || !proposedAt}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? 'Submitting…' : 'Submit Request'}
                </button>
                <button onClick={closeModal} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </TutorPortalLayout>
  );
}
