'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { format, subDays } from 'date-fns';
import Link from 'next/link';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SessionLog {
  id: string;
  actual_duration_minutes: number;
  submitted_at: string;
}

interface SessionRow {
  id: string;
  tutor_id: string;
  tutor_name: string;
  student_id: string;
  student_name: string;
  scheduled_at: string;
  scheduled_duration_minutes: number;
  status: string;
  log_request_sent: boolean;
  log: SessionLog | null;
}

interface Summary {
  total: number;
  with_log: number;
  without_log: number;
  total_scheduled_minutes: number;
  total_logged_minutes: number;
  total_discrepancy_minutes: number;
}

type SortCol = 'scheduled_at' | 'tutor_name' | 'student_name' | 'discrepancy';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'completed' | 'scheduled' | 'cancelled';
type LogFilter = 'all' | 'logged' | 'not_logged';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(dt: string | null): string {
  if (!dt) return '—';
  return format(new Date(dt), "MMM d, yyyy 'at' h:mm a");
}

function fmtMinutes(m: number): string {
  return `${m} min`;
}

function discrepancy(row: SessionRow): number | null {
  if (!row.log) return null;
  return row.log.actual_duration_minutes - row.scheduled_duration_minutes;
}

function fmtDiscrepancy(d: number | null): { text: string; cls: string } {
  if (d === null) return { text: '—', cls: 'text-gray-400' };
  if (d === 0)   return { text: '0 min', cls: 'text-gray-400' };
  if (d > 0)     return { text: `+${d} min`, cls: 'text-green-600 font-medium' };
  return { text: `${d} min`, cls: 'text-red-600 font-medium' };
}

// ── Badges ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    scheduled: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-gray-100 text-gray-500',
    no_show_student: 'bg-amber-100 text-amber-700',
    no_show_tutor:   'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function LogBadge({ status, log }: { status: string; log: SessionLog | null }) {
  if (log) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
        Logged
      </span>
    );
  }
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
        Not logged
      </span>
    );
  }
  return <span className="text-gray-400 text-xs">—</span>;
}

// ── Segmented control ─────────────────────────────────────────────────────────

function Segment<T extends string>({
  options, value, onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            value === opt.value
              ? 'bg-navy-900 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Sort header ───────────────────────────────────────────────────────────────

function SortTh({
  col, label, sortCol, sortDir, onSort, className = '',
}: {
  col: SortCol; label: string; sortCol: SortCol; sortDir: SortDir;
  onSort: (col: SortCol) => void; className?: string;
}) {
  const active = sortCol === col;
  return (
    <th
      className={`table-header cursor-pointer select-none hover:text-gray-900 ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronsUpDown className="w-3 h-3 text-gray-300" />
        )}
      </span>
    </th>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function SessionsAuditPage() {
  const supabase = createClient();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [dateStart,    setDateStart]    = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateEnd,      setDateEnd]      = useState(format(new Date(), 'yyyy-MM-dd'));
  const [tutorId,      setTutorId]      = useState('');
  const [studentId,    setStudentId]    = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('completed');
  const [logFilter,    setLogFilter]    = useState<LogFilter>('all');

  // ── Data state ────────────────────────────────────────────────────────────
  const [sessions,  setSessions]  = useState<SessionRow[]>([]);
  const [summary,   setSummary]   = useState<Summary | null>(null);
  const [tutors,    setTutors]    = useState<{ id: string; name: string }[]>([]);
  const [students,  setStudents]  = useState<{ id: string; name: string }[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  // ── Sort + pagination ─────────────────────────────────────────────────────
  const [sortCol, setSortCol] = useState<SortCol>('scheduled_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page,    setPage]    = useState(0);

  // ── Load dropdowns once ───────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('tutors').select('id, name').is('archived_at', null).order('name')
      .then(({ data }) => setTutors(data ?? []));
    supabase.from('students').select('id, name').eq('status', 'active').order('name')
      .then(({ data }) => setStudents(data ?? []));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch sessions ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setPage(0);
    try {
      const params = new URLSearchParams();
      params.set('start_date', dateStart);
      params.set('end_date',   dateEnd);
      if (tutorId)   params.set('tutor_id',   tutorId);
      if (studentId) params.set('student_id', studentId);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (logFilter !== 'all') params.set('has_log', logFilter === 'logged' ? 'true' : 'false');

      const res  = await fetch(`/api/admin/sessions-audit?${params}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return; }
      setSessions(data.sessions);
      setSummary(data.summary);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [dateStart, dateEnd, tutorId, studentId, statusFilter, logFilter]);

  useEffect(() => { load(); }, [load]);

  // ── Sort ──────────────────────────────────────────────────────────────────
  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
    setPage(0);
  }

  const sorted = [...sessions].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortCol) {
      case 'scheduled_at':  return dir * a.scheduled_at.localeCompare(b.scheduled_at);
      case 'tutor_name':    return dir * a.tutor_name.localeCompare(b.tutor_name);
      case 'student_name':  return dir * a.student_name.localeCompare(b.student_name);
      case 'discrepancy': {
        const da = discrepancy(a) ?? -Infinity;
        const db = discrepancy(b) ?? -Infinity;
        return dir * (da - db);
      }
    }
  });

  const paginated  = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sessions Audit</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cross-reference scheduled sessions against tutor session logs
        </p>
      </div>

      {/* Filter bar */}
      <div className="card p-5 mb-5 space-y-4">
        {/* Row 1: dates + tutor + student */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label">From</label>
            <input
              type="date"
              value={dateStart}
              onChange={e => setDateStart(e.target.value)}
              className="input w-auto"
            />
          </div>
          <div>
            <label className="label">To</label>
            <input
              type="date"
              value={dateEnd}
              onChange={e => setDateEnd(e.target.value)}
              className="input w-auto"
            />
          </div>
          <div>
            <label className="label">Tutor</label>
            <select
              value={tutorId}
              onChange={e => setTutorId(e.target.value)}
              className="input w-auto"
            >
              <option value="">All tutors</option>
              {tutors.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Student</label>
            <select
              value={studentId}
              onChange={e => setStudentId(e.target.value)}
              className="input w-auto"
            >
              <option value="">All students</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: segmented controls */}
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <label className="label mb-1.5">Status</label>
            <Segment<StatusFilter>
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: 'All',       value: 'all'       },
                { label: 'Completed', value: 'completed' },
                { label: 'Scheduled', value: 'scheduled' },
                { label: 'Cancelled', value: 'cancelled' },
              ]}
            />
          </div>
          <div>
            <label className="label mb-1.5">Log status</label>
            <Segment<LogFilter>
              value={logFilter}
              onChange={setLogFilter}
              options={[
                { label: 'All',        value: 'all'       },
                { label: 'Logged',     value: 'logged'    },
                { label: 'Not Logged', value: 'not_logged'},
              ]}
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary strip */}
      {summary && !loading && (
        <div className="grid grid-cols-3 gap-3 mb-5 sm:grid-cols-6">
          {[
            { label: 'Total sessions',       value: summary.total },
            {
              label: 'With logs',
              value: `${summary.with_log} (${summary.total > 0 ? Math.round((summary.with_log / summary.total) * 100) : 0}%)`,
            },
            { label: 'Without logs',         value: summary.without_log },
            { label: 'Scheduled min',        value: fmtMinutes(summary.total_scheduled_minutes) },
            { label: 'Logged min',           value: summary.with_log > 0 ? fmtMinutes(summary.total_logged_minutes) : '—' },
            {
              label: 'Discrepancy',
              value: summary.with_log > 0 ? fmtMinutes(summary.total_discrepancy_minutes) : '—',
            },
          ].map(({ label, value }) => (
            <div key={label} className="card p-3">
              <p className="text-xs text-gray-500 font-medium">{label}</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="card p-8 text-center text-sm text-gray-400">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="card p-8 text-center text-sm text-gray-400">
          No sessions match the current filters.
        </div>
      ) : (
        <>
          <div className="card overflow-hidden mb-4">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <SortTh col="tutor_name"   label="Tutor"       sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh col="student_name" label="Student"     sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh col="scheduled_at" label="Scheduled"   sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                  <th className="table-header text-right">Sched. min</th>
                  <th className="table-header text-right">Logged min</th>
                  <SortTh col="discrepancy"  label="Discrepancy" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                  <th className="table-header text-center">Status</th>
                  <th className="table-header text-center">Log</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map(row => {
                  const disc = discrepancy(row);
                  const { text: discText, cls: discCls } = fmtDiscrepancy(disc);
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="table-cell">
                        <Link
                          href={`/tutors/${row.tutor_id}`}
                          className="text-navy-600 hover:text-navy-800 font-medium hover:underline"
                        >
                          {row.tutor_name}
                        </Link>
                      </td>
                      <td className="table-cell">
                        <Link
                          href={`/students/${row.student_id}`}
                          className="text-navy-600 hover:text-navy-800 hover:underline"
                        >
                          {row.student_name}
                        </Link>
                      </td>
                      <td className="table-cell text-sm text-gray-600 whitespace-nowrap">
                        {fmtTime(row.scheduled_at)}
                      </td>
                      <td className="table-cell text-right text-sm">
                        {row.scheduled_duration_minutes}
                      </td>
                      <td className="table-cell text-right text-sm">
                        {row.log ? row.log.actual_duration_minutes : '—'}
                      </td>
                      <td className={`table-cell text-right text-sm ${discCls}`}>
                        {discText}
                      </td>
                      <td className="table-cell text-center">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="table-cell text-center">
                        <LogBadge status={row.status} log={row.log} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="btn-secondary text-xs disabled:opacity-40"
                >
                  ← Prev
                </button>
                <span className="px-2 py-1">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="btn-secondary text-xs disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
