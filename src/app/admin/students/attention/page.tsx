'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import {
  AlertTriangle, RefreshCw, Download, Calendar, ExternalLink,
  ChevronLeft, Loader2, Pause, PlayCircle,
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNowStrict, differenceInDays } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AttentionRow {
  id: string;
  name: string;
  status: 'active' | 'paused';
  tutorName: string | null;
  lastSessionAt: string | null;       // ISO or null
  daysSinceLast: number;              // Infinity-safe int, 9999 = never
  upcomingCount: number;
  hoursRemaining: number;
}

const INACTIVE_THRESHOLD = 14;

// ── Data fetch ────────────────────────────────────────────────────────────────

async function fetchAttentionData(supabase: ReturnType<typeof createClient>) {
  const now = new Date();

  // 1. Active + paused students
  const { data: studentsRaw } = await supabase
    .from('students')
    .select('id, name, status, purchased_hours, used_hours')
    .in('status', ['active', 'paused'])
    .order('name');
  const students = (studentsRaw ?? []) as {
    id: string; name: string; status: string;
    purchased_hours: number | null; used_hours: number | null;
  }[];

  if (!students.length) return { inactive: [], paused: [] };

  const ids = students.map(s => s.id);

  // 2. Most recent session per student (any status)
  const { data: lastSessionsRaw } = await supabase
    .from('sessions')
    .select('student_id, scheduled_at')
    .in('student_id', ids)
    .order('scheduled_at', { ascending: false });
  // Keep only the most recent per student
  const lastSession: Record<string, string> = {};
  for (const s of (lastSessionsRaw ?? []) as { student_id: string; scheduled_at: string }[]) {
    if (!lastSession[s.student_id]) lastSession[s.student_id] = s.scheduled_at;
  }

  // 3. Upcoming session counts per student
  const { data: upcomingRaw } = await supabase
    .from('sessions')
    .select('student_id')
    .in('student_id', ids)
    .eq('status', 'scheduled')
    .gte('scheduled_at', now.toISOString());
  const upcomingCount: Record<string, number> = {};
  for (const s of (upcomingRaw ?? []) as { student_id: string }[]) {
    upcomingCount[s.student_id] = (upcomingCount[s.student_id] ?? 0) + 1;
  }

  // 4. Tutor names via signed contracts
  const { data: contractsRaw } = await supabase
    .from('contracts')
    .select('student_id, tutor:tutors(name), created_at')
    .eq('status', 'signed')
    .in('student_id', ids)
    .order('created_at', { ascending: false });
  const tutorName: Record<string, string> = {};
  for (const c of (contractsRaw ?? []) as any[]) {
    if (!tutorName[c.student_id]) {
      const name = Array.isArray(c.tutor) ? c.tutor[0]?.name : c.tutor?.name;
      if (name) tutorName[c.student_id] = name;
    }
  }

  // 5. Build rows
  const rows: AttentionRow[] = students.map(s => {
    const last = lastSession[s.id] ?? null;
    const days = last ? differenceInDays(now, new Date(last)) : 9999;
    const purchased = s.purchased_hours ?? 0;
    const used = s.used_hours ?? 0;
    return {
      id: s.id,
      name: s.name,
      status: s.status as 'active' | 'paused',
      tutorName: tutorName[s.id] ?? null,
      lastSessionAt: last,
      daysSinceLast: days,
      upcomingCount: upcomingCount[s.id] ?? 0,
      hoursRemaining: Math.max(0, purchased - used),
    };
  });

  // Inactive = active students with no session in 14+ days (or never)
  const inactive = rows
    .filter(r => r.status === 'active' && r.daysSinceLast >= INACTIVE_THRESHOLD)
    .sort((a, b) => b.daysSinceLast - a.daysSinceLast);

  // Paused = all paused students, sorted by most neglected first
  const paused = rows
    .filter(r => r.status === 'paused')
    .sort((a, b) => b.daysSinceLast - a.daysSinceLast);

  return { inactive, paused };
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCSV(rows: AttentionRow[], filename: string) {
  const header = 'Student,Tutor,Last Session,Days Since Last,Upcoming Sessions,Hours Remaining';
  const lines = rows.map(r => [
    `"${r.name}"`,
    `"${r.tutorName ?? ''}"`,
    r.lastSessionAt ? new Date(r.lastSessionAt).toLocaleDateString() : 'Never',
    r.daysSinceLast === 9999 ? 'Never' : r.daysSinceLast,
    r.upcomingCount,
    r.hoursRemaining.toFixed(1),
  ].join(','));
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Row component ──────────────────────────────────────────────────────────────

function AttentionTableRow({
  row,
  showReactivate,
  onStatusChange,
}: {
  row: AttentionRow;
  showReactivate: boolean;
  onStatusChange: (id: string, status: 'active' | 'paused') => Promise<void>;
}) {
  const [acting, setActing] = useState(false);

  async function handleStatus(newStatus: 'active' | 'paused') {
    setActing(true);
    await onStatusChange(row.id, newStatus);
    setActing(false);
  }

  const daysLabel = row.daysSinceLast === 9999
    ? <span className="text-red-500 font-semibold">Never</span>
    : row.daysSinceLast >= 30
      ? <span className="text-red-500 font-semibold">{row.daysSinceLast}d</span>
      : row.daysSinceLast >= 14
        ? <span className="text-amber-600 font-semibold">{row.daysSinceLast}d</span>
        : <span className="text-gray-700">{row.daysSinceLast}d</span>;

  const hoursColor = row.hoursRemaining <= 2
    ? 'text-red-600 font-semibold'
    : row.hoursRemaining <= 5
      ? 'text-amber-600 font-semibold'
      : 'text-gray-700';

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {/* Student */}
      <td className="px-4 py-3">
        <Link href={`/students/${row.id}`}
          className="font-medium text-navy-700 hover:underline text-sm flex items-center gap-1">
          {row.name}
          <ExternalLink className="w-3 h-3 opacity-40" />
        </Link>
      </td>

      {/* Tutor */}
      <td className="px-4 py-3 text-sm text-gray-600">
        {row.tutorName ?? <span className="text-gray-300">—</span>}
      </td>

      {/* Last session */}
      <td className="px-4 py-3 text-sm text-gray-500">
        {row.lastSessionAt
          ? new Date(row.lastSessionAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : <span className="text-red-400 font-medium">Never</span>}
      </td>

      {/* Days since */}
      <td className="px-4 py-3 text-sm">{daysLabel}</td>

      {/* Upcoming */}
      <td className="px-4 py-3 text-sm text-center">
        {row.upcomingCount > 0
          ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold">{row.upcomingCount}</span>
          : <span className="text-gray-300">0</span>}
      </td>

      {/* Hours remaining */}
      <td className={`px-4 py-3 text-sm ${hoursColor}`}>
        {row.hoursRemaining.toFixed(1)}h
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 justify-end">
          <Link
            href={`/admin/book-recurring?student=${row.id}`}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-navy-50 text-navy-700 border border-navy-200 rounded-lg hover:bg-navy-100 transition-colors whitespace-nowrap"
          >
            <Calendar className="w-3.5 h-3.5" />
            Book
          </Link>

          {showReactivate ? (
            <button
              onClick={() => handleStatus('active')}
              disabled={acting}
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
              Reactivate
            </button>
          ) : (
            <button
              onClick={() => handleStatus('paused')}
              disabled={acting}
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
              Mark Paused
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  iconColor,
  rows,
  showReactivate,
  csvFilename,
  onStatusChange,
  emptyMessage,
}: {
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  rows: AttentionRow[];
  showReactivate: boolean;
  csvFilename: string;
  onStatusChange: (id: string, status: 'active' | 'paused') => Promise<void>;
  emptyMessage: string;
}) {
  return (
    <div className="card overflow-hidden">
      {/* Section header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={iconColor}>{icon}</div>
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <span className="text-xs font-semibold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
            {rows.length}
          </span>
        </div>
        <button
          onClick={() => exportCSV(rows, csvFilename)}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-30 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-sm text-gray-400 text-center">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Student</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tutor</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Session</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Days Since</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Upcoming</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Hrs Left</th>
                <th className="px-4 py-2.5 w-40"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(row => (
                <AttentionTableRow
                  key={row.id}
                  row={row}
                  showReactivate={showReactivate}
                  onStatusChange={onStatusChange}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AttentionPage() {
  const supabase = createClient();
  const [inactive, setInactive] = useState<AttentionRow[]>([]);
  const [paused,   setPaused]   = useState<AttentionRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { inactive, paused } = await fetchAttentionData(supabase);
    setInactive(inactive);
    setPaused(paused);
    setLoading(false);
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(id: string, newStatus: 'active' | 'paused') {
    await fetch(`/api/students/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    // Optimistically remove the row from its section and add to the other
    if (newStatus === 'paused') {
      const row = inactive.find(r => r.id === id);
      if (row) {
        setInactive(prev => prev.filter(r => r.id !== id));
        setPaused(prev => [...prev, { ...row, status: 'paused' as const }].sort((a, b) => b.daysSinceLast - a.daysSinceLast));
      }
    } else {
      const row = paused.find(r => r.id === id);
      if (row) {
        setPaused(prev => prev.filter(r => r.id !== id));
        // Only add back to inactive if they'd qualify (14+ days / never)
        if (row.daysSinceLast >= INACTIVE_THRESHOLD) {
          setInactive(prev => [...prev, { ...row, status: 'active' as const }].sort((a, b) => b.daysSinceLast - a.daysSinceLast));
        }
      }
    }
  }

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/students" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h1 className="text-2xl font-bold text-gray-900">Needs Attention</h1>
            </div>
            <p className="text-gray-500 text-sm mt-0.5 ml-7">
              Active students inactive for {INACTIVE_THRESHOLD}+ days, and all paused students.
            </p>
          </div>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          disabled={loading}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2].map(i => <div key={i} className="h-64 card rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-6">
          <Section
            title={`Inactive Students — no session in ${INACTIVE_THRESHOLD}+ days`}
            icon={<AlertTriangle className="w-4 h-4" />}
            iconColor="text-amber-500"
            rows={inactive}
            showReactivate={false}
            csvFilename="inactive-students.csv"
            onStatusChange={handleStatusChange}
            emptyMessage={`No active students have been inactive for ${INACTIVE_THRESHOLD}+ days.`}
          />
          <Section
            title="Paused Students"
            icon={<Pause className="w-4 h-4" />}
            iconColor="text-gray-400"
            rows={paused}
            showReactivate={true}
            csvFilename="paused-students.csv"
            onStatusChange={handleStatusChange}
            emptyMessage="No paused students."
          />
        </div>
      )}
    </AdminLayout>
  );
}
