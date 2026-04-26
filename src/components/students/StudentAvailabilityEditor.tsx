'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { StudentAvailability } from '@/types';
import { DAY_NAMES, formatTimeString } from '@/lib/utils';
import { Plus, Trash2, Loader2 } from 'lucide-react';

interface Props {
  studentId: string;
  availability: StudentAvailability[];
  onRefresh: () => void;
}

export default function StudentAvailabilityEditor({ studentId, availability, onRefresh }: Props) {
  const [adding, setAdding]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const [newSlot, setNewSlot] = useState({ day_of_week: 1, start_time: '09:00', end_time: '17:00' });
  const supabase = createClient();

  const grouped = DAY_NAMES.map((day, i) => ({
    day,
    index: i,
    slots: availability.filter(a => a.day_of_week === i && a.is_active),
  }));

  async function addSlot() {
    setSaving(true);
    const { error } = await supabase.from('student_availability').insert({
      student_id:  studentId,
      day_of_week: newSlot.day_of_week,
      start_time:  newSlot.start_time,
      end_time:    newSlot.end_time,
      is_active:   true,
    });
    setSaving(false);
    if (!error) { setAdding(false); onRefresh(); }
  }

  async function deleteSlot(id: string) {
    await supabase.from('student_availability').delete().eq('id', id);
    onRefresh();
  }

  return (
    <div className="space-y-3">
      {grouped.map(({ day, index, slots }) => (
        <div key={index} className="flex items-start gap-4">
          <div className="w-24 pt-1">
            <span className="text-sm font-medium text-gray-700">{day.slice(0, 3)}</span>
          </div>
          <div className="flex-1 flex flex-wrap gap-2">
            {slots.length === 0 && <span className="text-sm text-gray-400 italic">No slots</span>}
            {slots.map(slot => (
              <div key={slot.id} className="flex items-center gap-1.5 bg-navy-50 border border-navy-200 rounded-lg px-3 py-1.5">
                <span className="text-sm text-navy-800 font-medium">
                  {formatTimeString(slot.start_time)} – {formatTimeString(slot.end_time)}
                </span>
                <button
                  onClick={() => deleteSlot(slot.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors ml-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {adding ? (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 mt-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Add Availability Slot</p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="label text-xs">Day</label>
              <select
                className="input text-sm"
                value={newSlot.day_of_week}
                onChange={e => setNewSlot(s => ({ ...s, day_of_week: Number(e.target.value) }))}
              >
                {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Start</label>
              <input
                type="time" className="input text-sm"
                value={newSlot.start_time}
                onChange={e => setNewSlot(s => ({ ...s, start_time: e.target.value }))}
              />
            </div>
            <div>
              <label className="label text-xs">End</label>
              <input
                type="time" className="input text-sm"
                value={newSlot.end_time}
                onChange={e => setNewSlot(s => ({ ...s, end_time: e.target.value }))}
              />
            </div>
            <button onClick={addSlot} disabled={saving} className="btn-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </button>
            <button onClick={() => setAdding(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="btn-secondary mt-3">
          <Plus className="w-4 h-4" /> Add Slot
        </button>
      )}
    </div>
  );
}
