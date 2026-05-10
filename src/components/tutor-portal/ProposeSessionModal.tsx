'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import { Loader2 } from 'lucide-react';

interface Student {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  students: Student[];
  defaultStudentId?: string;
}

// Generate time options from 7:00 AM to 10:00 PM in 30-min increments
function timeOptions() {
  const opts: { label: string; value: string }[] = [];
  for (let h = 7; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 22 && m === 30) break;
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? 'AM' : 'PM';
      const mm = m === 0 ? '00' : '30';
      const label = `${hour12}:${mm} ${ampm}`;
      const hh = String(h).padStart(2, '0');
      opts.push({ label, value: `${hh}:${mm}` });
    }
  }
  return opts;
}

const TIME_OPTIONS = timeOptions();
const DURATIONS = [30, 45, 60, 75, 90, 120];

const inputStyle = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-400 bg-white';

export default function ProposeSessionModal({ open, onClose, onSuccess, students, defaultStudentId }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    student_id: defaultStudentId ?? (students[0]?.id ?? ''),
    date: today,
    startTime: '15:00',
    duration: '60',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function setField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.student_id || !form.date || !form.startTime) {
      setError('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    setError('');

    // Build UTC datetime from local date + time
    const localDatetime = new Date(`${form.date}T${form.startTime}:00`);
    const scheduled_at = localDatetime.toISOString();

    const res = await fetch('/api/tutor-portal/propose-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: form.student_id,
        scheduled_at,
        duration_minutes: parseInt(form.duration),
        notes: form.notes || null,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to submit request. Please try again.');
      return;
    }

    onSuccess();
    onClose();
    setForm({ student_id: defaultStudentId ?? (students[0]?.id ?? ''), date: today, startTime: '15:00', duration: '60', notes: '' });
  }

  return (
    <Modal open={open} onClose={onClose} title="Propose a Session">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Student</label>
          <select
            value={form.student_id}
            onChange={e => setField('student_id', e.target.value)}
            className={inputStyle}
            required
          >
            <option value="">Select a student…</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={form.date}
              min={today}
              onChange={e => setField('date', e.target.value)}
              className={inputStyle}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
            <select
              value={form.startTime}
              onChange={e => setField('startTime', e.target.value)}
              className={inputStyle}
              required
            >
              {TIME_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
          <select
            value={form.duration}
            onChange={e => setField('duration', e.target.value)}
            className={inputStyle}
          >
            {DURATIONS.map(d => (
              <option key={d} value={d}>{d} min</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            value={form.notes}
            onChange={e => setField('notes', e.target.value)}
            placeholder="Topics to cover, special requests, etc."
            rows={3}
            className={inputStyle}
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <p className="text-xs text-gray-400">
          This request will be sent to your admin for approval. You&apos;ll receive a confirmation email once approved.
        </p>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="btn-primary flex-1 justify-center">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {submitting ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
