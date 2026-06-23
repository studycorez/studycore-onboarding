'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { Loader2, CheckCircle } from 'lucide-react';

const inputStyle = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-400 bg-white';

export default function RequestStudentPage() {
  const { tutor, loading: authLoading } = useTutorAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    student_name: '',
    parent_name: '',
    parent_email: '',
    parent_phone: '',
    grade: '',
    target_score: '',
    test_date: '',
    school: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  function setField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const res = await fetch('/api/tutor-portal/student-requests', {
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
    setTimeout(() => router.push('/tutor-portal/my-requests'), 2000);
  }

  if (authLoading) return null;

  return (
    <TutorPortalLayout tutor={tutor}>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Request New Student</h1>
        <p className="text-gray-500 text-sm mb-6">
          Submit a request and admin will set up the student within 24 hours.
        </p>

        {submitted ? (
          <div className="card p-8 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Request submitted!</h2>
            <p className="text-gray-500 text-sm">
              We&apos;ll reach out to the family and set everything up within 24 hours.
              Redirecting to your requests…
            </p>
          </div>
        ) : (
          <div className="card p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Student Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text" value={form.student_name}
                    onChange={e => setField('student_name', e.target.value)}
                    className={inputStyle} placeholder="Jane Smith" required minLength={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parent Full Name</label>
                  <input
                    type="text" value={form.parent_name}
                    onChange={e => setField('parent_name', e.target.value)}
                    className={inputStyle} placeholder="John Smith"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parent Email</label>
                  <input
                    type="email" value={form.parent_email}
                    onChange={e => setField('parent_email', e.target.value)}
                    className={inputStyle} placeholder="parent@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parent Phone</label>
                  <input
                    type="tel" value={form.parent_phone}
                    onChange={e => setField('parent_phone', e.target.value)}
                    className={inputStyle} placeholder="(555) 000-0000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Student Grade</label>
                  <select value={form.grade} onChange={e => setField('grade', e.target.value)} className={inputStyle}>
                    <option value="">Select grade…</option>
                    {[6, 7, 8, 9, 10, 11, 12].map(g => (
                      <option key={g} value={g}>Grade {g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SAT Target Score</label>
                  <input
                    type="number" min={400} max={1600} step={10}
                    value={form.target_score}
                    onChange={e => setField('target_score', e.target.value)}
                    className={inputStyle} placeholder="e.g. 1400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test Date</label>
                  <input
                    type="date" value={form.test_date}
                    onChange={e => setField('test_date', e.target.value)}
                    className={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">School</label>
                  <input
                    type="text" value={form.school}
                    onChange={e => setField('school', e.target.value)}
                    className={inputStyle} placeholder="Lincoln High School"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setField('notes', e.target.value)}
                  placeholder="Any additional context (schedule preferences, subject focus, urgency, etc.)"
                  rows={3} className={inputStyle}
                />
              </div>

              {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => router.back()} className="btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 justify-center">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </TutorPortalLayout>
  );
}
