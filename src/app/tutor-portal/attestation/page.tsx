'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { Loader2, CheckCircle, XCircle, Ban } from 'lucide-react';

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

export default function AttestationPage() {
  const { tutor, loading: authLoading } = useTutorAuth();
  const [sessions, setSessions] = useState<PendingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            {sessions.map(s => (
              <div
                key={s.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-4"
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

                <div className="flex gap-2">
                  <button
                    disabled
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-300 cursor-not-allowed"
                    title="Coming in B.2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Attended
                  </button>
                  <button
                    disabled
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-50 text-gray-300 cursor-not-allowed"
                    title="Coming in B.2"
                  >
                    <XCircle className="w-4 h-4" />
                    No-show
                  </button>
                  <button
                    disabled
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-50 text-gray-300 cursor-not-allowed"
                    title="Coming in B.2"
                  >
                    <Ban className="w-4 h-4" />
                    Cancelled
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TutorPortalLayout>
  );
}
