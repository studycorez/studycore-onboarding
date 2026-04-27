'use client';

import { useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { formatDateTime } from '@/lib/utils';
import { RefreshCw, Link2, Wand2 } from 'lucide-react';

interface UnmatchedMeeting {
  meetingId: string;
  topic: string;
  startTime: string;
  duration: number;
}

interface SyncResult {
  meetingsFound: number;
  matchedById: number;
  matchedByName: number;
  unmatched: UnmatchedMeeting[];
}

interface AutoMatchResult {
  matched: number;
  skipped_no_student: number;
  skipped_short: number;
  matchedMeetingIds: string[];
}

interface SessionOption {
  id: string;
  scheduled_at: string;
  student: { name: string } | null;
  tutor: { name: string } | null;
}

export default function ZoomSyncPage() {
  const supabase = createClient();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState('');

  // Auto-match
  const [autoMatching, setAutoMatching] = useState(false);
  const [autoMatchResult, setAutoMatchResult] = useState<AutoMatchResult | null>(null);
  const [autoMatchError, setAutoMatchError] = useState('');

  // Match modal
  const [modalMeeting, setModalMeeting] = useState<UnmatchedMeeting | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSession, setSelectedSession] = useState('');
  const [matching, setMatching] = useState(false);

  async function runSync() {
    setSyncing(true);
    setError('');
    setResult(null);
    setAutoMatchResult(null);
    try {
      const res = await fetch('/api/zoom-sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Sync failed'); return; }
      setResult(data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSyncing(false);
    }
  }

  async function runAutoMatch() {
    if (!result || result.unmatched.length === 0) return;
    setAutoMatching(true);
    setAutoMatchError('');
    setAutoMatchResult(null);
    try {
      const res = await fetch('/api/zoom-sync/auto-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetings: result.unmatched }),
      });
      const data = await res.json();
      if (!res.ok) { setAutoMatchError(data.error ?? 'Auto-match failed'); return; }

      setAutoMatchResult(data);

      // Remove newly matched meetings from the unmatched list
      if (data.matchedMeetingIds?.length > 0) {
        const matchedSet = new Set<string>(data.matchedMeetingIds);
        setResult(prev => prev ? {
          ...prev,
          matchedByName: prev.matchedByName + data.matched,
          unmatched: prev.unmatched.filter(m => !matchedSet.has(m.meetingId)),
        } : null);
      }
    } catch {
      setAutoMatchError('Network error. Please try again.');
    } finally {
      setAutoMatching(false);
    }
  }

  async function openMatchModal(meeting: UnmatchedMeeting) {
    setModalMeeting(meeting);
    setStudentSearch('');
    setSelectedSession('');
    setSessions([]);
  }

  async function searchSessions(query: string) {
    setStudentSearch(query);
    if (query.trim().length < 2) { setSessions([]); return; }
    setLoadingSessions(true);
    const { data } = await supabase
      .from('sessions')
      .select('id, scheduled_at, student:students(name), tutor:tutors(name)')
      .is('zoom_meeting_id', null)
      .ilike('students.name', `%${query}%`)
      .order('scheduled_at', { ascending: false })
      .limit(30);
    // Filter client-side since ilike on joined table isn't always reliable
    const filtered = ((data as unknown as SessionOption[]) ?? []).filter(s =>
      (s.student as any)?.name?.toLowerCase().includes(query.toLowerCase())
    );
    setSessions(filtered);
    setLoadingSessions(false);
  }

  async function submitMatch() {
    if (!modalMeeting || !selectedSession) return;
    setMatching(true);
    try {
      const res = await fetch('/api/zoom-sync/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: selectedSession,
          meetingId: modalMeeting.meetingId,
          duration: modalMeeting.duration,
        }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Match failed'); return; }

      // Remove from unmatched list
      setResult(prev => prev ? {
        ...prev,
        matchedById: prev.matchedById + 1,
        unmatched: prev.unmatched.filter(m => m.meetingId !== modalMeeting.meetingId),
      } : null);
      setModalMeeting(null);
    } finally {
      setMatching(false);
    }
  }

  return (
    <AdminLayout>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Zoom Sync</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pull past meetings from the StudyCore Zoom account and match them to sessions.
          </p>
        </div>
        <div className="flex gap-2">
          {result && result.unmatched.length > 0 && (
            <button
              onClick={runAutoMatch}
              disabled={autoMatching}
              className="btn-secondary flex items-center gap-2"
            >
              <Wand2 className={`w-4 h-4 ${autoMatching ? 'animate-pulse' : ''}`} />
              {autoMatching ? 'Matching…' : 'Auto-match by Name'}
            </button>
          )}
          <button
            onClick={runSync}
            disabled={syncing}
            className="btn-primary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Auto-match result banner */}
      {autoMatchError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Auto-match error: {autoMatchError}
        </div>
      )}
      {autoMatchResult && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 flex flex-wrap gap-x-5 gap-y-1">
          <span><strong>{autoMatchResult.matched}</strong> meeting{autoMatchResult.matched !== 1 ? 's' : ''} matched and sessions created</span>
          {autoMatchResult.skipped_no_student > 0 && (
            <span className="text-amber-700"><strong>{autoMatchResult.skipped_no_student}</strong> skipped (no student match)</span>
          )}
          {autoMatchResult.skipped_short > 0 && (
            <span className="text-gray-500"><strong>{autoMatchResult.skipped_short}</strong> skipped (under 10 min)</span>
          )}
        </div>
      )}

      {result && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="card px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Meetings Found</p>
              <p className="text-2xl font-bold text-gray-900">{result.meetingsFound}</p>
            </div>
            <div className="card px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Matched by ID</p>
              <p className="text-2xl font-bold text-green-600">{result.matchedById}</p>
            </div>
            <div className="card px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Matched by Name</p>
              <p className="text-2xl font-bold text-blue-600">{result.matchedByName}</p>
            </div>
            <div className="card px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Unmatched</p>
              <p className="text-2xl font-bold text-amber-600">{result.unmatched.length}</p>
            </div>
          </div>

          {/* Unmatched meetings */}
          {result.unmatched.length > 0 ? (
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-3">Unmatched Meetings</h2>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="table-header">Meeting Topic</th>
                        <th className="table-header">Date</th>
                        <th className="table-header">Duration</th>
                        <th className="table-header">Meeting ID</th>
                        <th className="table-header"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {result.unmatched.map(m => (
                        <tr key={m.meetingId} className="hover:bg-gray-50">
                          <td className="table-cell text-gray-900">{m.topic}</td>
                          <td className="table-cell text-gray-500 text-sm">
                            {m.startTime ? formatDateTime(m.startTime) : '—'}
                          </td>
                          <td className="table-cell text-gray-500">{m.duration ? `${m.duration} min` : '—'}</td>
                          <td className="table-cell text-gray-400 font-mono text-xs">{m.meetingId}</td>
                          <td className="table-cell">
                            <button
                              onClick={() => openMatchModal(m)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-navy-200 text-navy-700 bg-navy-50 hover:bg-navy-100 transition-colors"
                            >
                              <Link2 className="w-3 h-3" /> Match to Session
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="card px-6 py-8 text-center text-gray-400 text-sm">
              All meetings matched successfully.
            </div>
          )}
        </>
      )}

      {/* Match Modal */}
      {modalMeeting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Match Meeting to Session</h2>
            <p className="text-sm text-gray-500 mb-4">
              Search by student name to find the right session.
            </p>

            {/* Meeting details */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-5 space-y-1 text-sm">
              <p><span className="text-gray-500">Topic:</span> <span className="font-medium text-gray-900">{modalMeeting.topic}</span></p>
              <p><span className="text-gray-500">Date:</span> <span className="text-gray-700">{modalMeeting.startTime ? formatDateTime(modalMeeting.startTime) : '—'}</span></p>
              <p><span className="text-gray-500">Duration:</span> <span className="text-gray-700">{modalMeeting.duration ? `${modalMeeting.duration} min` : '—'}</span></p>
            </div>

            {/* Student search */}
            <div className="mb-4">
              <label className="label">Search by Student Name</label>
              <input
                type="text"
                value={studentSearch}
                onChange={e => searchSessions(e.target.value)}
                placeholder="Type a student name…"
                className="input"
              />
            </div>

            {/* Session picker */}
            <div className="mb-5">
              <label className="label">Select Session</label>
              {loadingSessions ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : studentSearch.length < 2 ? (
                <p className="text-sm text-gray-400 italic">Type at least 2 characters to search.</p>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No unlinked sessions found.</p>
              ) : (
                <select
                  value={selectedSession}
                  onChange={e => setSelectedSession(e.target.value)}
                  className="input"
                >
                  <option value="">Select a session…</option>
                  {sessions.map(s => {
                    const student = (s.student as any)?.name ?? 'Unknown';
                    const tutor   = (s.tutor   as any)?.name ?? '';
                    return (
                      <option key={s.id} value={s.id}>
                        {student}{tutor ? ` w/ ${tutor}` : ''} — {formatDateTime(s.scheduled_at)}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setModalMeeting(null)}
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
