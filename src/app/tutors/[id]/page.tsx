'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import TutorForm from '@/components/tutors/TutorForm';
import SendContractForm from '@/components/contracts/SendContractForm';
import AvailabilityEditor from '@/components/tutors/AvailabilityEditor';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';
import type { Tutor, TutorAvailability, Session } from '@/types';
import { User, Mail, Phone, DollarSign, Edit, ArrowLeft, FileText, Trash2, Link as LinkIcon, CheckCircle, Eye } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils';

export default function TutorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tutor, setTutor]           = useState<Tutor | null>(null);
  const [availability, setAvail]    = useState<TutorAvailability[]>([]);
  const [sessions, setSessions]     = useState<Session[]>([]);
  const [editOpen, setEditOpen]         = useState(false);
  const [contractOpen, setContractOpen]   = useState(false);
  const [deleteOpen, setDeleteOpen]       = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [sendingSetup, setSendingSetup]   = useState(false);
  const [setupSent,    setSetupSent]      = useState(false);
  const [setupError,   setSetupError]     = useState('');
  const [loading, setLoading]       = useState(true);
  const [preselectedStudent, setPreselectedStudent] = useState<string | undefined>(undefined);
  const [editingRate, setEditingRate] = useState(false);
  const [rateValue,   setRateValue]   = useState('');
  const supabase = createClient();

  const load = useCallback(async () => {
    const [t, a, s] = await Promise.all([
      supabase.from('tutors').select('*').eq('id', id).single(),
      supabase.from('tutor_availability').select('*').eq('tutor_id', id).order('day_of_week').order('start_time'),
      supabase.from('sessions').select('*, student:students(name)').eq('tutor_id', id).order('scheduled_at', { ascending: false }).limit(20),
    ]);
    setTutor(t.data);
    setAvail(a.data ?? []);
    setSessions(s.data as any ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Auto-open contract modal if redirected from tutor switch
  useEffect(() => {
    const contractStudent = searchParams.get('contractStudent');
    if (contractStudent) {
      setPreselectedStudent(contractStudent);
      setContractOpen(true);
    }
  }, [searchParams]);

  async function openTutorPortal() {
    const res = await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'tutor', id }),
    });
    if (!res.ok) { alert('Failed to generate preview link.'); return; }
    const { token } = await res.json();
    window.open(`/tutor-portal/impersonate?token=${encodeURIComponent(token)}`, '_blank');
  }

  async function handleSendSetup() {
    setSendingSetup(true);
    setSetupError('');
    try {
      const res = await fetch(`/api/tutors/${id}/send-setup`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSetupError(body.error ?? `Failed (${res.status})`);
      } else {
        setSetupSent(true);
        setTimeout(() => setSetupSent(false), 4000);
      }
    } catch {
      setSetupError('Network error — please try again');
    }
    setSendingSetup(false);
  }

  async function saveRate() {
    const rate = parseFloat(rateValue);
    if (!isNaN(rate) && rate >= 0) {
      await supabase.from('tutors').update({ hourly_rate: rate }).eq('id', id);
      setTutor(prev => prev ? { ...prev, hourly_rate: rate } : prev);
    }
    setEditingRate(false);
  }

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/tutors/${id}`, { method: 'DELETE' });
    router.push('/tutors');
  }

  if (loading) return <AdminLayout><div className="animate-pulse h-64 card rounded-xl" /></AdminLayout>;
  if (!tutor) return <AdminLayout><p className="text-gray-500">Tutor not found.</p></AdminLayout>;

  const noShowCount = sessions.filter((s: any) =>
    s.status === 'no_show_tutor' || s.status === 'no_show_both'
  ).length;

  const completedSessions = sessions.filter((s: any) => s.status === 'completed');
  const ratedSessions = completedSessions.filter((s: any) => s.tutor_rating != null);
  const avgRating = ratedSessions.length
    ? ratedSessions.reduce((sum: number, s: any) => sum + s.tutor_rating, 0) / ratedSessions.length
    : null;
  const completionRate = sessions.length
    ? Math.round((completedSessions.length / sessions.length) * 100)
    : null;

  return (
    <AdminLayout>
      <div className="mb-6">
        <Link href="/tutors" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Tutors
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{tutor.name}</h1>
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-2">
            <button
              onClick={openTutorPortal}
              className="btn-secondary text-sm flex items-center gap-2"
              title="Preview tutor portal"
            >
              <Eye className="w-4 h-4" /> Tutor View
            </button>
            <button onClick={handleSendSetup} disabled={sendingSetup} className="btn-secondary text-sm flex items-center gap-2">
              {setupSent ? <CheckCircle className="w-4 h-4 text-green-600" /> : <LinkIcon className="w-4 h-4" />}
              {sendingSetup ? 'Sending…' : setupSent ? 'Sent!' : 'Send Portal Setup Link'}
            </button>
            <button onClick={() => setContractOpen(true)} className="btn-primary text-sm">
              <FileText className="w-4 h-4" /> Assign Student + Send Contract
            </button>
            <button onClick={() => setEditOpen(true)} className="btn-secondary">
              <Edit className="w-4 h-4" /> Edit
            </button>
          </div>
            {setupError && <p className="text-red-500 text-xs">{setupError}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="col-span-1 space-y-5">
          <div className="card p-6">
            <div className="text-center mb-5">
              {tutor.photo_url ? (
                <Image src={tutor.photo_url} alt={tutor.name} width={96} height={96} className="w-24 h-24 rounded-full object-cover mx-auto" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-navy-100 flex items-center justify-center mx-auto">
                  <User className="w-12 h-12 text-navy-400" />
                </div>
              )}
              <h2 className="font-bold text-gray-900 text-lg mt-3">{tutor.name}</h2>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2.5 text-gray-600">
                <Mail className="w-4 h-4 flex-shrink-0" />{tutor.email}
              </div>
              {tutor.phone && <div className="flex items-center gap-2.5 text-gray-600"><Phone className="w-4 h-4" />{tutor.phone}</div>}
              {editingRate ? (
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-navy-700" />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={rateValue}
                    onChange={e => setRateValue(e.target.value)}
                    onBlur={saveRate}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveRate();
                      if (e.key === 'Escape') setEditingRate(false);
                    }}
                    autoFocus
                    className="w-20 text-sm border border-navy-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-navy-400"
                  />
                  <span className="text-sm text-gray-500">/hour</span>
                </div>
              ) : (
                <div
                  className="flex items-center gap-2.5 cursor-pointer group"
                  onClick={() => { setEditingRate(true); setRateValue(String(tutor.hourly_rate ?? 0)); }}
                  title="Click to edit rate"
                >
                  <DollarSign className="w-4 h-4 text-navy-700" />
                  <span className={`font-semibold group-hover:underline ${!tutor.hourly_rate || tutor.hourly_rate === 0 ? 'text-red-500' : 'text-navy-700'}`}>
                    {!tutor.hourly_rate || tutor.hourly_rate === 0 ? 'Set rate →' : `$${tutor.hourly_rate}/hour`}
                  </span>
                </div>
              )}
              {tutor.payment_info && (
                <div className="bg-gray-50 rounded-lg p-3 text-gray-600 text-xs">
                  <p className="font-medium text-gray-700 mb-1">Payment Info</p>
                  {tutor.payment_info}
                </div>
              )}
            </div>

            {tutor.bio && <p className="text-gray-500 text-sm mt-4 border-t border-gray-100 pt-4">{tutor.bio}</p>}

            <div className="mt-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Subjects</p>
              <div className="flex flex-wrap gap-1.5">
                {tutor.subjects.map(s => <Badge key={s} label={s} />)}
              </div>
            </div>

            {noShowCount > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">No-Shows</p>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                  {noShowCount} session{noShowCount !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {/* Performance metrics */}
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <p className="text-xs font-medium text-gray-500 mb-2">Performance (last 20 sessions)</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Completed</span>
                <span className="font-medium text-gray-900">{completedSessions.length} / {sessions.length}</span>
              </div>
              {completionRate !== null && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Completion rate</span>
                  <span className={`font-medium ${completionRate >= 80 ? 'text-green-600' : 'text-orange-600'}`}>
                    {completionRate}%
                  </span>
                </div>
              )}
              {avgRating !== null ? (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Avg rating</span>
                  <span className="font-medium text-amber-600">
                    {'★'.repeat(Math.round(avgRating))}{'☆'.repeat(5 - Math.round(avgRating))} {avgRating.toFixed(1)}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Avg rating</span>
                  <span className="text-gray-400 italic">No ratings yet</span>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column */}
        <div className="col-span-2 space-y-6">
          {/* Availability Editor */}
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Weekly Availability</h2>
            <AvailabilityEditor tutorId={id} availability={availability} onRefresh={load} />
          </div>

          {/* Session History */}
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Session History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header">Date</th>
                    <th className="table-header">Student</th>
                    <th className="table-header">Duration</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sessions.length === 0 && (
                    <tr><td colSpan={5} className="table-cell text-gray-400 text-center py-6">No sessions yet</td></tr>
                  )}
                  {sessions.map((s: any) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="table-cell">{formatDateTime(s.scheduled_at)}</td>
                      <td className="table-cell">{s.student?.name ?? '—'}</td>
                      <td className="table-cell">{s.duration_minutes} min</td>
                      <td className="table-cell"><StatusBadge status={s.status} /></td>
                      <td className="table-cell"><StatusBadge status={s.payment_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Delete button */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <button
          onClick={() => setDeleteOpen(true)}
          className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 font-medium"
        >
          <Trash2 className="w-4 h-4" />
          Delete Tutor
        </button>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Tutor" size="lg">
        <TutorForm
          tutor={tutor}
          onSuccess={() => { setEditOpen(false); load(); }}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      {/* Delete confirmation modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Tutor">
        <p className="text-gray-600 text-sm mb-6">
          Are you sure? This will permanently delete <span className="font-semibold text-gray-900">{tutor.name}</span> and all their availability slots.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDeleteOpen(false)} className="btn-secondary" disabled={deleting}>
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {deleting ? 'Deleting…' : 'Delete Tutor'}
          </button>
        </div>
      </Modal>

      <Modal open={contractOpen} onClose={() => { setContractOpen(false); setPreselectedStudent(undefined); }} title="Send Contract" size="lg">
        <SendContractForm
          tutorId={id}
          defaultRate={tutor.hourly_rate}
          defaultStudentId={preselectedStudent}
          onSuccess={() => { setContractOpen(false); setPreselectedStudent(undefined); }}
          onCancel={() => { setContractOpen(false); setPreselectedStudent(undefined); }}
        />
      </Modal>

    </AdminLayout>
  );
}
