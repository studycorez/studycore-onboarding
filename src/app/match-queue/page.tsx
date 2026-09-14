'use client';

import { useEffect, useState } from 'react';

interface Student {
  opportunityId:   string;
  contactId:       string;
  studentName:     string;
  studentEmail:    string;
  parentEmail:     string;
  parentName:      string;
  currentScore:    string;
  targetScore:     string;
  availability:    string;
  sessionsPerWeek: string;
  startDate:       string;
  hasGuarantee:    string;
  enrolledAt:      string;
}

interface MatchForm {
  tutorName:    string;
  tutorEmail:   string;
  zoomUrl:      string;
  firstSession: string;
  notes:        string;
}

function timeAgo(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function MatchQueue() {
  const [authed, setAuthed]         = useState(false);
  const [password, setPassword]     = useState('');
  const [authError, setAuthError]   = useState('');
  const [students, setStudents]     = useState<Student[]>([]);
  const [loading, setLoading]       = useState(false);
  const [selected, setSelected]     = useState<Student | null>(null);
  const [form, setForm]             = useState<MatchForm>({ tutorName: '', tutorEmail: '', zoomUrl: '', firstSession: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]       = useState('');
  const [error, setError]           = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('sc_auth') === 'true') {
      setAuthed(true);
    }
  }, []);

  useEffect(() => {
    if (authed) fetchStudents();
  }, [authed]);

  async function login() {
    const res = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    if (res.ok) { localStorage.setItem('sc_auth', 'true'); setAuthed(true); setAuthError(''); }
    else setAuthError('Incorrect password');
  }

  async function fetchStudents() {
    setLoading(true);
    try {
      const res = await fetch('/api/match-queue');
      const { students } = await res.json();
      setStudents(students ?? []);
    } finally { setLoading(false); }
  }

  async function confirmMatch() {
    if (!selected || !form.tutorName || !form.tutorEmail) {
      setError('Tutor name and email are required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/confirm-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunityId:   selected.opportunityId,
          contactId:       selected.contactId,
          studentName:     selected.studentName,
          studentEmail:    selected.studentEmail,
          parentEmail:     selected.parentEmail,
          parentName:      selected.parentName,
          currentScore:    selected.currentScore,
          targetScore:     selected.targetScore,
          availability:    selected.availability,
          sessionsPerWeek: selected.sessionsPerWeek,
          ...form,
        }),
      });
      if (!res.ok) throw new Error('Match failed');
      setSuccess(`${selected.studentName} matched with ${form.tutorName}! Emails sent.`);
      setSelected(null);
      setForm({ tutorName: '', tutorEmail: '', zoomUrl: '', firstSession: '', notes: '' });
      await fetchStudents();
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally { setSubmitting(false); }
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow-md p-10 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-2xl font-bold text-[#1e2090]">StudyCore</div>
            <div className="text-gray-500 text-sm mt-1">Onboarding Dashboard</div>
          </div>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#1e2090]"
          />
          {authError && <p className="text-red-500 text-sm mb-3">{authError}</p>}
          <button onClick={login} className="w-full bg-[#1e2090] text-white rounded-lg px-4 py-3 font-semibold text-sm hover:bg-[#161870] transition">
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1e2090] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <div className="font-bold text-lg">StudyCore Onboarding</div>
          <div className="text-blue-200 text-sm">Match Queue</div>
        </div>
        <button onClick={fetchStudents} className="text-blue-200 hover:text-white text-sm transition">
          ↻ Refresh
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 mb-6 text-sm flex items-center gap-2">
            <span>✓</span> {success}
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Students Ready to Match</h1>
            <p className="text-gray-500 text-sm mt-1">These students have completed their diagnostic and are waiting for a tutor assignment.</p>
          </div>
          <div className="bg-[#1e2090] text-white text-sm font-bold rounded-full w-8 h-8 flex items-center justify-center">
            {loading ? '…' : students.length}
          </div>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-16">Loading…</div>
        ) : students.length === 0 ? (
          <div className="text-center text-gray-400 py-16 bg-white rounded-xl border border-gray-200">
            <div className="text-4xl mb-3">🎉</div>
            <div className="font-medium text-gray-600">Queue is clear</div>
            <div className="text-sm mt-1">All students have been matched</div>
          </div>
        ) : (
          <div className="space-y-3">
            {students.map(s => (
              <div key={s.opportunityId} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-[#1e2090] transition cursor-pointer"
                onClick={() => { setSelected(s); setError(''); setSuccess(''); }}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">{s.studentName}</div>
                    <div className="text-sm text-gray-500 mt-0.5">{s.parentEmail}</div>
                  </div>
                  <div className="flex gap-2 items-center">
                    {s.hasGuarantee === 'Yes' && (
                      <span className="bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-0.5 rounded-full">Guarantee</span>
                    )}
                    <span className="text-xs text-gray-400">{timeAgo(s.enrolledAt)}</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  {s.currentScore && <span className="text-gray-600">📊 {s.currentScore} → <strong>{s.targetScore}</strong></span>}
                  {s.availability && <span className="text-gray-600">📅 {s.availability}</span>}
                  {s.sessionsPerWeek && <span className="text-gray-600">🔁 {s.sessionsPerWeek}/week</span>}
                  {s.startDate && <span className="text-gray-600">🗓 Start: {s.startDate}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Match Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-gray-900 text-lg">Confirm Match</h2>
                  <p className="text-gray-500 text-sm mt-0.5">Assigning tutor for <strong>{selected.studentName}</strong></p>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Student summary */}
              <div className="bg-blue-50 rounded-lg p-4 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Student</span><span className="font-medium">{selected.studentName}</span></div>
                {selected.currentScore && <div className="flex justify-between"><span className="text-gray-500">Score</span><span className="font-medium">{selected.currentScore} → {selected.targetScore}</span></div>}
                {selected.availability && <div className="flex justify-between"><span className="text-gray-500">Available</span><span className="font-medium">{selected.availability}</span></div>}
                {selected.sessionsPerWeek && <div className="flex justify-between"><span className="text-gray-500">Frequency</span><span className="font-medium">{selected.sessionsPerWeek}/week</span></div>}
              </div>

              {/* Tutor fields */}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tutor Name *</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2090]"
                    placeholder="e.g. Priya Sharma" value={form.tutorName} onChange={e => setForm(f => ({ ...f, tutorName: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tutor Email *</label>
                  <input type="email" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2090]"
                    placeholder="tutor@email.com" value={form.tutorEmail} onChange={e => setForm(f => ({ ...f, tutorEmail: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zoom Link</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2090]"
                    placeholder="https://zoom.us/j/..." value={form.zoomUrl} onChange={e => setForm(f => ({ ...f, zoomUrl: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Session Date/Time</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2090]"
                    placeholder="e.g. Monday Sep 16 at 7pm EST" value={form.firstSession} onChange={e => setForm(f => ({ ...f, firstSession: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes for tutor (optional)</label>
                  <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2090] resize-none"
                    rows={2} placeholder="Anything the tutor should know before session 1"
                    value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setSelected(null)} className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button onClick={confirmMatch} disabled={submitting}
                  className="flex-1 bg-[#1e2090] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-[#161870] transition disabled:opacity-50">
                  {submitting ? 'Confirming…' : 'Confirm Match & Send Emails'}
                </button>
              </div>
              <p className="text-xs text-gray-400 text-center">This will email the parent + tutor and move the student to "Schedule Being Built"</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
