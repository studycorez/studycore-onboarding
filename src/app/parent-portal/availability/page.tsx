'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useParentAuth } from '@/hooks/useParentAuth';
import ParentPortalLayout from '@/components/parent-portal/ParentPortalLayout';
import { Loader2 } from 'lucide-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const US_TIMEZONES = [
  { label: 'Eastern (ET)',   value: 'America/New_York' },
  { label: 'Central (CT)',   value: 'America/Chicago' },
  { label: 'Mountain (MT)',  value: 'America/Denver' },
  { label: 'Pacific (PT)',   value: 'America/Los_Angeles' },
  { label: 'Alaska (AKT)',   value: 'America/Anchorage' },
  { label: 'Hawaii (HST)',   value: 'Pacific/Honolulu' },
];

function timeOptions() {
  const opts: { label: string; value: string }[] = [];
  for (let h = 7; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 22 && m === 30) break;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hour = h % 12 || 12;
      const min = m === 0 ? '00' : '30';
      opts.push({
        label: `${hour}:${min} ${ampm}`,
        value: `${String(h).padStart(2, '0')}:${min}`,
      });
    }
  }
  return opts;
}

const TIME_OPTS = timeOptions();

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

function AvailabilityForm() {
  const { parent, loading } = useParentAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const studentId = searchParams.get('studentId');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const defaultTz = US_TIMEZONES.find(t => t.value === browserTz)?.value ?? 'America/New_York';

  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default
  const [earliestStart, setEarliestStart] = useState('15:00');  // 3 PM
  const [latestEnd, setLatestEnd] = useState('20:00');           // 8 PM
  const [timezone, setTimezone] = useState(defaultTz);
  const [notes, setNotes] = useState('');

  const student = parent?.students.find(s => s.id === studentId);

  // Pre-fill if already submitted
  useEffect(() => {
    if (!student?.preferred_availability) return;
    const pa = student.preferred_availability;
    setDays(pa.days ?? [1, 2, 3, 4, 5]);
    setEarliestStart(pa.earliest_start ?? '15:00');
    setLatestEnd(pa.latest_end ?? '20:00');
    setTimezone(pa.timezone ?? defaultTz);
    setNotes(pa.notes ?? '');
  }, [student]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleDay(d: number) {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId) return;
    if (!days.length) { setError('Please select at least one day.'); return; }
    if (earliestStart >= latestEnd) { setError('Start time must be before end time.'); return; }

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/parent-portal/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, days, earliest_start: earliestStart, latest_end: latestEnd, timezone, notes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      window.location.href = '/parent-portal/onboarding';
    } catch {
      setError('Network error — please check your connection and try again.');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <ParentPortalLayout parent={null}>
        <div className="animate-pulse space-y-4 max-w-2xl">
          {[1, 2, 3].map(i => <div key={i} className="h-20 card rounded-xl" />)}
        </div>
      </ParentPortalLayout>
    );
  }

  if (!student) {
    return (
      <ParentPortalLayout parent={parent}>
        <div className="card p-10 text-center text-gray-400 max-w-2xl">Student not found.</div>
      </ParentPortalLayout>
    );
  }

  return (
    <ParentPortalLayout parent={parent}>
      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Preferred Session Times</h1>
          <p className="text-gray-500 text-sm mt-1">
            Let us know when {student.name} is generally available for tutoring sessions.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Days */}
          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Preferred Days</h2>
            <div className="flex gap-2 flex-wrap">
              {DAYS.map((label, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    days.includes(idx)
                      ? 'bg-navy-700 text-white border-navy-700'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-navy-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Time range */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Preferred Time Range</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Earliest Start Time</label>
                <select value={earliestStart} onChange={e => setEarliestStart(e.target.value)} className={inputCls}>
                  {TIME_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Latest End Time</label>
                <select value={latestEnd} onChange={e => setLatestEnd(e.target.value)} className={inputCls}>
                  {TIME_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Timezone */}
          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Timezone</h2>
            <select value={timezone} onChange={e => setTimezone(e.target.value)} className={inputCls}>
              {US_TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label} — {tz.value}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Notes for Tutor <span className="text-gray-400 font-normal normal-case">(optional)</span></h2>
            <textarea
              rows={3}
              placeholder="e.g. Prefer evenings, not available on holiday weekends, no sessions before noon on weekends..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className={inputCls}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => router.push('/parent-portal/onboarding')}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← Back
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-navy-700 text-white text-sm font-semibold rounded-lg hover:bg-navy-800 transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitting ? 'Saving…' : 'Save Availability →'}
            </button>
          </div>
        </form>
      </div>
    </ParentPortalLayout>
  );
}

export default function AvailabilityPage() {
  return (
    <Suspense fallback={
      <ParentPortalLayout parent={null}>
        <div className="animate-pulse space-y-4 max-w-2xl">
          {[1, 2, 3].map(i => <div key={i} className="h-20 card rounded-xl" />)}
        </div>
      </ParentPortalLayout>
    }>
      <AvailabilityForm />
    </Suspense>
  );
}
