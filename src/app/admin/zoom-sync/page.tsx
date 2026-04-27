'use client';

import { useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { formatDateTime } from '@/lib/utils';
import { RefreshCw, CheckCircle, XCircle, Link2 } from 'lucide-react';

interface UnmatchedMeeting {
  meetingId: string;
  topic: string;
  startTime: string;
  duration: number;
}

interface TutorResult {
  tutorId: string;
  tutorName: string;
  zoomUserId: string | null;
  meetingsFound: number;
  matched: number;
  unmatched: UnmatchedMeeting[];
}

interface SessionOption {
  id: string;
  scheduled_at: string;
  student: { name: string } | null;
}

interface MatchModalState {
  tutorId: string;
  meeting: UnmatchedMeeting;
}

export default function ZoomSyncPage() {
  const supabase = createClient();
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<TutorResult[] | null>(null);
  const [error, setError] = useState('');

  // Match modal
  const [modal, setModal] = useState<MatchModalState | null>(null);
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSession, setSelectedSession] = useState('');
  const [matching, setMatching] = useState(false);

  async function runSync() {
    setSyncing(true);
    setError('');
    setResults(null);
    try {
      const res = await fetch('/api/zoom-sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Sync failed'); return; }
      setResults(data.results ?? []);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSyncing(false);
    }
  }

  async function openMatchModal(tutorId: string, meeting: UnmatchedMeeting) {
    setModal({ tutorId, meeting });
    setSelectedSession('');
    setLoadingSessions(true);
    const { data } = await supabase
      .from('sessions')
      .select('id, scheduled_at, student:students(name)')
      .eq('tutor_id', tutorId)
      .is('zoom_meeting_id', null)
      .order('scheduled_at', { ascending: false })
      .limit(50);
    setSessions((data as unknown as SessionOption[]) ?? []);
    setLoadingSessions(false);
  }

  async function submitMatch() {
    if (!modal || !selectedSession) return;
    setMatching(true);
    try {
      const res = await fetch('/api/zoom-sync/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: selectedSession,
          meetingId: modal.meeting.meetingId,
          duration: modal.meeting.duration,
        }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Match failed'); return; }

      // Remove from unmatched list in state
      setResults(prev => prev?.map(r =>
        r.tutorId === modal.tutorId
          ? { ...r, matched: r.matched + 1, unmatched: r.unmatched.filter(m => m.meetingId !== modal.meeting.meetingId) }
          : r
      ) ?? null);
      setModal(null);
    } finally {
      setMatching(false);
    }
  }

  const totalMeetings = results?.reduce((s, r) => s + r.meetingsFound, 0) ?? 0;
  const totalMatched  = results?.reduce((s, r) => s + r.matched, 0) ?? 0;
  const totalUnmatched = results?.reduce((s, r) => s + r.unmatched.length, 0) ?? 0;

  return (
    <AdminLayout>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Zoom Sync</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pull past Zoom meetings and match them to sessions in the database.
          </p>
        </div>
        <button
          onClick={runSync}
          disabled={syncing}
          className="btn-primary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {results && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="card px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Meetings Found</p>
              <p className="text-2xl font-bold text-gray-900">{totalMeetings}</p>
            </div>
            <div className="card px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Matched</p>
              <p className="text-2xl font-bold text-green-600">{totalMatched}</p>
            </div>
            <div className="card px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Unmatched</p>
              <p className="text-2xl font-bold text-amber-600">{totalUnmatched}</p>
            </div>
          </div>

          {/* Per-tutor table */}
          <div className="card overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header">Tutor</th>
                    <th className="table-header">Zoom User ID</th>
                    <th className="table-header">Meetings Found</th>
                    <th className="table-header">Matched</th>
                    <th className="table-header">Unmatched</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {results.map(r => (
                    <tr key={r.tutorId} className="hover:bg-gray-50">
                      <td className="table-cell font-medium text-gray-900">{r.tutorName}</td>
                      <td className="table-cell text-gray-500 font-mono text-xs">{r.zoomUserId ?? <span className="text-gray-400 italic">not found</span>}</td>
                      <td className="table-cell text-gray-700">{r.meetingsFound}</td>
                      <td className="table-cell">
                        <span className="inline-flex items-center gap-1 text-green-700 font-medium">
                          <CheckCircle className="w-3.5 h-3.5" /> {r.matched}
                        </span>
                      </td>
                      <td className="table-cell">
                        {r.unmatched.length > 0
                          ? <span className="inline-flex items-center gap-1 text-amber-700 font-medium"><XCircle className="w-3.5 h-3.5" /> {r.unmatched.length}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Unmatched meetings */}
          {results.some(r => r.unmatched.length > 0) && (
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-3">Unmatched Meetings</h2>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="table-header">Tutor</th>
                        <th className="table-header">Meeting Topic</th>
                        <th className="table-header">Date</th>
                        <th className="table-header">Duration</th>
                        <th className="table-header">Meeting ID</th>
                        <th className="table-header"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {results.flatMap(r =>
                        r.unmatched.map(m => (
                          <tr key={m.meetingId} className="hover:bg-gray-50">
                            <td className="table-cell text-gray-700">{r.tutorName}</td>
                            <td className="table-cell text-gray-900">{m.topic}</td>
                            <td className="table-cell text-gray-500 text-sm">
                              {m.startTime ? formatDateTime(m.startTime) : '—'}
                            </td>
                            <td className="table-cell text-gray-500">{m.duration ? `${m.duration} min` : '—'}</td>
                            <td className="table-cell text-gray-400 font-mono text-xs">{m.meetingId}</td>
                            <td className="table-cell">
                              <button
                                onClick={() => openMatchModal(r.tutorId, m)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-navy-200 text-navy-700 bg-navy-50 hover:bg-navy-100 transition-colors"
                              >
                                <Link2 className="w-3 h-3" /> Match to Session
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Match Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Match Meeting to Session</h2>
            <p className="text-sm text-gray-500 mb-4">
              Link this Zoom meeting to an existing session record.
            </p>

            {/* Meeting details */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-5 space-y-1 text-sm">
              <p><span className="text-gray-500">Topic:</span> <span className="font-medium text-gray-900">{modal.meeting.topic}</span></p>
              <p><span className="text-gray-500">Date:</span> <span className="text-gray-700">{modal.meeting.startTime ? formatDateTime(modal.meeting.startTime) : '—'}</span></p>
              <p><span className="text-gray-500">Duration:</span> <span className="text-gray-700">{modal.meeting.duration ? `${modal.meeting.duration} min` : '—'}</span></p>
            </div>

            {/* Session picker */}
            <div className="mb-5">
              <label className="label">Select Session</label>
              {loadingSessions ? (
                <p className="text-sm text-gray-400">Loading sessions…</p>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No unlinked sessions found for this tutor.</p>
              ) : (
                <select
                  value={selectedSession}
                  onChange={e => setSelectedSession(e.target.value)}
                  className="input"
                >
                  <option value="">Select a session…</option>
                  {sessions.map(s => {
                    const student = (s.student as any)?.name ?? 'Unknown';
                    return (
                      <option key={s.id} value={s.id}>
                        {student} — {formatDateTime(s.scheduled_at)}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="btn-secondary flex-1 justify-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitMatch}
                disabled={!selectedSession || matching}
                className="btn-primary flex-1 justify-center"
              >
                {matching ? 'Saving…' : 'Link Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
