'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import TutorForm from '@/components/tutors/TutorForm';
import { Badge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';
import type { Tutor } from '@/types';
import { GraduationCap, Plus, User, Trash2, Link as LinkIcon, DollarSign, Loader2, Check, BarChart2 } from 'lucide-react';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from 'date-fns';
import Image from 'next/image';
import Link from 'next/link';

type FormFilter = 'all' | 'complete' | 'pending' | 'utilization';

interface UtilRow { tutorId: string; name: string; week: number; month: number; total: number; idle: boolean; }

export default function TutorsPage() {
  const [tutors, setTutors]             = useState<Tutor[]>([]);
  const [formComplete, setFormComplete] = useState<Set<string>>(new Set());
  const [avgRatings, setAvgRatings]     = useState<Record<string, number>>({});
  const [loading, setLoading]           = useState(true);
  const [open, setOpen]                 = useState(false);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [sendingAll,   setSendingAll]   = useState(false);
  const [sentAllCount, setSentAllCount] = useState<number | null>(null);
  const [sendAllError, setSendAllError] = useState('');
  const [formFilter,   setFormFilter]   = useState<FormFilter>('all');
  const [utilRows,     setUtilRows]     = useState<UtilRow[]>([]);
  const [utilLoading,  setUtilLoading]  = useState(false);

  // Inline rate editing
  const [editingRateId,    setEditingRateId]    = useState<string | null>(null);
  const [editingRateValue, setEditingRateValue] = useState('');

  // Bulk rate modal
  const [bulkOpen,  setBulkOpen]  = useState(false);
  const [bulkRates, setBulkRates] = useState<Record<string, string>>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkSaved,  setBulkSaved]  = useState(false);

  const supabase = createClient();

  async function deleteTutor(id: string) {
    setDeletingId(id);
    await fetch(`/api/tutors/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    load();
  }

  async function load() {
    setLoading(true);
    const [tutorsRes, availRes, ratingsRes] = await Promise.all([
      supabase.from('tutors').select('*').order('name'),
      supabase.from('tutor_availability').select('tutor_id'),
      supabase.from('sessions').select('tutor_id, tutor_rating').not('tutor_rating', 'is', null),
    ]);
    setTutors(tutorsRes.data ?? []);
    setFormComplete(new Set((availRes.data ?? []).map(r => r.tutor_id)));

    // Compute avg rating per tutor
    const ratingMap: Record<string, number[]> = {};
    for (const s of ratingsRes.data ?? []) {
      if (!s.tutor_id || s.tutor_rating == null) continue;
      if (!ratingMap[s.tutor_id]) ratingMap[s.tutor_id] = [];
      ratingMap[s.tutor_id].push(s.tutor_rating);
    }
    const avgs: Record<string, number> = {};
    for (const [tid, ratings] of Object.entries(ratingMap)) {
      avgs[tid] = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    }
    setAvgRatings(avgs);
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
      supabase.from('tutors').select('id, name').order('name'),
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
    const zeroRate = tutors.filter(t => !t.hourly_rate || t.hourly_rate === 0);
    const init: Record<string, string> = {};
    zeroRate.forEach(t => { init[t.id] = ''; });
    setBulkRates(init);
    setBulkSaved(false);
    setBulkOpen(true);
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

  const displayed = tutors.filter(t => {
    if (formFilter === 'complete') return formComplete.has(t.id);
    if (formFilter === 'pending')  return !formComplete.has(t.id);
    return true;
  });

  const zeroRateTutors = tutors.filter(t => !t.hourly_rate || t.hourly_rate === 0);

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

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tutors</h1>
          <p className="text-gray-500 text-sm mt-1">{tutors.length} tutor{tutors.length !== 1 ? 's' : ''} on the team</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            {zeroRateTutors.length > 0 && (
              <button onClick={openBulkModal} className="btn-secondary flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Bulk Set Rates ({zeroRateTutors.length})
              </button>
            )}
            <button
              onClick={async () => {
                setSendingAll(true); setSentAllCount(null); setSendAllError('');
                try {
                  const res = await fetch('/api/tutors/send-setup-all', { method: 'POST' });
                  const data = await res.json();
                  if (!res.ok) { setSendAllError(data.error ?? `Error ${res.status}`); }
                  else {
                    setSentAllCount(data.sent ?? 0);
                    if (data.failed > 0) setSendAllError(`${data.failed} failed to send`);
                  }
                } catch { setSendAllError('Network error'); }
                setSendingAll(false);
              }}
              disabled={sendingAll}
              className="btn-secondary flex items-center gap-2"
            >
              <LinkIcon className="w-4 h-4" />
              {sendingAll ? 'Sending…' : sentAllCount !== null ? `Sent to ${sentAllCount}` : 'Send Setup Link to All'}
            </button>
            <button onClick={() => setOpen(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> Add Tutor
            </button>
          </div>
          {sendAllError && <p className="text-red-500 text-xs">{sendAllError}</p>}
        </div>
      </div>

      {/* Form status filter */}
      <div className="flex items-center gap-1 mb-5 bg-gray-50 border border-gray-200 rounded-xl p-1 w-fit">
        {filterBtn('all', `All (${tutors.length})`)}
        {filterBtn('complete', `Form Complete (${tutors.filter(t => formComplete.has(t.id)).length})`)}
        {filterBtn('pending', `Pending (${tutors.filter(t => !formComplete.has(t.id)).length})`)}
        {filterBtn('utilization', 'Utilization')}
      </div>

      {formFilter === 'utilization' ? (
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
            {tutors.length === 0 ? 'No tutors yet' : 'No tutors match this filter'}
          </p>
          {tutors.length === 0 && (
            <p className="text-gray-400 text-sm">Add your first tutor to get started</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {displayed.map(t => {
            const hasForm = formComplete.has(t.id);
            return (
              <div key={t.id} className="relative group">
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
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          hasForm
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-50 text-red-600'
                        }`}>
                          {hasForm ? 'Form Complete' : 'Pending'}
                        </span>
                      </div>
                      <p className="text-gray-500 text-sm truncate">{t.email}</p>
                      {avgRatings[t.id] != null && (
                        <p className="text-amber-500 text-xs mt-0.5">
                          {'★'.repeat(Math.round(avgRatings[t.id]))}{'☆'.repeat(5 - Math.round(avgRatings[t.id]))}
                          {' '}{avgRatings[t.id].toFixed(1)}
                        </p>
                      )}

                      {/* Inline rate edit */}
                      {editingRateId === t.id ? (
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
                <button
                  onClick={() => {
                    if (window.confirm(`Delete ${t.name}? This cannot be undone.`)) deleteTutor(t.id);
                  }}
                  disabled={deletingId === t.id}
                  className="absolute top-3 right-3 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                  title="Delete tutor"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
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

      {/* Bulk Set Rates modal */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk Set Hourly Rates">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            These tutors have no hourly rate set. Enter a rate for each and save all at once.
          </p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {tutors.filter(t => !t.hourly_rate || t.hourly_rate === 0).map(t => (
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
    </AdminLayout>
  );
}
