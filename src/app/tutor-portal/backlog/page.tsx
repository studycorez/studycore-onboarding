'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { Loader2, CheckCircle, Clock, XCircle, Plus } from 'lucide-react';
import Link from 'next/link';

interface Proposal {
  id: string;
  student_id: string;
  student_name: string;
  scheduled_at: string;
  duration_minutes: number;
  what_covered: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  created_session_id: string | null;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
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

export default function BacklogPage() {
  const { tutor, loading: authLoading } = useTutorAuth();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check for success message from form submission
  const [showSubmitted, setShowSubmitted] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('submitted=1')) {
      setShowSubmitted(true);
      window.history.replaceState({}, '', '/tutor-portal/backlog');
      setTimeout(() => setShowSubmitted(false), 4000);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tutor-portal/backlog');
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setProposals(data.proposals ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load');
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
        <div className="flex items-start justify-between mb-1">
          <h1 className="text-xl font-bold text-gray-900">Backlog Sessions</h1>
          <Link
            href="/tutor-portal/backlog/new"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            Submit a session
          </Link>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Log sessions that happened but weren&apos;t scheduled in the platform.
        </p>

        {showSubmitted && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            Session submitted for review. Admin will review it shortly.
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

        {!loading && !error && proposals.length === 0 && (
          <div className="text-center py-16">
            <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-4">
              You haven&apos;t submitted any backlog sessions yet.
            </p>
            <Link
              href="/tutor-portal/backlog/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
              Submit a session
            </Link>
          </div>
        )}

        {!loading && !error && proposals.length > 0 && (
          <div className="space-y-3">
            {proposals.map(p => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-base font-semibold text-gray-900">{p.student_name || 'Unknown Student'}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{formatDate(p.scheduled_at)}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>

                <p className="text-xs text-gray-400 mb-2">{p.duration_minutes} min</p>

                {p.what_covered && (
                  <p className="text-sm text-gray-600 mb-2 line-clamp-2">{p.what_covered}</p>
                )}

                <div className="text-xs text-gray-400">
                  {p.status === 'pending' && (
                    <span>Submitted {relativeTime(p.created_at)}</span>
                  )}
                  {p.status === 'approved' && p.reviewed_at && (
                    <span>Approved on {formatDate(p.reviewed_at)}</span>
                  )}
                  {p.status === 'rejected' && (
                    <span className="text-red-500">
                      {p.admin_notes ? `Reason: ${p.admin_notes}` : 'Rejected'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TutorPortalLayout>
  );
}
