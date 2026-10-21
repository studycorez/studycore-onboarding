'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/layout/AdminLayout';
import { AlertTriangle, Check, ExternalLink, Loader2, Search, X } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface UnmatchedRecording {
  id: string;
  fathom_recording_id: number | null;
  title: string | null;
  host_email: string | null;
  participant_emails: string[] | null;
  started_at: string | null;
  fathom_share_url: string | null;
  category: string | null;
  no_match_reasons: Record<string, string> | null;
  last_seen_at: string;
  resolved: boolean;
  resolved_session_id: string | null;
  created_at: string;
}

interface SessionOption {
  id: string;
  scheduled_at: string;
  tutor: { name: string } | null;
  student: { name: string } | null;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  tutor_recognized_no_session: { label: 'Tutor recognized', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  no_known_participants:       { label: 'No known participants', color: 'text-gray-600 bg-gray-50 border-gray-200' },
};

export default function UnmatchedRecordingsPage() {
  const [recordings, setRecordings] = useState<UnmatchedRecording[]>([]);
  const [loading, setLoading]       = useState(true);
  const [category, setCategory]     = useState('');

  // Match modal state
  const [matchTarget, setMatchTarget]   = useState<UnmatchedRecording | null>(null);
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionResults, setSessionResults] = useState<SessionOption[]>([]);
  const [searching, setSearching]       = useState(false);
  const [matching, setMatching]         = useState(false);
  const [dismissing, setDismissing]     = useState<string | null>(null);
  const [toast, setToast]               = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const url = `/api/admin/fathom-sync/unmatched${category ? `?category=${category}` : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    setRecordings(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [category]);

  useEffect(() => { load(); }, [load]);

  // Search sessions by tutor/student name
  useEffect(() => {
    if (!sessionSearch || sessionSearch.length < 2) {
      setSessionResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/calendar/sessions?start=${
          encodeURIComponent(new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString())
        }&end=${encodeURIComponent(new Date().toISOString())}`);
        const all: SessionOption[] = await res.json();
        const q = sessionSearch.toLowerCase();
        const filtered = all.filter(s =>
          s.tutor?.name?.toLowerCase().includes(q) ||
          s.student?.name?.toLowerCase().includes(q)
        ).slice(0, 20);
        setSessionResults(filtered);
      } catch {}
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [sessionSearch]);

  async function dismiss(rec: UnmatchedRecording) {
    setDismissing(rec.id);
    try {
      const res = await fetch('/api/admin/fathom-sync/unmatched', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rec.id, action: 'dismiss' }),
      });
      if (res.ok) {
        setRecordings(prev => prev.filter(r => r.id !== rec.id));
        showToast('Dismissed');
      }
    } catch {}
    setDismissing(null);
  }

  async function matchToSession(sessionId: string) {
    if (!matchTarget) return;
    setMatching(true);
    try {
      const res = await fetch('/api/admin/fathom-sync/unmatched', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: matchTarget.id, action: 'match', session_id: sessionId }),
      });
      if (res.ok) {
        setRecordings(prev => prev.filter(r => r.id !== matchTarget.id));
        setMatchTarget(null);
        setSessionSearch('');
        setSessionResults([]);
        showToast('Matched to session');
      }
    } catch {}
    setMatching(false);
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }

  return (
    <AdminLayout>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin/fathom-sync" className="text-sm text-gray-400 hover:text-gray-600">
              Fathom Sync
            </Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-2xl font-bold text-gray-900">Unmatched Recordings</h1>
          </div>
          <p className="text-sm text-gray-500">
            Fathom calls that could not be matched to a session. Review and either link to a session or dismiss.
          </p>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-500">Filter:</span>
        {[
          { value: '', label: 'All' },
          { value: 'tutor_recognized_no_session', label: 'Tutor recognized' },
          { value: 'no_known_participants', label: 'No known participants' },
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => setCategory(opt.value)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              category === opt.value
                ? 'bg-navy-700 text-white border-navy-700'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : recordings.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <Check className="w-8 h-8 text-green-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-600">No unmatched recordings</p>
          <p className="text-xs text-gray-400 mt-1">All Fathom calls have been matched or dismissed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recordings.map(rec => {
            const cat = CATEGORY_LABELS[rec.category ?? ''];
            return (
              <div key={rec.id} className="card px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {cat && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cat.color}`}>
                          {cat.label}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {rec.title ?? `Recording #${rec.fathom_recording_id ?? '?'}`}
                      </span>
                    </div>

                    <div className="text-xs text-gray-500 space-y-0.5">
                      <div className="flex gap-4 flex-wrap">
                        <span><span className="text-gray-400">Date:</span> {formatDate(rec.started_at)}</span>
                        <span><span className="text-gray-400">Host:</span> {rec.host_email ?? '—'}</span>
                        {rec.fathom_recording_id && (
                          <span><span className="text-gray-400">ID:</span> {rec.fathom_recording_id}</span>
                        )}
                      </div>
                      {rec.participant_emails && rec.participant_emails.length > 0 && (
                        <div>
                          <span className="text-gray-400">Participants:</span>{' '}
                          {rec.participant_emails.join(', ')}
                        </div>
                      )}
                      {rec.no_match_reasons && Object.keys(rec.no_match_reasons).length > 0 && (
                        <div className="mt-1">
                          <span className="text-gray-400">No-match reasons:</span>{' '}
                          {Object.entries(rec.no_match_reasons).map(([k, v]) => (
                            <span key={k} className="inline-block mr-2">
                              <span className="font-mono text-gray-500">{k}:</span> {v}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {rec.fathom_share_url && (
                      <a
                        href={rec.fathom_share_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost text-xs flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" /> Watch
                      </a>
                    )}
                    <button
                      onClick={() => { setMatchTarget(rec); setSessionSearch(''); setSessionResults([]); }}
                      className="btn-secondary text-xs"
                    >
                      Match to session
                    </button>
                    <button
                      onClick={() => dismiss(rec)}
                      disabled={dismissing === rec.id}
                      className="btn-ghost text-xs text-gray-400 hover:text-red-500"
                      title="Dismiss — not a tutoring session"
                    >
                      {dismissing === rec.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <X className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Match-to-session modal */}
      {matchTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Match to Session</h2>
              <button
                onClick={() => { setMatchTarget(null); setSessionSearch(''); setSessionResults([]); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Recording summary */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm mb-4 space-y-1">
              <p className="font-semibold text-gray-900 truncate">
                {matchTarget.title ?? `Recording #${matchTarget.fathom_recording_id}`}
              </p>
              <p className="text-xs text-gray-500">{formatDate(matchTarget.started_at)}</p>
              {matchTarget.participant_emails && matchTarget.participant_emails.length > 0 && (
                <p className="text-xs text-gray-500">
                  Participants: {matchTarget.participant_emails.join(', ')}
                </p>
              )}
            </div>

            {/* Session search */}
            <label className="text-xs font-semibold text-gray-600 mb-1 block">
              Search sessions by tutor or student name
            </label>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={sessionSearch}
                onChange={e => setSessionSearch(e.target.value)}
                className="input pl-9 w-full"
                placeholder="e.g. Valenti, Alex-Baxter…"
                autoFocus
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
              )}
            </div>

            {sessionResults.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100 max-h-60 overflow-y-auto">
                {sessionResults.map(s => (
                  <button
                    key={s.id}
                    onClick={() => matchToSession(s.id)}
                    disabled={matching}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors text-sm"
                  >
                    <span className="font-medium text-gray-900">
                      {s.student?.name ?? '?'} ← {s.tutor?.name ?? '?'}
                    </span>
                    <span className="ml-2 text-xs text-gray-500">
                      {new Date(s.scheduled_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: 'numeric', minute: '2-digit',
                      })}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {sessionSearch.length >= 2 && !searching && sessionResults.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-3">No sessions found matching &ldquo;{sessionSearch}&rdquo;</p>
            )}

            {matching && (
              <div className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Matching…
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
