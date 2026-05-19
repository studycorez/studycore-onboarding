'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import TutorForm from '@/components/tutors/TutorForm';
import { Badge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';
import type { Tutor } from '@/types';
import { GraduationCap, Plus, User, Link as LinkIcon, DollarSign, Loader2, Check, BarChart2, AlertTriangle, Clipboard, RefreshCw, Archive, RotateCcw } from 'lucide-react';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, differenceInDays } from 'date-fns';
import Image from 'next/image';
import Link from 'next/link';

type FormFilter = 'all' | 'complete' | 'pending' | 'utilization';
type ArchiveFilter = 'active' | 'archived' | 'all';
type PortalStatusFilter = 'all' | 'active' | 'setup_complete' | 'invite_sent' | 'invite_expired' | 'never_invited';

interface UtilRow { tutorId: string; name: string; week: number; month: number; total: number; idle: boolean; }

interface ArchiveInfo {
  futureSessionsCount: number;
  activeContracts: { id: string; studentName: string; status: string }[];
}

export default function TutorsPage() {
  const [tutors, setTutors]             = useState<Tutor[]>([]);
  const [formComplete, setFormComplete] = useState<Set<string>>(new Set());
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [monthHours,    setMonthHours]    = useState<Record<string, number>>({});
  const [loading, setLoading]             = useState(true);
  const [open, setOpen]                 = useState(false);
  const [sendingAll,    setSendingAll]    = useState(false);
  const [sentAllCount,  setSentAllCount]  = useState<number | null>(null);
  const [sendAllError,  setSendAllError]  = useState('');
  const [failedDetails,     setFailedDetails]     = useState<{ name: string; email: string; reason: string }[]>([]);
  const [failedModalOpen,   setFailedModalOpen]   = useState(false);
  const [formFilter,         setFormFilter]         = useState<FormFilter>('all');
  const [archiveFilter,      setArchiveFilter]      = useState<ArchiveFilter>('active');
  const [portalStatusFilter, setPortalStatusFilter] = useState<PortalStatusFilter>('all');
  const [utilRows,     setUtilRows]     = useState<UtilRow[]>([]);
  const [utilLoading,  setUtilLoading]  = useState(false);

  // Archive modal
  const [archiveTarget,   setArchiveTarget]   = useState<Tutor | null>(null);
  const [archiveInfo,     setArchiveInfo]     = useState<ArchiveInfo | null>(null);
  const [archiveInfoLoading, setArchiveInfoLoading] = useState(false);
  const [archiving,       setArchiving]       = useState(false);
  const [archiveError,    setArchiveError]    = useState('');

  // Reactivate
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  // Inline rate editing
  const [editingRateId,    setEditingRateId]    = useState<string | null>(null);
  const [editingRateValue, setEditingRateValue] = useState('');

  // Bulk rate modal
  const [bulkOpen,  setBulkOpen]  = useState(false);
  const [bulkRates, setBulkRates] = useState<Record<string, string>>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkSaved,  setBulkSaved]  = useState(false);

  // Reset ratings
  const [resettingRatings, setResettingRatings] = useState(false);
  const [ratingsReset,     setRatingsReset]     = useState(false);

  // Copy setup link per tutor
  const [copyingLinkId, setCopyingLinkId] = useState<string | null>(null);
  const [copiedLinkId,  setCopiedLinkId]  = useState<string | null>(null);

  const supabase = createClient();

  async function load() {
    setLoading(true);
    const monthStart = startOfMonth(new Date()).toISOString();
    const monthEnd   = endOfMonth(new Date()).toISOString();

    // Show archived tutors here — intentional all-tutor fetch; client-side archiveFilter state handles active/archived/all toggle
    const [tutorsRes, availRes, contractsRes, sessionsRes] = await Promise.all([
      supabase.from('tutors').select('*').order('name'),
      supabase.from('tutor_availability').select('tutor_id'),
      // Active student count: signed contracts per tutor
      supabase.from('contracts').select('tutor_id, student_id').eq('status', 'signed'),
      // Completed session hours this month
      supabase.from('sessions').select('tutor_id, duration_minutes')
        .eq('status', 'completed')
        .gte('scheduled_at', monthStart)
        .lte('scheduled_at', monthEnd),
    ]);

    setTutors(tutorsRes.data ?? []);
    setFormComplete(new Set((availRes.data ?? []).map(r => r.tutor_id)));

    // Unique active students per tutor (deduplicated by student_id)
    const studentMap: Record<string, Set<string>> = {};
    for (const c of contractsRes.data ?? []) {
      if (!c.tutor_id) continue;
      if (!studentMap[c.tutor_id]) studentMap[c.tutor_id] = new Set();
      studentMap[c.tutor_id].add(c.student_id);
    }
    const counts: Record<string, number> = {};
    for (const [tid, set] of Object.entries(studentMap)) counts[tid] = set.size;
    setStudentCounts(counts);

    // Total completed hours this month per tutor
    const hoursMap: Record<string, number> = {};
    for (const s of sessionsRes.data ?? []) {
      if (!s.tutor_id) continue;
      hoursMap[s.tutor_id] = (hoursMap[s.tutor_id] ?? 0) + (s.duration_minutes ?? 0);
    }
    const hours: Record<string, number> = {};
    for (const [tid, mins] of Object.entries(hoursMap)) hours[tid] = Math.round((mins / 60) * 10) / 10;
    setMonthHours(hours);

    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadUtilization() {
    setUtilLoading(true);
    const now = new Date();
    const weekStart  = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd    = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const monthEnd   = endOfMonth(now);
    const day14Ago   = subDays(now, 14);

    const [weekRes, monthRes, totalRes, recentRes, tutorsRes] = await Promise.all([
      supabase.from('sessions').select('tutor_id').in('status', ['completed', 'scheduled'])
        .gte('scheduled_at', weekStart.toISOString()).lte('scheduled_at', weekEnd.toISOString()),
      supabase.from('sessions').select('tutor_id').in('status', ['completed', 'scheduled'])
        .gte('scheduled_at', monthStart.toISOString()).lte('scheduled_at', monthEnd.toISOString()),
      supabase.from('sessions').select('tutor_id').in('status', ['completed', 'scheduled']),
      supabase.from('sessions').select('tutor_id').in('status', ['completed', 'scheduled'])
        .gte('scheduled_at', day14Ago.toISOString()),
      supabase.from('tutors').select('id, name').is('archived_at', null).order('name'),
    ]);

    const count = (rows: { tutor_id: string }[] | null, id: string) =>
      (rows ?? []).filter(r => r.tutor_id === id).length;

    const rows: UtilRow[] = (tutorsRes.data ?? []).map(t => {
      const recent = count(recentRes.data, t.id);
      return {
        tutorId: t.id,
        name:    t.name,
        week:    count(weekRes.data, t.id),
        month:   count(monthRes.data, t.id),
        total:   count(totalRes.data, t.id),
        idle:    recent === 0,
      };
    });

    rows.sort((a, b) => b.week - a.week);
    setUtilRows(rows);
    setUtilLoading(false);
  }

  useEffect(() => {
    if (formFilter === 'utilization') loadUtilization();
  }, [formFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveRate(id: string) {
    const rate = parseFloat(editingRateValue);
    if (!isNaN(rate) && rate >= 0) {
      await supabase.from('tutors').update({ hourly_rate: rate }).eq('id', id);
      setTutors(prev => prev.map(t => t.id === id ? { ...t, hourly_rate: rate } : t));
    }
    setEditingRateId(null);
  }

  function openBulkModal() {
    const zeroRate = activeTutors.filter(t => !t.hourly_rate || t.hourly_rate === 0);
    const init: Record<string, string> = {};
    zeroRate.forEach(t => { init[t.id] = ''; });
    setBulkRates(init);
    setBulkSaved(false);
    setBulkOpen(true);
  }

  async function resetAllRatings() {
    if (!window.confirm('Reset all tutor ratings to 100? This cannot be undone.')) return;
    setResettingRatings(true);
    setSendAllError('');
    const res = await fetch('/api/tutors/reset-ratings', { method: 'POST' });
    setResettingRatings(false);
    if (res.ok) {
      setRatingsReset(true);
      setTimeout(() => setRatingsReset(false), 3000);
    } else {
      const data = await res.json().catch(() => ({}));
      setSendAllError(data.error ?? `Reset failed (${res.status})`);
    }
  }

  async function copySetupLink(tutorId: string) {
    setCopyingLinkId(tutorId);
    const res = await fetch(`/api/tutors/${tutorId}/setup-link`, { method: 'POST' });
    setCopyingLinkId(null);
    if (!res.ok) return;
    const { url } = await res.json();
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopiedLinkId(tutorId);
    setTimeout(() => setCopiedLinkId(prev => prev === tutorId ? null : prev), 2500);
  }

  async function saveBulkRates() {
    setBulkSaving(true);
    const updates = Object.entries(bulkRates)
      .filter(([, v]) => v.trim() !== '' && !isNaN(parseFloat(v)))
      .map(([id, v]) => supabase.from('tutors').update({ hourly_rate: parseFloat(v) }).eq('id', id));
    await Promise.all(updates);
    setBulkSaving(false);
    setBulkSaved(true);
    await load();
    setTimeout(() => { setBulkSaved(false); setBulkOpen(false); }, 1500);
  }

  async function openArchiveModal(tutor: Tutor) {
    setArchiveTarget(tutor);
    setArchiveInfo(null);
    setArchiveError('');
    setArchiveInfoLoading(true);

    const now = new Date().toISOString();
    const [sessRes, contRes] = await Promise.all([
      supabase.from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('tutor_id', tutor.id)
        .eq('status', 'scheduled')
        .gt('scheduled_at', now),
      supabase.from('contracts')
        .select('id, status, student:students(name)')
        .eq('tutor_id', tutor.id)
        .in('status', ['signed', 'active']),
    ]);

    setArchiveInfo({
      futureSessionsCount: sessRes.count ?? 0,
      activeContracts: (contRes.data ?? []).map((c: any) => ({
        id: c.id,
        studentName: c.student?.name ?? 'Unknown',
        status: c.status,
      })),
    });
    setArchiveInfoLoading(false);
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setArchiving(true);
    setArchiveError('');
    const res = await fetch(`/api/tutors/${archiveTarget.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setArchiveError(data.error ?? `Archive failed (${res.status})`);
      setArchiving(false);
      return;
    }
    setArchiving(false);
    setArchiveTarget(null);
    load();
  }

  async function reactivateTutor(id: string) {
    if (!window.confirm('Reactivate this tutor? They will reappear in all dropdowns and can log in again.')) return;
    setReactivatingId(id);
    const res = await fetch(`/api/tutors/${id}/reactivate`, { method: 'POST' });
    setReactivatingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? `Reactivate failed (${res.status})`);
      return;
    }
    load();
  }

  // All tutors without archive filter (for counts in segmented control)
  const activeTutors   = tutors.filter(t => !(t as any).archived_at);
  const archivedTutors = tutors.filter(t => !!(t as any).archived_at);

  // Apply archive filter first, then form status filter
  const archiveFiltered =
    archiveFilter === 'active'   ? activeTutors :
    archiveFilter === 'archived' ? archivedTutors :
    tutors;

  const displayed = archiveFiltered.filter(t => {
    if (formFilter === 'complete') return formComplete.has(t.id);
    if (formFilter === 'pending')  return !formComplete.has(t.id);
    if (portalStatusFilter !== 'all') return getPortalStatus(t).filterKey === portalStatusFilter;
    return true;
  });

  const zeroRateTutors = activeTutors.filter(t => !t.hourly_rate || t.hourly_rate === 0);

  function getPortalStatus(t: Tutor): { label: string; filterKey: PortalStatusFilter; classes: string } {
    const now = new Date();
    if (t.password_hash) {
      if (t.last_login_at) return { label: 'Active',          filterKey: 'active',        classes: 'bg-green-100 text-green-700' };
      return                       { label: 'Setup complete',  filterKey: 'setup_complete', classes: 'bg-blue-100 text-blue-700'  };
    }
    if (t.setup_token) {
      const expired = t.setup_token_expires_at ? new Date(t.setup_token_expires_at) <= now : true;
      if (!expired) {
        const days = differenceInDays(now, new Date(t.setup_token_expires_at!).getTime() - 7 * 24 * 60 * 60 * 1000);
        const label = days <= 0 ? 'Invite sent today' : `Invite sent ${days}d ago`;
        return { label, filterKey: 'invite_sent', classes: 'bg-amber-100 text-amber-700' };
      }
      return { label: 'Invite expired', filterKey: 'invite_expired', classes: 'bg-red-100 text-red-600' };
    }
    return { label: 'Never invited', filterKey: 'never_invited', classes: 'bg-gray-100 text-gray-500' };
  }

  const filterBtn = (value: FormFilter, label: string) => (
    <button
      onClick={() => setFormFilter(value)}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        formFilter === value
          ? 'bg-navy-700 text-white'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );

  const archiveFilterBtn = (value: ArchiveFilter, label: string, count: number) => (
    <button
      onClick={() => setArchiveFilter(value)}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        archiveFilter === value
          ? 'bg-navy-700 text-white'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
      }`}
    >
      {label} ({count})
    </button>
  );

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tutors</h1>
          <p className="text-gray-500 text-sm mt-1">{activeTutors.length} active tutor{activeTutors.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            <button
              onClick={resetAllRatings}
              disabled={resettingRatings || ratingsReset}
              className="btn-secondary flex items-center gap-2"
              title="Reset all tutor ratings to 100"
            >
              {ratingsReset ? <Check className="w-4 h-4 text-green-600" /> : <RefreshCw className="w-4 h-4" />}
              {resettingRatings ? 'Resetting…' : ratingsReset ? 'Ratings Reset!' : 'Reset Ratings'}
            </button>
            {zeroRateTutors.length > 0 && (
              <button onClick={openBulkModal} className="btn-secondary flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Bulk Set Rates ({zeroRateTutors.length})
              </button>
            )}
            {(() => {
              const uninvitedCount = activeTutors.filter(t =>
                getPortalStatus(t).filterKey === 'never_invited' ||
                getPortalStatus(t).filterKey === 'invite_expired'
              ).length;
              return (
                <button
                  onClick={async () => {
                    if (!window.confirm(`Send setup emails to ${uninvitedCount} tutor${uninvitedCount !== 1 ? 's' : ''}?`)) return;
                    setSendingAll(true); setSentAllCount(null); setSendAllError(''); setFailedDetails([]);
                    try {
                      const res = await fetch('/api/tutors/send-bulk-invites', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mode: 'both' }),
                      });
                      const data = await res.json();
                      if (!res.ok) { setSendAllError(data.error ?? `Error ${res.status}`); }
                      else {
                        setSentAllCount(data.sent ?? 0);
                        if (data.failed > 0) {
                          setSendAllError(`${data.failed} failed to send`);
                          setFailedDetails(data.failed_details ?? []);
                          setFailedModalOpen(true);
                        }
                      }
                    } catch { setSendAllError('Network error'); }
                    setSendingAll(false);
                  }}
                  disabled={sendingAll || uninvitedCount === 0}
                  className="btn-secondary flex items-center gap-2 disabled:opacity-50"
                >
                  <LinkIcon className="w-4 h-4" />
                  {sendingAll
                    ? 'Sending…'
                    : sentAllCount !== null
                      ? `Sent to ${sentAllCount}`
                      : `Send invites to uninvited tutors (${uninvitedCount})`}
                </button>
              );
            })()}
            <button onClick={() => setOpen(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> Add Tutor
            </button>
          </div>
          {sendAllError && (
            failedDetails.length > 0 ? (
              <button
                onClick={() => setFailedModalOpen(true)}
                className="text-red-500 text-xs underline underline-offset-2 hover:text-red-700"
              >
                {sendAllError} — click to view
              </button>
            ) : (
              <p className="text-red-500 text-xs">{sendAllError}</p>
            )
          )}
        </div>
      </div>

      {/* Archive filter (Active / Archived / All) */}
      <div className="flex items-center gap-1 mb-3 bg-gray-50 border border-gray-200 rounded-xl p-1 w-fit">
        {archiveFilterBtn('active',   'Active',   activeTutors.length)}
        {archiveFilterBtn('archived', 'Archived', archivedTutors.length)}
        {archiveFilterBtn('all',      'All',      tutors.length)}
      </div>

      {/* Form status filter (hidden when viewing archived) */}
      {archiveFilter !== 'archived' && (
        <div className="flex items-center gap-1 mb-3 bg-gray-50 border border-gray-200 rounded-xl p-1 w-fit">
          {filterBtn('all', `All (${archiveFiltered.length})`)}
          {filterBtn('complete', `Form Complete (${archiveFiltered.filter(t => formComplete.has(t.id)).length})`)}
          {filterBtn('pending', `Pending (${archiveFiltered.filter(t => !formComplete.has(t.id)).length})`)}
          {filterBtn('utilization', 'Utilization')}
        </div>
      )}

      {/* Portal status filter (hidden when viewing archived or utilization) */}
      {archiveFilter !== 'archived' && formFilter !== 'utilization' && (() => {
        const psBtn = (value: PortalStatusFilter, label: string) => (
          <button
            key={value}
            onClick={() => setPortalStatusFilter(value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              portalStatusFilter === value
                ? 'bg-navy-700 text-white'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            {label}
          </button>
        );
        const counts = (key: PortalStatusFilter) => archiveFiltered.filter(t => getPortalStatus(t).filterKey === key).length;
        return (
          <div className="flex items-center gap-1 mb-5 bg-gray-50 border border-gray-200 rounded-xl p-1 w-fit">
            {psBtn('all',           `All portals (${archiveFiltered.length})`)}
            {psBtn('active',        `Active (${counts('active')})`)}
            {psBtn('setup_complete', `Setup complete (${counts('setup_complete')})`)}
            {psBtn('invite_sent',   `Invite sent (${counts('invite_sent')})`)}
            {psBtn('invite_expired', `Expired (${counts('invite_expired')})`)}
            {psBtn('never_invited', `Never invited (${counts('never_invited')})`)}
          </div>
        );
      })()}
      {(archiveFilter === 'archived' || formFilter === 'utilization') && <div className="mb-5" />}

      {formFilter === 'utilization' && archiveFilter !== 'archived' ? (
        utilLoading ? (
          <div className="card p-8 flex items-center justify-center gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading utilization…
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
              <BarChart2 className="w-5 h-5 text-navy-600" />
              <h2 className="font-semibold text-gray-900">Tutor Utilization</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header">Tutor</th>
                    <th className="table-header text-center">This Week</th>
                    <th className="table-header text-center">This Month</th>
                    <th className="table-header text-center">All Time</th>
                    <th className="table-header text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {utilRows.length === 0 ? (
                    <tr><td colSpan={5} className="table-cell text-center text-gray-400 py-8">No data</td></tr>
                  ) : utilRows.map(r => (
                    <tr key={r.tutorId} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell font-medium">
                        <Link href={`/tutors/${r.tutorId}`} className="text-navy-700 hover:underline">{r.name}</Link>
                      </td>
                      <td className="table-cell text-center">{r.week}</td>
                      <td className="table-cell text-center">{r.month}</td>
                      <td className="table-cell text-center">{r.total}</td>
                      <td className="table-cell text-center">
                        {r.idle ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Idle</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Active</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : loading ? (
        <div className="grid grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse h-48" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <GraduationCap className="w-12 h-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">
            {archiveFilter === 'archived' ? 'No archived tutors' : tutors.length === 0 ? 'No tutors yet' : 'No tutors match this filter'}
          </p>
          {tutors.length === 0 && (
            <p className="text-gray-400 text-sm">Add your first tutor to get started</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {displayed.map(t => {
            const hasForm     = formComplete.has(t.id);
            const isArchived  = !!(t as any).archived_at;
            const portalStatus = getPortalStatus(t);
            return (
              <div key={t.id} className={`relative group ${isArchived ? 'opacity-60' : ''}`}>
                <Link href={`/tutors/${t.id}`} className="card p-5 hover:shadow-md transition-shadow block">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      {t.photo_url ? (
                        <Image src={t.photo_url} alt={t.name} width={56} height={56} className="w-14 h-14 rounded-full object-cover" />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-navy-100 flex items-center justify-center">
                          <User className="w-7 h-7 text-navy-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 truncate">{t.name}</h3>
                        {isArchived ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                            Archived
                          </span>
                        ) : (
                          <>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              hasForm
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-50 text-red-600'
                            }`}>
                              {hasForm ? 'Form Complete' : 'Pending'}
                            </span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${portalStatus.classes}`}>
                              {portalStatus.label}
                            </span>
                          </>
                        )}
                        {!isArchived && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                            {studentCounts[t.id] ?? 0} student{(studentCounts[t.id] ?? 0) !== 1 ? 's' : ''}
                          </span>
                        )}
                        {!isArchived && (monthHours[t.id] ?? 0) > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                            {monthHours[t.id]}h this month
                          </span>
                        )}
                      </div>
                      <p className="text-gray-500 text-sm truncate">{t.email}</p>

                      {/* Inline rate edit — only for active tutors */}
                      {!isArchived && (
                        editingRateId === t.id ? (
                          <div
                            className="flex items-center gap-1 mt-1"
                            onClick={e => { e.preventDefault(); e.stopPropagation(); }}
                          >
                            <span className="text-gray-500 text-sm">$</span>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={editingRateValue}
                              onChange={e => setEditingRateValue(e.target.value)}
                              onBlur={() => saveRate(t.id)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveRate(t.id);
                                if (e.key === 'Escape') setEditingRateId(null);
                              }}
                              autoFocus
                              className="w-20 text-sm border border-navy-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-navy-400"
                            />
                            <span className="text-gray-500 text-sm">/hr</span>
                          </div>
                        ) : (
                          <p
                            className={`text-sm mt-1 cursor-pointer hover:underline ${
                              !t.hourly_rate || t.hourly_rate === 0
                                ? 'text-red-500 font-semibold'
                                : 'text-navy-700 font-medium'
                            }`}
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              setEditingRateId(t.id);
                              setEditingRateValue(String(t.hourly_rate ?? 0));
                            }}
                          >
                            {!t.hourly_rate || t.hourly_rate === 0 ? 'Set rate →' : `$${t.hourly_rate}/hr`}
                          </p>
                        )
                      )}

                      <div className="flex flex-wrap gap-1 mt-2">
                        {t.subjects.slice(0, 3).map(s => (
                          <Badge key={s} label={s} className="text-xs" />
                        ))}
                        {t.subjects.length > 3 && (
                          <span className="text-xs text-gray-400">+{t.subjects.length - 3}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {t.bio && (
                    <p className="text-gray-500 text-sm mt-3 line-clamp-2">{t.bio}</p>
                  )}
                </Link>
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isArchived ? (
                    <button
                      onClick={e => { e.preventDefault(); e.stopPropagation(); reactivateTutor(t.id); }}
                      disabled={reactivatingId === t.id}
                      className="p-1.5 text-gray-300 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Reactivate tutor"
                    >
                      {reactivatingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={e => { e.preventDefault(); e.stopPropagation(); copySetupLink(t.id); }}
                        disabled={copyingLinkId === t.id}
                        className="p-1.5 text-gray-300 hover:text-navy-600 hover:bg-navy-50 rounded-lg transition-colors disabled:opacity-50"
                        title={copiedLinkId === t.id ? 'Copied!' : 'Copy Setup Link'}
                      >
                        {copiedLinkId === t.id ? <Check className="w-4 h-4 text-green-600" /> : <Clipboard className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={e => { e.preventDefault(); e.stopPropagation(); openArchiveModal(t); }}
                        className="p-1.5 text-gray-300 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Archive tutor"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Tutor modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Add Tutor" size="lg">
        <TutorForm
          onSuccess={() => { setOpen(false); load(); }}
          onCancel={() => setOpen(false)}
        />
      </Modal>

      {/* Send failures modal */}
      <Modal open={failedModalOpen} onClose={() => setFailedModalOpen(false)} title="Failed to Send Setup Email">
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">
              The following {failedDetails.length} tutor{failedDetails.length !== 1 ? 's' : ''} could not receive a setup email.
              Check that their email addresses are valid and that Resend is configured correctly.
            </p>
          </div>
          <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
            {failedDetails.map((f, i) => (
              <div key={i} className="py-3 flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900">{f.name}</span>
                  <span className="text-xs text-gray-500 shrink-0">{f.email}</span>
                </div>
                <p className="text-xs text-red-600">{f.reason}</p>
              </div>
            ))}
          </div>
          <button onClick={() => setFailedModalOpen(false)} className="btn-secondary w-full justify-center">
            Close
          </button>
        </div>
      </Modal>

      {/* Bulk Set Rates modal */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk Set Hourly Rates">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            These tutors have no hourly rate set. Enter a rate for each and save all at once.
          </p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {activeTutors.filter(t => !t.hourly_rate || t.hourly_rate === 0).map(t => (
              <div key={t.id} className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-gray-800 truncate flex-1">{t.name}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-gray-500 text-sm">$</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={bulkRates[t.id] ?? ''}
                    onChange={e => setBulkRates(r => ({ ...r, [t.id]: e.target.value }))}
                    placeholder="0.00"
                    className="w-24 input text-sm py-1.5"
                  />
                  <span className="text-gray-500 text-sm">/hr</span>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={saveBulkRates}
            disabled={bulkSaving || bulkSaved}
            className="btn-primary w-full justify-center"
          >
            {bulkSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : bulkSaved ? <Check className="w-4 h-4" /> : <DollarSign className="w-4 h-4" />}
            {bulkSaving ? 'Saving…' : bulkSaved ? 'Saved!' : 'Save All Rates'}
          </button>
        </div>
      </Modal>

      {/* Archive confirmation modal */}
      <Modal
        open={!!archiveTarget}
        onClose={() => { setArchiveTarget(null); setArchiveError(''); }}
        title={`Archive ${archiveTarget?.name ?? 'Tutor'}?`}
      >
        <div className="space-y-4">
          {archiveInfoLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : archiveInfo && (
            <>
              {archiveInfo.futureSessionsCount > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    <strong>{archiveInfo.futureSessionsCount} future session{archiveInfo.futureSessionsCount !== 1 ? 's' : ''} are scheduled.</strong>{' '}
                    These will remain assigned to this tutor unless you manually reassign them.
                  </p>
                </div>
              )}

              {archiveInfo.activeContracts.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Active contracts:</p>
                  <ul className="space-y-1 max-h-36 overflow-y-auto">
                    {archiveInfo.activeContracts.map(c => (
                      <li key={c.id} className="text-sm text-gray-600 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                        {c.studentName} — {c.status}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-sm text-gray-500">
                Archived tutors will not appear in dropdowns, assignment flows, or portal login.
                Historical records (sessions, contracts, payroll) are preserved.
              </p>

              {archiveError && (
                <p className="text-sm text-red-600">{archiveError}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setArchiveTarget(null); setArchiveError(''); }}
                  className="btn-secondary flex-1 justify-center"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmArchive}
                  disabled={archiving}
                  className="flex-1 justify-center flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                  {archiving ? 'Archiving…' : 'Confirm Archive'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </AdminLayout>
  );
}
