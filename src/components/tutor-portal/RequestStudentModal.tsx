'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import { Loader2, CheckCircle } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const inputStyle = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-400 bg-white';

export default function RequestStudentModal({ open, onClose }: Props) {
  const [form, setForm] = useState({
    student_name: '',
    parent_name: '',
    parent_email: '',
    parent_phone: '',
    grade: '',
    target_score: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [error, setError] = useState('');

  function setField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleClose() {
    onClose();
    // Reset after close animation
    setTimeout(() => {
      setSubmitted(false);
      setError('');
      setForm({ student_name: '', parent_name: '', parent_email: '', parent_phone: '', grade: '', target_score: '', notes: '' });
    }, 300);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const res = await fetch('/api/tutor-portal/request-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Something went wrong. Please try again.');
      return;
    }

    setSubmitted(true);
  }

  return (
    <Modal open={open} onClose={handleClose} title="Request New Student">
      {submitted ? (
        <div className="flex flex-col items-center text-center py-6 gap-4">
          <CheckCircle className="w-12 h-12 text-green-500" />
          <div>
            <p className="font-semibold text-gray-900 text-lg">Request submitted!</p>
            <p className="text-gray-500 text-sm mt-1 max-w-xs">
              We&apos;ll reach out to the family and set everything up within 24 hours.
            </p>
          </div>
          <button onClick={handleClose} className="btn-primary mt-2">Done</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Student Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.student_name}
                onChange={e => setField('student_name', e.target.value)}
                className={inputStyle}
                placeholder="Jane Smith"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Parent Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.parent_name}
                onChange={e => setField('parent_name', e.target.value)}
                className={inputStyle}
                placeholder="John Smith"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Parent Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={form.parent_email}
                onChange={e => setField('parent_email', e.target.value)}
                className={inputStyle}
                placeholder="parent@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Phone</label>
              <input
                type="tel"
                value={form.parent_phone}
                onChange={e => setField('parent_phone', e.target.value)}
                className={inputStyle}
                placeholder="(555) 000-0000"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Student Grade</label>
              <select
                value={form.grade}
                onChange={e => setField('grade', e.target.value)}
                className={inputStyle}
              >
                <option value="">Select grade…</option>
                {[6, 7, 8, 9, 10, 11, 12].map(g => (
                  <option key={g} value={g}>Grade {g}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SAT Target Score</label>
              <input
                type="number"
                min={400}
                max={1600}
                step={10}
                value={form.target_score}
                onChange={e => setField('target_score', e.target.value)}
                className={inputStyle}
                placeholder="e.g. 1400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              placeholder="Any additional context (schedule preferences, subject focus, urgency, etc.)"
              rows={3}
              className={inputStyle}
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={handleClose} className="btn-secondary flex-1 justify-center">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1 justify-center">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
