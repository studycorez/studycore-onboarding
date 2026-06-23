'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import StudentForm from '@/components/students/StudentForm';
import { createClient } from '@/lib/supabase/client';
import type { Student } from '@/types';
import { Users, Plus, Search, Trash2, CheckCircle, RefreshCw, AlertTriangle, Download } from 'lucide-react';
import Link from 'next/link';
import { getAdminOnboardingCount } from '@/hooks/useParentAuth';

type StatusFilter = 'all' | 'active' | 'completed' | 'refunded' | 'placeholder' | 'at-risk';

function tzAbbr(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')?.value ?? tz;
  } catch { return tz; }
}

function isPlaceholderEmail(email: string): boolean {
  return email.includes('@studycore.import') || /^student-/.test(email);
}

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  paused:    'bg-gray-100 text-gray-600',
  refunded:  'bg-red-100 text-red-700',
};

export default function StudentsPage() {
  const [students, setStudents]     = useState<Student[]>([]);
  const [tutorMap, setTutorMap]     = useState<Record<string, string>>({});
  const [loading, setLoading]       = useState(true);
  const [open, setOpen]             = useState(false);
  const [query, setQuery]           = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [markingId, setMarkingId]   = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Student | null>(null);
  const [ghlSyncing, setGhlSyncing]     = useState(false);
  const [ghlToast, setGhlToast]         = useState<string | null>(null);
  const [deleteError, setDeleteError]   = useState<string | null>(null);
  const [upcomingIds, setUpcomingIds]   = useState<Set<string>>(new Set());
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Prefill from tutor student-add request
  const fromRequestId = searchParams.get('from_request') ?? undefined;
  const prefilledData = fromRequestId ? {
    name: searchParams.get('prefill_name') ?? undefined,
    parent_name: searchParams.get('prefill_parent_name') ?? undefined,
    parent_email: searchParams.get('prefill_parent_email') ?? undefined,
    notes: searchParams.get('prefill_notes') ?? undefined,
  } : undefined;

  async function load() {
    setLoading(true);
    const now = new Date().toISOString();
    const [studentsRes, contractsRes, upcomingRes] = await Promise.all([
      supabase.from('students').select('*').order('name'),
      fetch('/api/admin/contracts?status=signed')
        .then(r => r.json())
        .then(d => ({ data: d.contracts ?? [] })),
      supabase.from('sessions')
        .select('student_id')
        .eq('status', 'scheduled')
        .gte('scheduled_at', now),
    ]);
    setStudents(studentsRes.data ?? []);
    setUpcomingIds(new Set((upcomingRes.data ?? []).map(s => s.student_id)));
    // Build student_id → tutor name map (most recent signed contract wins)
    const map: Record<string, string> = {};
    for (const c of (contractsRes.data ?? []) as any[]) {
      if (!map[c.student_id] && c.tutor?.name) {
        map[c.student_id] = c.tutor.name;
      }
    }
    setTutorMap(map);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Auto-open modal if navigated from student-add request
  useEffect(() => {
    if (fromRequestId) setOpen(true);
  }, [fromRequestId]);

  async function deleteStudent(id: string) {
    setDeletingId(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error ?? `Delete failed (${res.status})`);
        return;
      }
      setConfirmDelete(null);
      load();
    } catch {
      setDeleteError('Network error — could not delete student.');
    } finally {
      setDeletingId(null);
    }
  }

  async function markComplete(id: string) {
    setMarkingId(id);
    await fetch(`/api/students/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    setMarkingId(null);
    load();
  }

  function isAtRisk(s: Student): boolean {
    if ((s.status ?? 'active') !== 'active') return false;
    const purchased = s.purchased_hours ?? 0;
    const used      = s.used_hours ?? 0;
    const remaining = purchased - used;
    return remaining < 5 && !upcomingIds.has(s.id);
  }

  const searched = students.filter(s =>
    s.name.toLowerCase().includes(query.toLowerCase()) ||
    s.email.toLowerCase().includes(query.toLowerCase())
  );

  const filtered = searched.filter(s => {
    if (statusFilter === 'placeholder') return isPlaceholderEmail(s.email);
    if (statusFilter === 'at-risk') return isAtRisk(s);
    if (statusFilter === 'all') return true;
    return (s.status ?? 'active') === statusFilter;
  });

  const atRiskCount = students.filter(isAtRisk).length;

  const placeholderCount = students.filter(s => isPlaceholderEmail(s.email)).length;

  function exportPlaceholderCSV() {
    const rows = students.filter(s => isPlaceholderEmail(s.email));
    const header = 'Student Name,Placeholder Email,Parent Email,Parent Phone';
    const lines = rows.map(s =>
      [s.name, s.email, s.parent_email ?? '', (s as any).parent_phone ?? '']
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'placeholder-emails.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const filterBtn = (value: StatusFilter, label: string) => (
    <button
      onClick={() => setStatusFilter(value)}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        statusFilter === value
          ? 'bg-navy-700 text-white'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );

  return (
    <AdminLayout>
      {ghlToast && (
        <div className={`fixed top-16 right-4 z-50 flex items-center gap-2 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg ${ghlToast.includes('failed') || ghlToast.includes('error') ? 'bg-red-600' : 'bg-blue-600'}`}>
          <RefreshCw className="w-4 h-4" />
          {ghlToast}
        </div>
      )}

      {atRiskCount > 0 && statusFilter !== 'at-risk' && (
        <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            {atRiskCount} active student{atRiskCount !== 1 ? 's are' : ' is'} at risk — low hours and no upcoming sessions.
          </p>
          <button
            onClick={() => setStatusFilter('at-risk')}
            className="ml-auto text-sm font-semibold text-amber-700 hover:text-amber-900 underline whitespace-nowrap"
          >
            View at-risk
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="text-gray-500 text-sm mt-1">{students.length} student{students.length !== 1 ? 's' : ''} enrolled</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setGhlSyncing(true);
              setGhlToast(null);
              const res = await fetch('/api/admin/ghl-sync', { method: 'POST' });
              const d = await res.json();
              setGhlSyncing(false);
              setGhlToast(res.ok ? `GHL: ${d.synced} synced` : (d.error ?? 'Sync failed'));
              setTimeout(() => setGhlToast(null), 4000);
            }}
            disabled={ghlSyncing}
            className="btn-secondary flex items-center gap-2"
            title="Sync all students to GoHighLevel"
          >
            <RefreshCw className={`w-4 h-4 ${ghlSyncing ? 'animate-spin' : ''}`} />
            {ghlSyncing ? 'Syncing GHL…' : 'Sync GHL'}
          </button>
          <Link href="/admin/students/attention" className="btn-secondary flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Needs Attention
          </Link>
          <button onClick={() => setOpen(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Student
          </button>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="input pl-9 w-64"
          />
        </div>
        <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl p-1">
          {filterBtn('all', 'All')}
          {filterBtn('active', 'Active')}
          {filterBtn('completed', 'Completed')}
          {filterBtn('refunded', 'Refunded')}
          <button
            onClick={() => setStatusFilter('at-risk')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === 'at-risk'
                ? 'bg-amber-600 text-white'
                : 'text-amber-700 hover:bg-amber-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            At Risk
            {atRiskCount > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                statusFilter === 'at-risk' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
              }`}>
                {atRiskCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setStatusFilter('placeholder')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === 'placeholder'
                ? 'bg-amber-500 text-white'
                : 'text-amber-700 hover:bg-amber-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Placeholder Emails
            {placeholderCount > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                statusFilter === 'placeholder' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
              }`}>
                {placeholderCount}
              </span>
            )}
          </button>
        </div>
        {placeholderCount > 0 && (
          <button
            onClick={exportPlaceholderCSV}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            Export Placeholder Emails
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-header">Name</th>
              <th className="table-header">Email</th>
              <th className="table-header">Grade</th>
              <th className="table-header">Score Progress</th>
              <th className="table-header">Tutor</th>
              <th className="table-header">Parent</th>
              <th className="table-header">Onboarding</th>
              <th className="table-header">Status</th>
              <th className="table-header w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && (
              <tr><td colSpan={9} className="table-cell text-center text-gray-400 py-8">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center">
                  <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400">{query ? 'No students match your search' : 'No students yet'}</p>
                </td>
              </tr>
            )}
            {filtered.map(s => {
              const cur = s.current_score;
              const tgt = s.target_score;
              const diff = cur != null && tgt != null ? tgt - cur : null;
              const barColor = diff == null ? 'bg-gray-200'
                : diff <= 50  ? 'bg-green-500'
                : diff <= 150 ? 'bg-amber-400'
                : 'bg-red-400';
              const barPct = cur != null && tgt != null
                ? Math.min(100, Math.max(0, (cur / tgt) * 100))
                : null;
              const studentStatus = s.status ?? 'active';
              const isComplete = studentStatus === 'completed';
              return (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <Link href={`/students/${s.id}`} className="font-medium text-navy-700 hover:text-navy-900">{s.name}</Link>
                      {isAtRisk(s) && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                          <AlertTriangle className="w-3 h-3" /> At Risk
                        </span>
                      )}
                    </div>
                    {s.preferred_availability?.timezone && (
                      <span className="text-[10px] text-gray-400">{tzAbbr(s.preferred_availability.timezone)}</span>
                    )}
                  </td>
                  <td className="table-cell text-gray-500">
                    <div className="flex items-center gap-1.5">
                      {isPlaceholderEmail(s.email) && (
                        <span title="Placeholder email"><AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" /></span>
                      )}
                      {s.email}
                    </div>
                  </td>
                  <td className="table-cell">{s.grade ? `Grade ${s.grade}` : '—'}</td>
                  <td className="table-cell">
                    {cur != null || tgt != null ? (
                      <div className="min-w-[120px]">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900 mb-1">
                          <span>{cur ?? '—'}</span>
                          {tgt != null && <><span className="text-gray-400">→</span><span className="text-navy-700">{tgt}</span></>}
                        </div>
                        {barPct != null && (
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${barPct}%` }} />
                          </div>
                        )}
                      </div>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="table-cell text-gray-500 text-sm">{tutorMap[s.id] ?? <span className="text-gray-300">—</span>}</td>
                  <td className="table-cell text-gray-500">{s.parent_name ?? '—'}</td>
                  <td className="table-cell">
                    {s.parent_email ? (() => {
                      const { complete, total } = getAdminOnboardingCount(s);
                      const cls = complete === total
                        ? 'bg-green-100 text-green-700'
                        : complete <= 1
                        ? 'bg-red-100 text-red-700'
                        : complete <= 3
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700';
                      return (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
                          {complete}/{total}
                        </span>
                      );
                    })() : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="table-cell">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[studentStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                      {studentStatus}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1 justify-end">
                      {!isComplete && (
                        <button
                          onClick={() => markComplete(s.id)}
                          disabled={markingId === s.id}
                          title="Mark Complete"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors disabled:opacity-40"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => { setConfirmDelete(s); setDeleteError(null); }}
                        disabled={deletingId === s.id}
                        title="Delete Student"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Student modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={fromRequestId ? 'Add Student (from tutor request)' : 'Add Student'} size="lg">
        <StudentForm
          onSuccess={(newId) => {
            if (newId) {
              router.push(`/students/${newId}?new=true`);
            } else {
              setOpen(false);
              load();
            }
          }}
          onCancel={() => setOpen(false)}
          prefilledData={prefilledData}
          fromRequestId={fromRequestId}
        />
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={!!confirmDelete}
        onClose={() => { setConfirmDelete(null); setDeleteError(null); }}
        title="Delete Student"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure? This will permanently delete{' '}
            <span className="font-semibold text-gray-900">{confirmDelete?.name}</span>{' '}
            and all their related records. This cannot be undone.
          </p>
          {deleteError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{deleteError}</p>
          )}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => { setConfirmDelete(null); setDeleteError(null); }}
              className="btn-secondary flex-1 justify-center"
              disabled={!!deletingId}
            >
              Cancel
            </button>
            <button
              onClick={() => confirmDelete && deleteStudent(confirmDelete.id)}
              disabled={!!deletingId}
              className="flex-1 justify-center inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deletingId ? 'Deleting…' : 'Delete Student'}
            </button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  );
}
