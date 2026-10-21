'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Loader2, RefreshCw } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Status = 'not_started' | 'in_progress' | 'passed' | 'locked';

interface TutorRow {
  tutor_id: string;
  tutor_name: string;
  tutor_email: string;
  status: Status;
  attempts_used: number;
  attempts_remaining: number;
  passed_at: string | null;
  last_attempt_at: string | null;
  last_attempt_score: number | null;
  is_locked: boolean;
  locked_until: string | null;
}

const STATUS_BADGE: Record<Status, { label: string; className: string }> = {
  passed:      { label: 'Passed',      className: 'bg-green-100 text-green-700'  },
  in_progress: { label: 'In Progress', className: 'bg-yellow-100 text-yellow-700' },
  locked:      { label: 'Locked',      className: 'bg-red-100 text-red-700'      },
  not_started: { label: 'Not Started', className: 'bg-gray-100 text-gray-600'    },
};

const FILTER_TABS: { value: Status | 'all'; label: string }[] = [
  { value: 'all',          label: 'All'          },
  { value: 'passed',       label: 'Passed'       },
  { value: 'in_progress',  label: 'In Progress'  },
  { value: 'locked',       label: 'Locked'       },
  { value: 'not_started',  label: 'Not Started'  },
];

export default function SopQuizStatusPage() {
  const [tutors, setTutors] = useState<TutorRow[]>([]);
  const [versionNumber, setVersionNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [resettingId, setResettingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/sop-quiz-status');
      const data = await res.json();
      setTutors(data.tutors ?? []);
      setVersionNumber(data.version?.version_number ?? '');
    } catch { /* silent */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function resetAttempts(tutor: TutorRow) {
    if (!window.confirm(`Reset SOP quiz attempts for ${tutor.tutor_name}? They will be able to retake immediately.`)) return;
    setResettingId(tutor.tutor_id);
    try {
      const res = await fetch('/api/admin/sop-quiz-status/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutor_id: tutor.tutor_id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        alert(d?.error ?? 'Reset failed');
      }
      await load();
    } catch {
      alert('Network error');
    }
    setResettingId(null);
  }

  const filtered = filter === 'all' ? tutors : tutors.filter(t => t.status === filter);

  const counts = {
    total: tutors.length,
    passed: tutors.filter(t => t.status === 'passed').length,
    in_progress: tutors.filter(t => t.status === 'in_progress').length,
    locked: tutors.filter(t => t.status === 'locked').length,
    not_started: tutors.filter(t => t.status === 'not_started').length,
  };

  function relativeTime(iso: string | null): string {
    if (!iso) return '—';
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) return 'expired';
    const hours = Math.ceil(diff / (1000 * 60 * 60));
    return `in ${hours}h`;
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SOP Quiz Status</h1>
          <p className="text-gray-500 text-sm mt-1">
            Track tutor SOP quiz completion (v{versionNumber}). Required for attestation/pay.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total', value: counts.total, color: 'text-gray-900' },
          { label: 'Passed', value: counts.passed, color: 'text-green-700' },
          { label: 'In Progress', value: counts.in_progress, color: 'text-yellow-700' },
          { label: 'Locked', value: counts.locked, color: 'text-red-700' },
          { label: 'Not Started', value: counts.not_started, color: 'text-gray-500' },
        ].map(c => (
          <div key={c.label} className="card p-4 text-center">
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === tab.value
                ? 'bg-navy-900 text-white'
                : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
            {tab.value !== 'all' && (
              <span className="ml-1.5 text-xs opacity-70">
                ({counts[tab.value as Status]})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase">
              <tr>
                <th className="table-header">Tutor</th>
                <th className="table-header">Status</th>
                <th className="table-header text-center">Attempts</th>
                <th className="table-header text-center">Last Score</th>
                <th className="table-header">Passed</th>
                <th className="table-header">Locked Until</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-cell text-center text-gray-400 py-8">
                    No tutors match this filter.
                  </td>
                </tr>
              ) : (
                filtered.map(t => {
                  const badge = STATUS_BADGE[t.status];
                  return (
                    <tr key={t.tutor_id}>
                      <td className="table-cell">
                        <p className="font-medium text-gray-900 text-sm">{t.tutor_name}</p>
                        <p className="text-xs text-gray-400">{t.tutor_email}</p>
                      </td>
                      <td className="table-cell">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="table-cell text-center text-sm">
                        {t.attempts_used} / 3
                      </td>
                      <td className="table-cell text-center text-sm">
                        {t.last_attempt_score != null ? `${t.last_attempt_score}/10` : '—'}
                      </td>
                      <td className="table-cell text-sm text-gray-500">
                        {formatDate(t.passed_at)}
                      </td>
                      <td className="table-cell text-sm">
                        {t.status === 'locked' && t.locked_until
                          ? <span className="text-red-600 font-medium">{relativeTime(t.locked_until)}</span>
                          : '—'
                        }
                      </td>
                      <td className="table-cell text-right">
                        {t.status !== 'passed' && t.attempts_used > 0 && (
                          <button
                            onClick={() => resetAttempts(t)}
                            disabled={resettingId === t.tutor_id}
                            className="text-xs font-medium text-navy-600 hover:text-navy-800 disabled:opacity-50"
                          >
                            {resettingId === t.tutor_id ? 'Resetting…' : 'Reset attempts'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
