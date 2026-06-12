'use client';

import { useEffect, useState } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface Student {
  id: string;
  name: string;
  email: string;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgoStr(): string {
  return new Date(Date.now() - THIRTY_DAYS_MS).toISOString().slice(0, 10);
}

export default function BacklogNewPage() {
  const { tutor, loading: authLoading } = useTutorAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);

  const [studentId, setStudentId] = useState('');
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [whatCovered, setWhatCovered] = useState('');
  const [tutorNotes, setTutorNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !tutor) return;
    fetch('/api/tutor-portal/my-students')
      .then(r => r.json())
      .then(data => setStudents(data.students ?? []))
      .catch(() => {})
      .finally(() => setStudentsLoading(false));
  }, [authLoading, tutor]);

  function validate(): string | null {
    if (!studentId) return 'Please select a student.';
    if (!date) return 'Please select a date.';
    if (!time) return 'Please select a time.';

    const scheduled = new Date(`${date}T${time}`);
    if (isNaN(scheduled.getTime())) return 'Invalid date or time.';
    if (scheduled.getTime() > Date.now()) return 'Session date must be in the past.';
    if (Date.now() - scheduled.getTime() > THIRTY_DAYS_MS) return 'Session must be within the last 30 days.';

    if (duration < 15 || duration > 240) return 'Duration must be between 15 and 240 minutes.';

    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setValidationError(null);

    const vErr = validate();
    if (vErr) {
      setValidationError(vErr);
      return;
    }

    setSubmitting(true);

    const scheduled = new Date(`${date}T${time}`);

    try {
      const res = await fetch('/api/tutor-portal/backlog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          scheduled_at: scheduled.toISOString(),
          duration_minutes: duration,
          what_covered: whatCovered.trim() || null,
          tutor_notes: tutorNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }

      window.location.href = '/tutor-portal/backlog?submitted=1';
    } catch (err: any) {
      setError(err.message ?? 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <TutorPortalLayout tutor={tutor}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </TutorPortalLayout>
    );
  }

  return (
    <TutorPortalLayout tutor={tutor}>
      <div className="max-w-[500px] mx-auto px-4 py-6">
        <Link
          href="/tutor-portal/backlog"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Backlog
        </Link>

        <h1 className="text-xl font-bold text-gray-900 mb-1">Submit a session</h1>
        <p className="text-sm text-gray-500 mb-6">
          Log a session that happened but wasn&apos;t scheduled. Admin will review and approve.
        </p>

        {studentsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
            <span className="text-gray-400 text-sm">Loading students...</span>
          </div>
        ) : students.length === 0 ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-700">
            You don&apos;t have any assigned students with a signed contract. Contact admin to get assigned.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Student <span className="text-red-400">*</span>
              </label>
              <select
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select a student —</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  max={todayStr()}
                  min={thirtyDaysAgoStr()}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time <span className="text-red-400">*</span>
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duration (minutes) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                min={15}
                max={240}
                step={15}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                What was covered <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={whatCovered}
                onChange={e => setWhatCovered(e.target.value)}
                rows={3}
                placeholder="What topics did you cover?"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tutor notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={tutorNotes}
                onChange={e => setTutorNotes(e.target.value)}
                rows={2}
                placeholder="Any internal notes for admin (optional)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {validationError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {validationError}
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Submit for Review
            </button>
          </form>
        )}
      </div>
    </TutorPortalLayout>
  );
}
