'use client';

import { useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { RefreshCw, CheckCircle, Video, Zap } from 'lucide-react';

interface SyncResult {
  callsFetched: number;
  skippedInternal: number;
  matched: number;
  alreadyHadUrl: number;
  noMatch: number;
  force: boolean;
  byStrategy: {
    s1_zoom_id: number;
    s2_host_email: number;
    s3_participant_tutor_email: number;
    s4_participant_student_email: number;
    s5_name_fuzzy: number;
    s6_duration: number;
    s7_same_day: number;
  };
}

const STRATEGY_LABELS: { key: keyof SyncResult['byStrategy']; label: string; desc: string }[] = [
  { key: 's1_zoom_id',                  label: 'S1 · Zoom ID',            desc: 'Exact zoom_meeting_id match' },
  { key: 's2_host_email',               label: 'S2 · Host Email',          desc: 'Recording host = tutor email, ±4 h' },
  { key: 's3_participant_tutor_email',   label: 'S3 · Participant→Tutor',   desc: 'Participant email = tutor email, ±4 h' },
  { key: 's4_participant_student_email', label: 'S4 · Participant→Student', desc: 'Participant email = student email, ±4 h' },
  { key: 's5_name_fuzzy',               label: 'S5 · Name Fuzzy',          desc: 'Tutor name in participants/title, ±4 h' },
  { key: 's6_duration',                 label: 'S6 · Duration',            desc: 'Duration within ±15 min + time within ±2 h' },
  { key: 's7_same_day',                 label: 'S7 · Same Day',            desc: 'Participant = tutor email, same UTC calendar day (lowest confidence)' },
];

export default function FathomSyncPage() {
  const [syncing, setSyncing]   = useState(false);
  const [result, setResult]     = useState<SyncResult | null>(null);
  const [error, setError]       = useState('');

  async function runSync(force: boolean) {
    setSyncing(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/cron/fathom-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
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
            Pull Fathom recordings from the last 90 days and match them to sessions. Runs automatically every day at 4 AM UTC.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => runSync(false)}
            disabled={syncing}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Run Sync'}
          </button>
          <button
            onClick={() => runSync(true)}
            disabled={syncing}
            className="btn-primary flex items-center gap-2"
            title="Re-match all recordings even if the session already has a recording URL"
          >
            <Zap className="w-4 h-4" />
            Force Re-sync
          </button>
        </div>
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
          <p className="text-xs text-gray-400">This may take up to 2–3 minutes for large accounts (90-day lookback).</p>
        </div>
      )}

      {result && !syncing && (
        <>
          <div className="flex items-center gap-2 mb-4 text-green-700 text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            Sync complete{result.force && <span className="ml-1 text-xs text-purple-600 font-semibold">(Force mode — all sessions re-matched)</span>}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            <div className="card px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Calls Fetched</p>
              <p className="text-2xl font-bold text-gray-900">{result.callsFetched}</p>
              <p className="text-xs text-gray-400 mt-1">last 90 days</p>
            </div>
            <div className="card px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Skipped (Internal)</p>
              <p className="text-2xl font-bold text-gray-400">{result.skippedInternal ?? 0}</p>
              <p className="text-xs text-gray-400 mt-1">non-session calls</p>
            </div>
            <div className="card px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Matched</p>
              <p className="text-2xl font-bold text-green-600">{result.matched}</p>
              <p className="text-xs text-gray-400 mt-1">sessions updated</p>
            </div>
            <div className="card px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Already Had URL</p>
              <p className="text-2xl font-bold text-blue-600">{result.alreadyHadUrl}</p>
              <p className="text-xs text-gray-400 mt-1">skipped</p>
            </div>
            <div className="card px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">No Match</p>
              <p className="text-2xl font-bold text-amber-600">{result.noMatch}</p>
              <p className="text-xs text-gray-400 mt-1">check Vercel logs</p>
            </div>
          </div>

          {/* Strategy breakdown */}
          {result.matched > 0 && (
            <div className="card px-6 py-5 mb-6">
              <p className="text-sm font-semibold text-gray-700 mb-3">Matched by strategy</p>
              <div className="space-y-2">
                {STRATEGY_LABELS.map(({ key, label, desc }) => {
                  const count = result.byStrategy[key] ?? 0;
                  const pct = result.matched > 0 ? Math.round((count / result.matched) * 100) : 0;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className="w-36 flex-shrink-0">
                        <span className="text-xs font-semibold text-navy-700">{label}</span>
                      </div>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-navy-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-6 text-right text-sm font-bold text-gray-700">{count}</span>
                      <span className="text-xs text-gray-400 hidden lg:block w-72">{desc}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {result.matched === 0 && result.callsFetched === 0 && (
            <div className="card px-6 py-8 text-center text-sm text-gray-400">
              No Fathom calls found in the last 90 days, or{' '}
              <code className="font-mono bg-gray-100 px-1 rounded">FATHOM_API_KEY</code> is not set.
            </div>
          )}

          {result.callsFetched > 0 && result.matched === 0 && result.noMatch > 0 && (
            <div className="card px-6 py-6 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="font-semibold mb-1">Calls fetched but none matched</p>
              <p className="text-xs text-amber-600">
                Check Vercel logs for each unmatched recording — they are logged with host email, participant emails,
                start time, and duration. Look for{' '}
                <code className="font-mono bg-amber-100 px-1 rounded">[fathom-sync] NO MATCH</code>.
              </p>
            </div>
          )}
        </>
      )}

      <div className="mt-8 card px-6 py-4 text-xs text-gray-400 space-y-1">
        <p><span className="font-semibold text-gray-500">Matching strategies (in priority order):</span></p>
        {STRATEGY_LABELS.map(({ label, desc }) => (
          <p key={label}>{label} — {desc}</p>
        ))}
        <p className="pt-1">
          <span className="font-semibold text-gray-500">Run Sync</span> skips sessions that already have a recording URL.{' '}
          <span className="font-semibold text-gray-500">Force Re-sync</span> overwrites all matches, including ones already set.
          Internal calls (Team Meeting, Onboarding Call, Training, Interview, Accepted:) are filtered out before matching.
          Known email aliases (e.g. jrv67@cornell.edu → Joseph Valenti) are resolved automatically.
        </p>
      </div>
    </AdminLayout>
  );
}
