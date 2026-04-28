'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import TutorForm from '@/components/tutors/TutorForm';
import { Badge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';
import type { Tutor } from '@/types';
import { GraduationCap, Plus, User, Trash2, Link as LinkIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

type FormFilter = 'all' | 'complete' | 'pending';

export default function TutorsPage() {
  const [tutors, setTutors]             = useState<Tutor[]>([]);
  const [formComplete, setFormComplete] = useState<Set<string>>(new Set());
  const [loading, setLoading]           = useState(true);
  const [open, setOpen]                 = useState(false);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [sendingAll,   setSendingAll]   = useState(false);
  const [sentAllCount, setSentAllCount] = useState<number | null>(null);
  const [sendAllError, setSendAllError] = useState('');
  const [formFilter,   setFormFilter]   = useState<FormFilter>('all');
  const supabase = createClient();

  async function deleteTutor(id: string) {
    setDeletingId(id);
    await fetch(`/api/tutors/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    load();
  }

  async function load() {
    setLoading(true);
    const [tutorsRes, availRes] = await Promise.all([
      supabase.from('tutors').select('*').order('name'),
      supabase.from('tutor_availability').select('tutor_id'),
    ]);
    setTutors(tutorsRes.data ?? []);
    setFormComplete(new Set((availRes.data ?? []).map(r => r.tutor_id)));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const displayed = tutors.filter(t => {
    if (formFilter === 'complete') return formComplete.has(t.id);
    if (formFilter === 'pending')  return !formComplete.has(t.id);
    return true;
  });

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
      </div>

      {loading ? (
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
                      <p className="text-navy-700 font-medium text-sm mt-1">${t.hourly_rate}/hr</p>
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

      <Modal open={open} onClose={() => setOpen(false)} title="Add Tutor" size="lg">
        <TutorForm
          onSuccess={() => { setOpen(false); load(); }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </AdminLayout>
  );
}
