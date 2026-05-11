'use client';

import { useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { RefreshCw, CheckCircle, Video } from 'lucide-react';

interface SyncResult {
  callsFetched: number;
  matched: number;
  alreadyHadUrl: number;
  noMatch: number;
}

export default function FathomSyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState('');

  async function runSync() {
    setSyncing(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/cron/fathom-sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Sync failed');
        return;
      }
      setResult(data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <AdminLayout>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fathom Sync</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pull recent Fathom recordings and match them to sessions. Runs automatically every day at 4 AM UTC.
          </p>
        </div>
        <button
          onClick={runSync}
          disabled={syncing}
          className="btn-primary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Run Sync Now'}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {syncing && (
        <div className="card p-8 flex flex-col items-center gap-3 text-center text-gray-500">
          <Video className="w-8 h-8 text-navy-400 animate-pulse" />
          <p className="text-sm">Fetching Fathom calls and matching to sessions…</p>
          <p className="text-xs text-gray-400">This may take up to 30 seconds for large accounts.</p>
        </div>
      )}

      {result && !syncing && (
        <>
          <div className="flex items-center gap-2 mb-4 text-green-700 text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            Sync complete
          </div>

          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="card px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Calls Fetched</p>
              <p className="text-2xl font-bold text-gray-900">{result.callsFetched}</p>
              <p className="text-xs text-gray-400 mt-1">from last 7 days</p>
            </div>
            <div className="card px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Newly Matched</p>
              <p className="text-2xl font-bold text-green-600">{result.matched}</p>
              <p className="text-xs text-gray-400 mt-1">sessions updated</p>
            </div>
            <div className="card px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Already Had URL</p>
              <p className="text-2xl font-bold text-blue-600">{result.alreadyHadUrl}</p>
              <p className="text-xs text-gray-400 mt-1">skipped</p>
            </div>
            <div className="card px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">No Match Found</p>
              <p className="text-2xl font-bold text-amber-600">{result.noMatch}</p>
              <p className="text-xs text-gray-400 mt-1">check Vercel logs</p>
            </div>
          </div>

          {result.matched === 0 && result.callsFetched === 0 && (
            <div className="card px-6 py-8 text-center text-sm text-gray-400">
              No Fathom calls found in the last 7 days, or <code className="font-mono bg-gray-100 px-1 rounded">FATHOM_API_KEY</code> is not set.
            </div>
          )}
          {result.callsFetched > 0 && result.matched === 0 && result.noMatch > 0 && (
            <div className="card px-6 py-6 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="font-semibold mb-1">Calls fetched but none matched</p>
              <p className="text-xs text-amber-600">
                Check Vercel logs for the raw call object structure — the field names may differ from what we expect.
                Look for <code className="font-mono bg-amber-100 px-1 rounded">[fathom-sync] raw first call object</code>.
              </p>
            </div>
          )}
        </>
      )}

      <div className="mt-8 card px-6 py-4 text-xs text-gray-400 space-y-1">
        <p><span className="font-semibold text-gray-500">How matching works:</span></p>
        <p>1. Zoom meeting ID — exact match on <code className="font-mono bg-gray-100 px-1 rounded">zoom_meeting_id</code></p>
        <p>2. Tutor email — matches the recording host email to a tutor, then finds their session within ±30 min</p>
        <p>3. Attendee email — matches any invitee email to a student, then finds their session within ±30 min</p>
        <p className="pt-1">Only sessions where <code className="font-mono bg-gray-100 px-1 rounded">fathom_recording_url IS NULL</code> are updated.</p>
      </div>
    </AdminLayout>
  );
}
