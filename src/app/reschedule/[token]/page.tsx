'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';

interface SessionInfo {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  student_name: string;
  tutor_name: string;
}

export default function ReschedulePage() {
  const { token } = useParams<{ token: string }>();
  const [session,     setSession]     = useState<SessionInfo | null>(null);
  const [loadError,   setLoadError]   = useState('');
  const [newDate,     setNewDate]     = useState('');
  const [newTime,     setNewTime]     = useState('');
  const [reason,      setReason]      = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done,        setDone]        = useState(false);

  useEffect(() => {
    fetch(`/api/reschedule/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setLoadError(d.error); return; }
        setSession(d);
        // Default new date/time to original
        const dt = new Date(d.scheduled_at);
        setNewDate(format(dt, 'yyyy-MM-dd'));
        setNewTime(format(dt, 'HH:mm'));
      })
      .catch(() => setLoadError('Failed to load session'));
  }, [token]);

  async function submit() {
    if (!newDate || !newTime) { setSubmitError('Please select a date and time.'); return; }
    if (!reason.trim()) { setSubmitError('Please provide a reason for rescheduling.'); return; }

    const newScheduledAt = new Date(`${newDate}T${newTime}`).toISOString();
    setSubmitting(true);
    setSubmitError('');

    const res = await fetch(`/api/reschedule/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newScheduledAt, reason }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setSubmitError(data.error ?? 'Failed to reschedule'); return; }
    setDone(true);
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
          <div className="text-4xl mb-4">❌</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link not valid</h1>
          <p className="text-gray-500">{loadError}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Session rescheduled!</h1>
          <p className="text-gray-500">Your tutor and our team have been notified. You'll receive a confirmation email shortly.</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md w-full">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Reschedule Session</h1>
        <p className="text-gray-500 text-sm mb-6">
          {session.student_name} with {session.tutor_name}
        </p>

        <div className="bg-gray-50 rounded-xl p-4 mb-6 text-sm">
          <p className="text-gray-500">Current time:</p>
          <p className="font-semibold text-gray-900 mt-0.5">
            {format(new Date(session.scheduled_at), "EEEE, MMMM d, yyyy 'at' h:mm a")}
          </p>
          <p className="text-gray-400 text-xs mt-0.5">{session.duration_minutes} minutes</p>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New date</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-400"
              value={newDate}
              min={format(new Date(), 'yyyy-MM-dd')}
              onChange={e => setNewDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New time</label>
            <input
              type="time"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-400"
              value={newTime}
              onChange={e => setNewTime(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason for rescheduling</label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-400 resize-none"
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Conflict with another commitment"
            />
          </div>
        </div>

        {submitError && <p className="text-red-500 text-sm mb-3">{submitError}</p>}

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full py-3 bg-navy-700 hover:bg-navy-800 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
        >
          {submitting ? 'Rescheduling…' : 'Confirm Reschedule'}
        </button>
      </div>
    </div>
  );
}
