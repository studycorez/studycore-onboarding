'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { DAY_NAMES, formatTimeString } from '@/lib/utils';
import { Plus, Trash2, Loader2, Check } from 'lucide-react';

interface Slot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export default function TutorAvailabilityPage() {
  const { tutor, loading: authLoading } = useTutorAuth();

  const [slots,    setSlots]    = useState<Slot[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [adding,   setAdding]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error,    setError]    = useState('');
  const [newSlot,  setNewSlot]  = useState({ day_of_week: 1, start_time: '09:00', end_time: '17:00' });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/tutor-auth/availability');
    if (res.ok) setSlots(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { if (!authLoading) load(); }, [authLoading, load]);

  async function addSlot() {
    setSaving(true);
    setError('');
    const res = await fetch('/api/tutor-auth/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSlot),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? 'Failed to save');
    } else {
      setSaved(true);
      setAdding(false);
      await load();
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  async function deleteSlot(id: string) {
    setDeletingId(id);
    await fetch('/api/tutor-auth/availability', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setDeletingId(null);
    await load();
  }

  const grouped = DAY_NAMES.map((day, i) => ({
    day,
    index: i,
    slots: slots.filter(s => s.day_of_week === i && s.is_active),
  }));

  if (authLoading) return null;

  return (
    <TutorPortalLayout tutor={tutor}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Availability</h1>
        <p className="text-gray-500 text-sm mt-1">Set the times you're available to tutor each week.</p>
      </div>

      <div className="card p-6 max-w-2xl">
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(({ day, index, slots: daySlots }) => (
              <div key={index} className="flex items-start gap-4">
                <div className="w-28 pt-1.5">
                  <span className="text-sm font-medium text-gray-700">{day}</span>
                </div>
                <div className="flex-1 flex flex-wrap gap-2">
                  {daySlots.length === 0 && (
                    <span className="text-sm text-gray-400 italic pt-1">No slots</span>
                  )}
                  {daySlots.map(slot => (
                    <div key={slot.id} className="flex items-center gap-1.5 bg-navy-50 border border-navy-200 rounded-lg px-3 py-1.5">
                      <span className="text-sm text-navy-800 font-medium">
                        {formatTimeString(slot.start_time)} – {formatTimeString(slot.end_time)}
                      </span>
                      <button
                        onClick={() => deleteSlot(slot.id)}
                        disabled={deletingId === slot.id}
                        className="text-gray-400 hover:text-red-500 transition-colors ml-1 disabled:opacity-40"
                      >
                        {deletingId === slot.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {adding ? (
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 mt-5">
            <p className="text-sm font-medium text-gray-700 mb-3">Add Availability Slot</p>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[120px]">
                <label className="block text-xs font-medium text-gray-600 mb-1">Day</label>
                <select
                  className="input text-sm"
                  value={newSlot.day_of_week}
                  onChange={e => setNewSlot(s => ({ ...s, day_of_week: Number(e.target.value) }))}
                >
                  {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start</label>
                <input
                  type="time" className="input text-sm"
                  value={newSlot.start_time}
                  onChange={e => setNewSlot(s => ({ ...s, start_time: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">End</label>
                <input
                  type="time" className="input text-sm"
                  value={newSlot.end_time}
                  onChange={e => setNewSlot(s => ({ ...s, end_time: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={addSlot} disabled={saving} className="btn-primary flex items-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setAdding(false)} className="btn-secondary">Cancel</button>
              </div>
            </div>
            {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
          </div>
        ) : (
          <button
            onClick={() => { setAdding(true); setSaved(false); setError(''); }}
            className="btn-secondary mt-5 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Slot
          </button>
        )}
      </div>
    </TutorPortalLayout>
  );
}
