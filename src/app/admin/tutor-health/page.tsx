'use client';

import { useEffect, useState, useMemo } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { type TutorHealthWithName } from '@/lib/tutor-health';
import {
  getNoShowColor, getFilingLagColor, getRatingColor, getNpsColor,
  getScoreImprovementColor, getAttestationRateColor, getPendingAttestationsColor,
  getLastLoginColor, colorToBgClass, countRedMetrics, type HealthColor,
} from '@/lib/tutor-health-colors';
import Link from 'next/link';
import { Loader2, ChevronUp, ChevronDown } from 'lucide-react';

type SortKey =
  | 'tutor_name' | 'sessions_count' | 'no_show_rate' | 'avg_filing_lag_hours'
  | 'avg_session_rating' | 'avg_engagement_rating' | 'avg_nps'
  | 'avg_score_improvement' | 'pending_attestations' | 'attestation_rate'
  | 'last_login_at' | 'red_count';

function formatLastLogin(iso: string | null): string {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function MetricCell({ value, color }: { value: string; color: HealthColor }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorToBgClass(color)}`}>
      {value}
    </span>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronUp className="w-3 h-3 text-gray-300 ml-1" />;
  return dir === 'asc'
    ? <ChevronUp className="w-3 h-3 text-navy-600 ml-1" />
    : <ChevronDown className="w-3 h-3 text-navy-600 ml-1" />;
}

export default function TutorHealthPage() {
  const [rows, setRows] = useState<TutorHealthWithName[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('red_count');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/admin/tutor-health')
      .then(r => r.json())
      .then(data => {
        setRows(data.rows ?? []);
        setLoading(false);
      });
  }, []);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      // numeric metrics: worst-first by default (desc for rates, asc for ratings)
      setSortDir('desc');
    }
  }

  const sorted = useMemo(() => {
    const withRed = rows.map(r => ({ ...r, red_count: countRedMetrics(r) }));
    return [...withRed].sort((a, b) => {
      let av: number | string | null;
      let bv: number | string | null;
      if (sortKey === 'tutor_name') {
        av = a.tutor_name; bv = b.tutor_name;
      } else if (sortKey === 'last_login_at') {
        av = a.last_login_at ? new Date(a.last_login_at).getTime() : null;
        bv = b.last_login_at ? new Date(b.last_login_at).getTime() : null;
      } else if (sortKey === 'red_count') {
        av = a.red_count; bv = b.red_count;
      } else {
        av = a[sortKey] as number | null;
        bv = b[sortKey] as number | null;
      }
      // nulls last
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [rows, sortKey, sortDir]);

  function th(label: string, key: SortKey) {
    return (
      <th
        className="table-header cursor-pointer select-none whitespace-nowrap"
        onClick={() => handleSort(key)}
      >
        <span className="inline-flex items-center">
          {label}
          <SortIcon active={sortKey === key} dir={sortDir} />
        </span>
      </th>
    );
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center gap-2 text-gray-400 mt-10">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading tutor health data…
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tutor Health — Last 30 Days</h1>
        <p className="text-sm text-gray-500 mt-1">
          {rows.length} active tutors · sorted by most flags · click any column to re-sort
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {th('Name', 'tutor_name')}
                {th('Sessions', 'sessions_count')}
                {th('No-shows', 'no_show_rate')}
                {th('Filing Lag', 'avg_filing_lag_hours')}
                {th('Rating', 'avg_session_rating')}
                {th('Engagement', 'avg_engagement_rating')}
                {th('NPS', 'avg_nps')}
                {th('Score Δ', 'avg_score_improvement')}
                {th('Pending', 'pending_attestations')}
                {th('Attest %', 'attestation_rate')}
                {th('Last Login', 'last_login_at')}
                {th('Health', 'red_count')}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={12} className="table-cell text-center text-gray-400 py-8">
                    No data for the last 30 days.
                  </td>
                </tr>
              )}
              {sorted.map(r => {
                const redCount = r.red_count;
                return (
                  <tr key={r.tutor_id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">
                      <Link
                        href={`/tutors/${r.tutor_id}`}
                        className="text-navy-700 hover:underline"
                      >
                        {r.tutor_name}
                      </Link>
                    </td>

                    <td className="table-cell text-gray-700">
                      {r.sessions_count}
                      {r.reports_missing > 0 && (
                        <span className="ml-1.5 text-xs text-red-500">
                          ({r.reports_missing} missing)
                        </span>
                      )}
                    </td>

                    <td className="table-cell">
                      <MetricCell
                        value={r.sessions_count === 0 ? '—' : `${r.no_show_count} (${Math.round(r.no_show_rate * 100)}%)`}
                        color={r.sessions_count === 0 ? 'gray' : getNoShowColor(r.no_show_rate)}
                      />
                    </td>

                    <td className="table-cell">
                      <MetricCell
                        value={r.avg_filing_lag_hours == null ? '—' : r.avg_filing_lag_hours < 1 ? '<1hr' : `${r.avg_filing_lag_hours.toFixed(1)}hr`}
                        color={getFilingLagColor(r.avg_filing_lag_hours)}
                      />
                    </td>

                    <td className="table-cell">
                      <MetricCell
                        value={r.avg_session_rating == null ? '—' : r.avg_session_rating.toFixed(1)}
                        color={getRatingColor(r.avg_session_rating)}
                      />
                    </td>

                    <td className="table-cell">
                      <MetricCell
                        value={r.avg_engagement_rating == null ? '—' : r.avg_engagement_rating.toFixed(1)}
                        color={getRatingColor(r.avg_engagement_rating)}
                      />
                    </td>

                    <td className="table-cell">
                      <MetricCell
                        value={r.avg_nps == null ? '—' : r.avg_nps.toFixed(1)}
                        color={getNpsColor(r.avg_nps)}
                      />
                    </td>

                    <td className="table-cell">
                      <MetricCell
                        value={r.avg_score_improvement == null ? '—' : `${r.avg_score_improvement >= 0 ? '+' : ''}${Math.round(r.avg_score_improvement)}`}
                        color={getScoreImprovementColor(r.avg_score_improvement)}
                      />
                    </td>

                    <td className="table-cell">
                      <MetricCell
                        value={String(r.pending_attestations)}
                        color={getPendingAttestationsColor(r.pending_attestations)}
                      />
                    </td>

                    <td className="table-cell">
                      <MetricCell
                        value={r.attestation_rate == null ? '—' : `${Math.round(r.attestation_rate * 100)}%`}
                        color={getAttestationRateColor(r.attestation_rate)}
                      />
                    </td>

                    <td className="table-cell">
                      <MetricCell
                        value={formatLastLogin(r.last_login_at)}
                        color={getLastLoginColor(r.last_login_at)}
                      />
                    </td>

                    <td className="table-cell">
                      {redCount === 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">
                          ✓ Good
                        </span>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${redCount >= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                          {redCount} red
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
