'use client';

import { useEffect, useState } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { formatDateTime } from '@/lib/utils';
import { Check, AlertCircle, Loader2, X } from 'lucide-react';
import { format } from 'date-fns';

export default function TutorReportsPage() {
  const { tutor, loading } = useTutorAuth();
  const supabase = createClient();
  const [sessions, setSessions] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);

  // Report modal state
  const [reportSession, setReportSession] = useState<any | null>(null);
  const [reportForm, setReportForm] = useState<{
    topics_covered: string;
    homework_assigned: string;
    homework_due_date: string;
    student_engagement: number;
    session_notes: string;
    next_session_plan: string;
    homework_completed: boolean | null;
    homework_completion_notes: string;
    at_risk: boolean;
    at_risk_reason: string;
    practice_test_score: string;
    practice_test_type: string;
  }>({
    topics_covered: '',
    homework_assigned: '',
    homework_due_date: '',
    student_engagement: 0,
    session_notes: '',
    next_session_plan: '',
    homework_completed: null,
    homework_completion_notes: '',
    at_risk: false,
    at_risk_reason: '',
    practice_test_score: '',
    practice_test_type: '',
  });
  const [reportSaving, setReportSaving] = useState(false);
  const [reportError, setReportError] = useState('');
  const [toast, setToast] = useState('');

  async function load() {
    if (!tutor) return;
    setFetching(true);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, report_submitted, report_submitted_at, topics_covered, student_engagement, session_notes, next_session_plan, homework_assigned, homework_due_date, tutor_notes, student:students(id, name)')
      .eq('tutor_id', tutor.id)
      .eq('status', 'completed')
      .gte('scheduled_at', thirtyDaysAgo)
      .order('scheduled_at', { ascending: false });
    setSessions((data as any[]) ?? []);
    setFetching(false);
  }

  useEffect(() => { load(); }, [tutor]); // eslint-disable-line react-hooks/exhaustive-deps

  function openReportModal(s: any) {
    setReportForm({
      topics_covered: s.topics_covered ?? '',
      homework_assigned: s.homework_assigned ?? '',
      homework_due_date: s.homework_due_date ?? '',
      student_engagement: s.student_engagement ?? 0,
      session_notes: s.session_notes ?? s.tutor_notes ?? '',
      next_session_plan: s.next_session_plan ?? '',
      homework_completed: s.homework_completed ?? null,
      homework_completion_notes: s.homework_completion_notes ?? '',
      at_risk: s.at_risk ?? false,
      at_risk_reason: s.at_risk_reason ?? '',
      practice_test_score: s.practice_test_score?.toString() ?? '',
      practice_test_type: s.practice_test_type ?? '',
    });
    setReportError('');
    setReportSession(s);
  }

  async function submitReport() {
    if (!reportSession) return;
    setReportSaving(true);
    setReportError('');
    try {
      const res = await fetch(`/api/sessions/${reportSession.id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportForm),
      });
      if (res.ok) {
        setReportSession(null);
        setToast('Report submitted!');
        setTimeout(() => setToast(''), 3000);
        await load();
      } else {
        const d = await res.json().catch(() => ({}));
        setReportError(d.error ?? 'Failed to save report');
      }
    } finally {
      setReportSaving(false);
    }
  }

  if (loading) return null;

  const pending   = sessions.filter(s => !s.report_submitted).length;
  const submitted = sessions.filter(s => s.report_submitted).length;

  return (
    <TutorPortalLayout tutor={tutor}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Session Reports</h1>
          <p className="text-gray-500 text-sm mt-1">Last 30 days · {sessions.length} sessions</p>
        </div>
        <div className="flex gap-3">
          <div className="card px-4 py-2 text-center">
            <p className="text-xs text-gray-500">Pending</p>
            <p className={`text-xl font-bold ${pending > 0 ? 'text-red-600' : 'text-gray-900'}`}>{pending}</p>
          </div>
          <div className="card px-4 py-2 text-center">
            <p className="text-xs text-gray-500">Submitted</p>
            <p className="text-xl font-bold text-green-600">{submitted}</p>
          </div>
        </div>
      </div>

      {pending > 0 && (
        <div className="mb-5 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <span className="text-red-500 text-lg">⚠️</span>
          <p className="text-sm font-medium text-red-800">
            You have <strong>{pending}</strong> session{pending !== 1 ? 's' : ''} with missing reports. Click <strong>Report Due</strong> to submit.
          </p>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-header">Date & Time</th>
              <th className="table-header">Student</th>
              <th className="table-header">Duration</th>
              <th className="table-header">Report</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {fetching && (
              <tr><td colSpan={4} className="table-cell text-center py-8 text-gray-400">Loading…</td></tr>
            )}
            {!fetching && sessions.length === 0 && (
              <tr><td colSpan={4} className="table-cell text-center py-8 text-gray-400">No completed sessions in the last 30 days.</td></tr>
            )}
            {sessions.map((s: any) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="table-cell font-medium text-sm">{formatDateTime(s.scheduled_at)}</td>
                <td className="table-cell">{s.student?.name ?? '—'}</td>
                <td className="table-cell">{s.duration_minutes}m</td>
                <td className="table-cell">
                  {s.report_submitted ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded font-medium">
                      <Check className="w-3 h-3" /> Submitted {s.report_submitted_at ? format(new Date(s.report_submitted_at), 'MMM d') : ''}
                    </span>
                  ) : (
                    <button
                      onClick={() => openReportModal(s)}
                      className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded font-medium transition-colors"
                    >
                      <AlertCircle className="w-3 h-3" /> Report Due
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Report submission modal */}
      {reportSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Session Report</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {reportSession.student?.name} · {format(new Date(reportSession.scheduled_at), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
              <button onClick={() => setReportSession(null)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Topics Covered <span className="text-red-500">*</span></label>
                <textarea
                  rows={3}
                  value={reportForm.topics_covered}
                  onChange={e => setReportForm(f => ({ ...f, topics_covered: e.target.value }))}
                  placeholder="e.g. Quadratic equations, graphing parabolas…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Student Engagement <span className="text-red-500">*</span></label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setReportForm(f => ({ ...f, student_engagement: n }))}
                      className={`text-2xl transition-colors ${n <= reportForm.student_engagement ? 'text-yellow-400' : 'text-gray-200 hover:text-yellow-300'}`}
                    >
                      ★
                    </button>
                  ))}
                  {reportForm.student_engagement > 0 && (
                    <span className="text-xs text-gray-500 self-center ml-1">
                      {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][reportForm.student_engagement]}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Session Notes</label>
                <textarea
                  rows={3}
                  value={reportForm.session_notes}
                  onChange={e => setReportForm(f => ({ ...f, session_notes: e.target.value }))}
                  placeholder="How did the session go? Any breakthroughs or struggles?"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Homework Assigned</label>
                <textarea
                  rows={2}
                  value={reportForm.homework_assigned}
                  onChange={e => setReportForm(f => ({ ...f, homework_assigned: e.target.value }))}
                  placeholder="e.g. Khan Academy: Quadratics sections 1–3"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Homework Due Date</label>
                <input
                  type="date"
                  value={reportForm.homework_due_date}
                  onChange={e => setReportForm(f => ({ ...f, homework_due_date: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan for Next Session</label>
                <textarea
                  rows={2}
                  value={reportForm.next_session_plan}
                  onChange={e => setReportForm(f => ({ ...f, next_session_plan: e.target.value }))}
                  placeholder="What will you focus on next time?"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
                />
              </div>

              {/* Homework Completion */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Previous Homework Completion</label>
                <div className="flex gap-2 flex-wrap">
                  {([
                    { label: 'Yes', value: true },
                    { label: 'No', value: false },
                    { label: 'No homework assigned', value: null },
                  ] as { label: string; value: boolean | null }[]).map(opt => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setReportForm(f => ({ ...f, homework_completed: opt.value, homework_completion_notes: opt.value === false ? f.homework_completion_notes : '' }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        reportForm.homework_completed === opt.value
                          ? 'bg-navy-900 text-white border-navy-900'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {reportForm.homework_completed === false && (
                  <textarea
                    rows={2}
                    value={reportForm.homework_completion_notes}
                    onChange={e => setReportForm(f => ({ ...f, homework_completion_notes: e.target.value }))}
                    placeholder="What was incomplete?"
                    className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
                  />
                )}
              </div>

              {/* Practice Test Score */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Practice Test Score (optional)</label>
                <div className="flex gap-2 items-center flex-wrap">
                  <select
                    value={reportForm.practice_test_type}
                    onChange={e => setReportForm(f => ({ ...f, practice_test_type: e.target.value, practice_test_score: e.target.value ? f.practice_test_score : '' }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                  >
                    <option value="">Select test type…</option>
                    {['SAT Full','SAT Reading','SAT Math','SAT Writing','ACT Full','ACT English','ACT Math','ACT Reading','ACT Science','Other'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {reportForm.practice_test_type && (
                    <input
                      type="number"
                      value={reportForm.practice_test_score}
                      onChange={e => setReportForm(f => ({ ...f, practice_test_score: e.target.value }))}
                      placeholder="Score"
                      className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    />
                  )}
                </div>
              </div>

              {/* At-Risk Flag */}
              <div className="border border-amber-200 bg-amber-50 rounded-lg px-4 py-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reportForm.at_risk}
                    onChange={e => setReportForm(f => ({ ...f, at_risk: e.target.checked, at_risk_reason: e.target.checked ? f.at_risk_reason : '' }))}
                    className="w-4 h-4 rounded border-amber-400 accent-amber-600"
                  />
                  <span className="text-sm font-semibold text-amber-800">Flag this student for fulfillment team review</span>
                </label>
                {reportForm.at_risk && (
                  <textarea
                    rows={2}
                    value={reportForm.at_risk_reason}
                    onChange={e => setReportForm(f => ({ ...f, at_risk_reason: e.target.value }))}
                    placeholder="Reason for flagging (required)"
                    className="mt-2 w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none bg-white"
                  />
                )}
              </div>

              {reportError && <p className="text-red-500 text-sm">{reportError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setReportSession(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitReport}
                disabled={reportSaving || !reportForm.topics_covered.trim() || reportForm.student_engagement === 0 || (reportForm.at_risk && !reportForm.at_risk_reason.trim())}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-navy-900 rounded-lg hover:bg-navy-800 disabled:opacity-40 transition-colors"
              >
                {reportSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-sm px-4 py-3 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </TutorPortalLayout>
  );
}
