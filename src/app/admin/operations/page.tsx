'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';

interface Student {
  opportunityId:     string;
  contactId:         string;
  studentName:       string;
  parentName:        string;
  stageId:           string;
  sessionsCompleted:  number;
  fullLengthCount:    number;
  weeklyCheckinTime:  string;
  studentEmail?:    string;
  parentEmail?:     string;
  currentScore?:    string;
  targetScore?:     string;
  availability?:    string;
  sessionsPerWeek?: string;
  startDate?:       string;
  hasGuarantee?:    string;
  enrolledAt?:      string;
}

interface MatchForm {
  tutorName:    string;
  tutorEmail:   string;
  zoomUrl:      string;
  firstSession: string;
  notes:        string;
}

const STAGE_LABELS: Record<string, string> = {
  '79095236-7c28-4684-b7ce-29d03e2d1c86': 'New Enrollment',
  'eb217c7e-1f20-4a6d-aeec-f5123fe625db': 'Form Completed',
  'f145c10b-bd9f-4794-ab8b-1d3cdc6c3707': 'Diagnostic Done',
  'e3af64f6-0af3-487f-aa5c-f8b05f3a84a3': 'Needs Match',
  '34126179-af56-4feb-969d-aec6dd9b6547': 'Session 1 Done',
  '22ddfa4c-a618-467f-b894-980d2d2ef4af': 'Session 3 Done',
  '99803c34-071c-476c-a513-e3789816bf85': 'Active',
  '3294f8d5-ff1c-4368-b0a0-17c3bf0cccc5': 'Phase 1 Done',
  '0f27807f-987a-44a4-9e3e-6399c4f73ff4': 'Phase 2 Done',
  'd3e839e1-1128-4308-9d51-93b8f2b7dd0d': 'Phase 3 Done',
  'd4454fd6-e20f-476d-896b-d4ad2c55c021': 'Phase 4 Done',
  '54e8aab9-ddd4-40d9-ab0a-95a7fb753c23': 'Low Hours',
  'b3731eaf-3b6f-4db2-9369-d0665f7f6e03': 'SAT Day Done',
  'eefacac9-3cbd-46ba-a711-ac24bc00a16c': 'Results Done',
  '4d31767c-c855-41ea-982c-4f4c5f0f3c25': 'Guarantee Case',
};

const STAGE_COLORS: Record<string, string> = {
  '79095236-7c28-4684-b7ce-29d03e2d1c86': 'bg-gray-100 text-gray-600',
  'eb217c7e-1f20-4a6d-aeec-f5123fe625db': 'bg-blue-100 text-blue-700',
  'f145c10b-bd9f-4794-ab8b-1d3cdc6c3707': 'bg-blue-100 text-blue-700',
  'e3af64f6-0af3-487f-aa5c-f8b05f3a84a3': 'bg-yellow-100 text-yellow-800',
  '34126179-af56-4feb-969d-aec6dd9b6547': 'bg-green-100 text-green-700',
  '22ddfa4c-a618-467f-b894-980d2d2ef4af': 'bg-green-100 text-green-700',
  '99803c34-071c-476c-a513-e3789816bf85': 'bg-emerald-100 text-emerald-700',
  '3294f8d5-ff1c-4368-b0a0-17c3bf0cccc5': 'bg-purple-100 text-purple-700',
  '0f27807f-987a-44a4-9e3e-6399c4f73ff4': 'bg-purple-100 text-purple-700',
  'd3e839e1-1128-4308-9d51-93b8f2b7dd0d': 'bg-purple-100 text-purple-700',
  'd4454fd6-e20f-476d-896b-d4ad2c55c021': 'bg-purple-100 text-purple-700',
  '54e8aab9-ddd4-40d9-ab0a-95a7fb753c23': 'bg-orange-100 text-orange-700',
  'b3731eaf-3b6f-4db2-9369-d0665f7f6e03': 'bg-gray-100 text-gray-600',
  'eefacac9-3cbd-46ba-a711-ac24bc00a16c': 'bg-gray-100 text-gray-600',
  '4d31767c-c855-41ea-982c-4f4c5f0f3c25': 'bg-red-100 text-red-700',
};

const NEEDS_MATCH_STAGE = 'e3af64f6-0af3-487f-aa5c-f8b05f3a84a3';

const CHECKIN_BUTTONS = [
  { label: 'Post-Session 1', type: 'Post-Session 1' },
  { label: 'Post-Session 3', type: 'Post-Session 3' },
  { label: 'Weekly Sync',    type: 'Weekly Sync' },
  { label: 'Phase Check-in', type: 'Post-Practice Test', isZoom: true },
  { label: 'Pre-SAT Call',   type: 'Pre-SAT Day' },
  { label: 'Post-SAT',       type: 'Post-SAT Results' },
];

const OPS_NAV = [
  { label: 'Operations', href: '/admin/operations' },
  { label: 'TQC',        href: '/admin/tqc' },
  { label: 'Check-ins',  href: '/admin/check-ins' },
  { label: 'SSC',        href: '/admin/ssc' },
];

export default function OperationsPage() {
  const [students, setStudents]       = useState<Student[]>([]);
  const [loading, setLoading]         = useState(false);
  const [matchTarget, setMatchTarget] = useState<Student | null>(null);
  const [form, setForm]               = useState<MatchForm>({ tutorName: '', tutorEmail: '', zoomUrl: '', firstSession: '', notes: '' });
  const [submitting, setSubmitting]   = useState(false);
  const [sending, setSending]         = useState<string | null>(null);
  const [confirm, setConfirm]         = useState<{ student: Student; type: string; label: string; isZoom?: boolean } | null>(null);
  const [toasts, setToasts]           = useState<{ id: number; msg: string; ok: boolean }[]>([]);
  const [matchError, setMatchError]   = useState('');

  useEffect(() => { fetchStudents(); }, []);

  async function fetchStudents() {
    setLoading(true);
    try {
      const res = await fetch('/api/active-students');
      const data = await res.json() as { students?: Student[] };
      setStudents(data.students ?? []);
    } finally { setLoading(false); }
  }

  function addToast(msg: string, ok: boolean) {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }

  async function confirmMatch() {
    if (!matchTarget || !form.tutorName || !form.tutorEmail) {
      setMatchError('Tutor name and email are required');
      return;
    }
    setSubmitting(true);
    setMatchError('');
    try {
      const res = await fetch('/api/confirm-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunityId:   matchTarget.opportunityId,
          contactId:       matchTarget.contactId,
          studentName:     matchTarget.studentName,
          studentEmail:    matchTarget.studentEmail ?? '',
          parentEmail:     matchTarget.parentEmail ?? '',
          parentName:      matchTarget.parentName,
          currentScore:    matchTarget.currentScore ?? '',
          targetScore:     matchTarget.targetScore ?? '',
          availability:    matchTarget.availability ?? '',
          sessionsPerWeek: matchTarget.sessionsPerWeek ?? '',
          ...form,
        }),
      });
      if (!res.ok) throw new Error('Match failed');
      addToast(`${matchTarget.studentName} matched with ${form.tutorName}!`, true);
      setMatchTarget(null);
      setForm({ tutorName: '', tutorEmail: '', zoomUrl: '', firstSession: '', notes: '' });
      await fetchStudents();
    } catch {
      setMatchError('Something went wrong');
    } finally { setSubmitting(false); }
  }

  async function sendCheckin(student: Student, type: string, label: string) {
    const key = `${student.studentName}|${type}`;
    setSending(key);
    setConfirm(null);
    try {
      const res = await fetch('/api/send-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentName: student.studentName, checkInType: type }),
      });
      if (!res.ok) throw new Error();
      addToast(`Booking link sent — ${student.studentName} · ${label}`, true);
    } catch {
      addToast(`Failed to send for ${student.studentName}`, false);
    } finally { setSending(null); }
  }

  const needsMatch = students.filter(s => s.stageId === NEEDS_MATCH_STAGE);
  const active     = students.filter(s => s.stageId !== NEEDS_MATCH_STAGE);

  return (
    <AdminLayout>
      {/* Ops sub-nav */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 pb-3">
        {OPS_NAV.map(n => (
          <a key={n.href} href={n.href}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              n.href === '/admin/operations'
                ? 'bg-navy-900 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}>
            {n.label}
          </a>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-gray-400">{students.length} students</span>
          <button onClick={fetchStudents} className="text-sm text-gray-500 hover:text-gray-800 transition">↻ Refresh</button>
        </div>
      </div>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map(t => (
          <div key={t.id} className={`rounded-lg px-4 py-3 text-sm shadow-lg text-white ${t.ok ? 'bg-green-600' : 'bg-red-600'}`}>
            {t.msg}
          </div>
        ))}
      </div>

      <div className="space-y-10">
        {/* Needs Match */}
        {needsMatch.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-base font-bold text-gray-900">Needs Tutor Match</h2>
              <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-0.5 rounded-full">{needsMatch.length}</span>
            </div>
            <div className="space-y-3">
              {needsMatch.map(s => (
                <div key={s.opportunityId} className="bg-white rounded-xl border border-yellow-200 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">{s.studentName}</div>
                      {s.parentName && <div className="text-sm text-gray-500 mt-0.5">Parent: {s.parentName}</div>}
                    </div>
                    <button onClick={() => { setMatchTarget(s); setMatchError(''); }}
                      className="bg-navy-900 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-navy-800 transition">
                      Match Tutor
                    </button>
                  </div>
                  {(s.currentScore || s.availability || s.sessionsPerWeek) && (
                    <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-600">
                      {s.currentScore && <span>📊 {s.currentScore} → <strong>{s.targetScore}</strong></span>}
                      {s.availability && <span>📅 {s.availability}</span>}
                      {s.sessionsPerWeek && <span>🔁 {s.sessionsPerWeek}/week</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Students */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-bold text-gray-900">Active Students</h2>
            <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">{active.length}</span>
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-16">Loading…</div>
          ) : active.length === 0 && needsMatch.length === 0 ? (
            <div className="text-center text-gray-400 py-16 bg-white rounded-xl border border-gray-200">
              <div className="font-medium text-gray-600">No active students</div>
            </div>
          ) : (
            <div className="space-y-3">
              {active.map(s => (
                <div key={s.opportunityId} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-semibold text-gray-900">{s.studentName}</div>
                      {s.parentName && <div className="text-sm text-gray-500 mt-0.5">Parent: {s.parentName}</div>}
                      {s.weeklyCheckinTime && <div className="text-xs text-indigo-600 mt-0.5">📞 {s.weeklyCheckinTime}</div>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {s.sessionsCompleted > 0 && <span className="text-xs text-gray-400">{s.sessionsCompleted} sessions</span>}
                      {s.fullLengthCount > 0 && <span className="text-xs text-gray-400">{s.fullLengthCount} tests</span>}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STAGE_COLORS[s.stageId] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STAGE_LABELS[s.stageId] ?? 'Active'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {CHECKIN_BUTTONS.map(btn => {
                      const key = `${s.studentName}|${btn.type}`;
                      return (
                        <button key={btn.type}
                          onClick={() => setConfirm({ student: s, type: btn.type, label: btn.label, isZoom: btn.isZoom })}
                          disabled={sending === key}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition disabled:opacity-50 ${
                            btn.isZoom ? 'border-violet-300 text-violet-700 hover:bg-violet-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}>
                          {sending === key ? 'Sending…' : btn.label}
                          {btn.isZoom && <span className="ml-1 text-violet-400">●</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Match Modal */}
      {matchTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setMatchTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Confirm Match</h2>
                <p className="text-gray-500 text-sm mt-0.5">Assigning tutor for <strong>{matchTarget.studentName}</strong></p>
              </div>
              <button onClick={() => setMatchTarget(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 rounded-lg p-4 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Student</span><span className="font-medium">{matchTarget.studentName}</span></div>
                {matchTarget.currentScore && <div className="flex justify-between"><span className="text-gray-500">Score</span><span className="font-medium">{matchTarget.currentScore} → {matchTarget.targetScore}</span></div>}
                {matchTarget.availability && <div className="flex justify-between"><span className="text-gray-500">Available</span><span className="font-medium">{matchTarget.availability}</span></div>}
                {matchTarget.sessionsPerWeek && <div className="flex justify-between"><span className="text-gray-500">Frequency</span><span className="font-medium">{matchTarget.sessionsPerWeek}/week</span></div>}
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Tutor Name *', key: 'tutorName', type: 'text', placeholder: 'e.g. Priya Sharma' },
                  { label: 'Tutor Email *', key: 'tutorEmail', type: 'email', placeholder: 'tutor@email.com' },
                  { label: 'Zoom Link', key: 'zoomUrl', type: 'text', placeholder: 'https://zoom.us/j/...' },
                  { label: 'First Session Date/Time', key: 'firstSession', type: 'text', placeholder: 'e.g. Monday Sep 16 at 7pm EST' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                    <input type={f.type} placeholder={f.placeholder}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-400"
                      value={form[f.key as keyof MatchForm]}
                      onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes for tutor (optional)</label>
                  <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-400 resize-none"
                    rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              {matchError && <p className="text-red-500 text-sm">{matchError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setMatchTarget(null)} className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
                <button onClick={confirmMatch} disabled={submitting}
                  className="flex-1 bg-navy-900 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-navy-800 transition disabled:opacity-50">
                  {submitting ? 'Confirming…' : 'Confirm Match & Send Emails'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Check-in Confirm Modal */}
      {confirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="font-bold text-gray-900 text-base mb-1">Send booking link?</h2>
            <p className="text-sm text-gray-500 mb-4">
              SMS the <strong>{confirm.label}</strong> booking link to <strong>{confirm.student.studentName}</strong>&apos;s parent and student.
              {confirm.isZoom && <span className="ml-1 text-violet-600 font-medium">(Zoom)</span>}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
              <button onClick={() => sendCheckin(confirm.student, confirm.type, confirm.label)}
                className="flex-1 bg-navy-900 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-navy-800 transition">Send</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
