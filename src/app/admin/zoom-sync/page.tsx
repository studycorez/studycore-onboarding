'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { formatDateTime } from '@/lib/utils';
import { RefreshCw, Link2, Wand2, Download, CheckCircle, XCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

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

interface ImportPreviewItem {
  meetingId: string;
  topic: string;
  startTime: string;
  duration: number;
  extractedName: string;
  studentId: string | null;
  studentName: string | null;
  willImport: boolean;
  skipReason: string | null;
}

export default function ZoomSyncPage() {
  const supabase = createClient();
  const [importLocked, setImportLocked] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState('');

  // Check lock status on mount
  useEffect(() => {
    fetch('/api/zoom-sync/lock-status')
      .then(r => r.json())
      .then(d => { if (d.locked) setImportLocked(true); })
      .catch(() => {});
  }, []);

  // Auto-match
  const [autoMatching, setAutoMatching] = useState(false);
  const [autoMatchResult, setAutoMatchResult] = useState<AutoMatchResult | null>(null);
  const [autoMatchError, setAutoMatchError] = useState('');

  // Bulk import
  const [bulkPreviewLoading, setBulkPreviewLoading] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<ImportPreviewItem[] | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkImportResult, setBulkImportResult] = useState<{ created: number; skipped: number } | null>(null);
  const [bulkError, setBulkError] = useState('');

  // Match modal
  const [modalMeeting, setModalMeeting] = useState<UnmatchedMeeting | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSession, setSelectedSession] = useState('');
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState('');

  async function runSync() {
    setSyncing(true);
    setError('');
    setResult(null);
    setAutoMatchResult(null);
    setBulkImportResult(null);
    setBulkPreview(null);
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

  async function openBulkPreview() {
    if (!result || result.unmatched.length === 0) return;
    setBulkPreviewLoading(true);
    setBulkError('');
    setBulkPreview(null);
    setBulkImportResult(null);
    try {
      const res = await fetch('/api/zoom-sync/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetings: result.unmatched, preview: true }),
      });
      const data = await res.json();
      if (!res.ok) { setBulkError(data.error ?? 'Preview failed'); return; }
      setBulkPreview(data.preview ?? []);
    } catch {
      setBulkError('Network error. Please try again.');
    } finally {
      setBulkPreviewLoading(false);
    }
  }

  async function confirmBulkImport() {
    if (!result || result.unmatched.length === 0) return;
    setBulkImporting(true);
    setBulkError('');
    try {
      const res = await fetch('/api/zoom-sync/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetings: result.unmatched, preview: false }),
      });
      const data = await res.json();
      if (!res.ok) { setBulkError(data.error ?? 'Import failed'); return; }

      setBulkImportResult({ created: data.created, skipped: data.skipped });
      setBulkPreview(null);

      // Remove imported meetings from the unmatched list
      const importedIds = new Set<string>(
        (data.preview as ImportPreviewItem[] ?? [])
          .filter(p => p.willImport)
          .map(p => p.meetingId)
      );
      if (importedIds.size > 0) {
        setResult(prev => prev ? {
          ...prev,
          unmatched: prev.unmatched.filter(m => !importedIds.has(m.meetingId)),
        } : null);
      }
    } catch {
      setBulkError('Network error. Please try again.');
    } finally {
      setBulkImporting(false);
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
      if (!res.ok) { const d = await res.json(); setMatchError(d.error ?? 'Match failed'); setTimeout(() => setMatchError(''), 4000); return; }

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

  const willImportCount = bulkPreview?.filter(p => p.willImport).length ?? 0;
  const willSkipCount   = bulkPreview?.filter(p => !p.willImport).length ?? 0;

  return (
    <AdminLayout>
      {importLocked && (
        <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800 flex items-start gap-3">
          <span className="text-amber-500 text-base leading-snug">⚠️</span>
          <span>
            <strong>Import locked — investigation in progress.</strong>{' '}
            Bulk Import and Auto-match by Name are disabled while a duplicate-session investigation is underway.
            Contact an admin to re-enable once the investigation is complete.
          </span>
        </div>
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Zoom Sync</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pull past meetings from the StudyCore Zoom account and match them to sessions.
          </p>
        </div>
        <div className="flex gap-2">
          {result && result.unmatched.length > 0 && (
            <>
              <button
                onClick={runAutoMatch}
                disabled={importLocked || autoMatching || bulkPreviewLoading}
                title={importLocked ? 'Import locked — investigation in progress' : undefined}
                className="btn-secondary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Wand2 className={`w-4 h-4 ${autoMatching ? 'animate-pulse' : ''}`} />
                {autoMatching ? 'Matching…' : 'Auto-match by Name'}
              </button>
              <button
                onClick={openBulkPreview}
                disabled={importLocked || bulkPreviewLoading || autoMatching}
                title={importLocked ? 'Import locked — investigation in progress' : undefined}
                className="btn-secondary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className={`w-4 h-4 ${bulkPreviewLoading ? 'animate-pulse' : ''}`} />
                {bulkPreviewLoading ? 'Loading preview…' : 'Bulk Import'}
              </button>
            </>
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

      {/* Bulk import result banner */}
      {bulkError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {bulkError}
        </div>
      )}
      {bulkImportResult && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 flex flex-wrap gap-x-5 gap-y-1">
          <span><strong>{bulkImportResult.created}</strong> session{bulkImportResult.created !== 1 ? 's' : ''} created</span>
          <span className="text-gray-500"><strong>{bulkImportResult.skipped}</strong> skipped (internal / no match / too short)</span>
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

      {/* ── Bulk Import Preview Modal ────────────────────────────────────────── */}
      {bulkPreview && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-8 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Bulk Import Preview</h2>
            <p className="text-sm text-gray-500 mb-4">
              Review what will be imported. Internal calls, short meetings, and unmatched
              meetings are excluded.
            </p>

            {/* Summary */}
            <div className="flex gap-6 mb-5">
              <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                <CheckCircle className="w-4 h-4" />
                <span><strong>{willImportCount}</strong> will be imported</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <XCircle className="w-4 h-4" />
                <span><strong>{willSkipCount}</strong> will be skipped</span>
              </div>
            </div>

            {/* Preview table */}
            <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
              <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      <th className="table-header">Topic</th>
                      <th className="table-header">Date</th>
                      <th className="table-header">Duration</th>
                      <th className="table-header">Extracted Name</th>
                      <th className="table-header">Matched Student</th>
                      <th className="table-header">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {bulkPreview.map(item => (
                      <tr
                        key={item.meetingId}
                        className={item.willImport ? 'bg-white' : 'bg-gray-50 opacity-60'}
                      >
                        <td className="table-cell text-gray-800 max-w-xs truncate">{item.topic}</td>
                        <td className="table-cell text-gray-500 whitespace-nowrap">
                          {item.startTime ? formatDateTime(item.startTime) : '—'}
                        </td>
                        <td className="table-cell text-gray-500 whitespace-nowrap">
                          {item.duration ? `${item.duration} min` : '—'}
                        </td>
                        <td className="table-cell text-gray-700">{item.extractedName || '—'}</td>
                        <td className="table-cell">
                          {item.studentName
                            ? <span className="text-green-700 font-medium">{item.studentName}</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="table-cell whitespace-nowrap">
                          {item.willImport
                            ? <span className="inline-flex items-center gap-1 text-green-700 font-medium text-xs"><CheckCircle className="w-3 h-3" /> Import</span>
                            : <span className="text-xs text-gray-400">{item.skipReason}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setBulkPreview(null)}
                className="btn-secondary flex-1 justify-center"
                disabled={bulkImporting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBulkImport}
                disabled={bulkImporting || willImportCount === 0}
                className="btn-primary flex-1 justify-center"
              >
                {bulkImporting
                  ? 'Importing…'
                  : `Import ${willImportCount} Session${willImportCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manual Match Modal ───────────────────────────────────────────────── */}
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

            {matchError && <p className="text-red-600 text-sm text-center">{matchError}</p>}
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
