'use client';

import { useEffect, useState } from 'react';

interface OpenFlag {
  id:          string;
  tutorName:   string;
  studentName: string;
  flagLevel:   string;
  notes:       string;
  sessionDate: string;
}

interface TutorRow {
  name:          string;
  email:         string;
  phone:         string;
  sodDays:       number;
  eodDays:       number;
  sessionCount:  number;
  fathomCount:   number;
  fathomPct:     number;
  hasRedFlag:    boolean;
  hasYellowFlag: boolean;
  totalDays:     number;
}

interface TqcData {
  tutors: TutorRow[];
}

type Mode = 'day' | 'week';
type Filter = 'all' | 'noncompliant';

export default function TqcDashboard() {
  const [authed, setAuthed]           = useState(false);
  const [password, setPassword]       = useState('');
  const [authError, setAuthError]     = useState('');
  const [mode, setMode]               = useState<Mode>('day');
  const [filter, setFilter]           = useState<Filter>('all');
  const [data, setData]               = useState<TqcData | null>(null);
  const [loading, setLoading]         = useState(false);
  const [toasts, setToasts]           = useState<{ id: number; msg: string; ok: boolean }[]>([]);
  const [confirm, setConfirm]         = useState<TutorRow | null>(null);
  const [sending, setSending]         = useState<string | null>(null);
  const [flags, setFlags]             = useState<OpenFlag[]>([]);
  const [resolvingFlag, setResolvingFlag] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('sc_auth') === 'true') {
      setAuthed(true);
    }
  }, []);

  useEffect(() => {
    if (authed) { fetchData(); fetchFlags(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, mode]);

  async function login() {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      localStorage.setItem('sc_auth', 'true');
      setAuthed(true);
      setAuthError('');
    } else {
      setAuthError('Incorrect password');
    }
  }

  async function fetchFlags() {
    try {
      const res = await fetch('/api/tqc-flags');
      const json = await res.json();
      setFlags(json.flags ?? []);
    } catch { setFlags([]); }
  }

  async function resolveFlag(flag: OpenFlag) {
    setResolvingFlag(flag.id);
    try {
      const res = await fetch('/api/tqc-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagId: flag.id, resolvedBy: 'TQC Dashboard' }),
      });
      if (!res.ok) throw new Error('Failed');
      setFlags(f => f.filter(x => x.id !== flag.id));
      addToast(`Flag resolved: ${flag.studentName}`, true);
    } catch {
      addToast(`Failed to resolve flag`, false);
    } finally {
      setResolvingFlag(null);
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tqc-data?mode=${mode}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  function addToast(msg: string, ok: boolean) {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }

  async function sendReminder(tutor: TutorRow) {
    setSending(tutor.name);
    setConfirm(null);
    try {
      const res = await fetch('/api/tqc-remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutorName:    tutor.name,
          tutorPhone:   tutor.phone,
          tutorEmail:   tutor.email,
          reminderType: 'both',
        }),
      });
      if (!res.ok) throw new Error('Failed');
      addToast(`Reminder sent to ${tutor.name}`, true);
    } catch {
      addToast(`Failed to send reminder to ${tutor.name}`, false);
    } finally {
      setSending(null);
    }
  }

  const tutors = data?.tutors ?? [];

  const displayed = tutors.filter(t => {
    if (filter === 'noncompliant') {
      const sodMissing = t.sodDays < t.totalDays;
      const eodMissing = t.eodDays < t.totalDays;
      const fathomLow  = t.sessionCount > 0 && t.fathomPct < 80;
      return sodMissing || eodMissing || fathomLow || t.hasYellowFlag;
    }
    return true;
  });

  // Stats
  const activeTutors = tutors.length;
  const totalDays    = tutors[0]?.totalDays ?? 1;
  const possibleSod  = activeTutors * totalDays;
  const possibleEod  = activeTutors * totalDays;
  const sodPct  = possibleSod  > 0 ? Math.round((tutors.reduce((s, t) => s + t.sodDays, 0) / possibleSod) * 100) : 0;
  const eodPct  = possibleEod  > 0 ? Math.round((tutors.reduce((s, t) => s + t.eodDays, 0) / possibleEod) * 100) : 0;
  const totalSessions = tutors.reduce((s, t) => s + t.sessionCount, 0);
  const totalFathom   = tutors.reduce((s, t) => s + t.fathomCount, 0);
  const fathomOverall = totalSessions > 0 ? Math.round((totalFathom / totalSessions) * 100) : 0;

  function fathomBadgeClass(pct: number, count: number): string {
    if (count === 0) return 'bg-gray-100 text-gray-500';
    if (pct >= 80)   return 'bg-green-100 text-green-700';
    if (pct >= 50)   return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  }

  function statColor(pct: number): string {
    if (pct >= 80) return 'text-green-600';
    if (pct >= 50) return 'text-yellow-600';
    return 'text-red-600';
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow-md p-10 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-2xl font-bold text-[#1e2090]">StudyCore</div>
            <div className="text-gray-500 text-sm mt-1">TQC Dashboard</div>
          </div>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#1e2090]"
          />
          {authError && <p className="text-red-500 text-sm mb-3">{authError}</p>}
          <button
            onClick={login}
            className="w-full bg-[#1e2090] text-white rounded-lg px-4 py-3 font-semibold text-sm hover:bg-[#161870] transition"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1e2090] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <div className="font-bold text-lg">StudyCore TQC</div>
          <div className="text-blue-200 text-sm">Tutor Compliance Dashboard</div>
        </div>
        <div className="flex items-center gap-4">
          <a href="/match-queue" className="text-blue-200 hover:text-white text-sm transition">Match Queue</a>
          <button onClick={fetchData} className="text-blue-200 hover:text-white text-sm transition">&#8635; Refresh</button>
        </div>
      </div>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map(t => (
          <div key={t.id} className={`rounded-lg px-4 py-3 text-sm shadow-lg text-white ${t.ok ? 'bg-green-600' : 'bg-red-600'}`}>
            {t.msg}
          </div>
        ))}
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Mode toggle */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setMode('day')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${mode === 'day' ? 'bg-[#1e2090] text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            Today
          </button>
          <button
            onClick={() => setMode('week')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${mode === 'week' ? 'bg-[#1e2090] text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            This Week
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">Active Tutors</div>
            <div className="text-2xl font-bold text-gray-900">{activeTutors}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">SOD Compliance</div>
            <div className={`text-2xl font-bold ${statColor(sodPct)}`}>{sodPct}%</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">EOD Compliance</div>
            <div className={`text-2xl font-bold ${statColor(eodPct)}`}>{eodPct}%</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">Fathom Compliance</div>
            <div className={`text-2xl font-bold ${statColor(fathomOverall)}`}>{fathomOverall}%</div>
          </div>
        </div>

        {/* Open flags panel */}
        {flags.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Open Flags ({flags.length})
            </h2>
            <div className="space-y-2">
              {flags.map(flag => (
                <div
                  key={flag.id}
                  className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4 ${flag.flagLevel === 'Red' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${flag.flagLevel === 'Red' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {flag.flagLevel === 'Red' ? '🔴' : '🟡'} {flag.flagLevel}
                      </span>
                      <span className="font-semibold text-gray-900 text-sm">{flag.studentName}</span>
                      <span className="text-xs text-gray-500">Tutor: {flag.tutorName}</span>
                      <span className="text-xs text-gray-400">{flag.sessionDate}</span>
                    </div>
                    {flag.notes && (
                      <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{flag.notes}</p>
                    )}
                  </div>
                  <button
                    onClick={() => resolveFlag(flag)}
                    disabled={resolvingFlag === flag.id}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50 shrink-0"
                  >
                    {resolvingFlag === flag.id ? 'Resolving...' : 'Mark Resolved'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter toggle */}
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filter === 'all' ? 'bg-[#1e2090] text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            All tutors
          </button>
          <button
            onClick={() => setFilter('noncompliant')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filter === 'noncompliant' ? 'bg-red-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            Non-compliant only
          </button>
        </div>

        {/* Tutor table */}
        {loading ? (
          <div className="text-center text-gray-400 py-16">Loading compliance data...</div>
        ) : displayed.length === 0 ? (
          <div className="text-center text-gray-400 py-16 bg-white rounded-xl border border-gray-200">
            <div className="font-medium text-gray-600">
              {filter === 'noncompliant' ? 'All tutors are compliant' : 'No tutor data found for this period'}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {displayed.map(t => (
              <div key={t.name} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">

                  {/* Name + flags */}
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-gray-900">{t.name}</div>
                    {t.hasRedFlag && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Red flag</span>
                    )}
                    {!t.hasRedFlag && t.hasYellowFlag && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Yellow flag</span>
                    )}
                  </div>

                  {/* Send reminder */}
                  <button
                    onClick={() => setConfirm(t)}
                    disabled={sending === t.name}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                  >
                    {sending === t.name ? 'Sending...' : 'Send Reminder'}
                  </button>
                </div>

                {/* Compliance badges */}
                <div className="flex flex-wrap gap-3 mt-3">
                  {/* SOD */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">SOD:</span>
                    {mode === 'day' ? (
                      t.sodDays >= 1
                        ? <span className="text-green-600 text-sm font-bold">&#10003;</span>
                        : <span className="text-red-500 text-sm font-bold">&#10007;</span>
                    ) : (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.sodDays >= t.totalDays ? 'bg-green-100 text-green-700' : t.sodDays > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        {t.sodDays}/{t.totalDays} days
                      </span>
                    )}
                  </div>

                  {/* EOD */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">EOD:</span>
                    {mode === 'day' ? (
                      t.eodDays >= 1
                        ? <span className="text-green-600 text-sm font-bold">&#10003;</span>
                        : <span className="text-red-500 text-sm font-bold">&#10007;</span>
                    ) : (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.eodDays >= t.totalDays ? 'bg-green-100 text-green-700' : t.eodDays > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        {t.eodDays}/{t.totalDays} days
                      </span>
                    )}
                  </div>

                  {/* Sessions + Fathom */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">Session Reports:</span>
                    <span className="text-xs text-gray-700 font-medium">{t.sessionCount}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${fathomBadgeClass(t.fathomPct, t.sessionCount)}`}>
                      {t.sessionCount > 0 ? `${t.fathomPct}% Fathom` : 'No sessions'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm reminder modal */}
      {confirm && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setConfirm(null)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="font-bold text-gray-900 text-base mb-1">Send reminder?</h2>
            <p className="text-sm text-gray-500 mb-4">
              This will send an SMS and email reminder to <strong>{confirm.name}</strong> asking them to submit their daily forms.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => sendReminder(confirm)}
                className="flex-1 bg-[#1e2090] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-[#161870] transition"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
