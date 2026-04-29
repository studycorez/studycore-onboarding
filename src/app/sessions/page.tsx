'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';
import type { Session, SessionStatus, PaymentStatus } from '@/types';
import { formatDateTime } from '@/lib/utils';
import { ExternalLink, Loader2, Filter, CalendarClock, UserX } from 'lucide-react';
import { format } from 'date-fns';

const RESCHEDULE_REASONS = [
  'Client Request',
  'Tutor Request',
  'Technical Issue',
  'Emergency',
  'Other',
];

interface SessionWithJoin extends Omit<Session, 'tutor' | 'student'> {
  tutor: { name: string } | null;
  student: { name: string; email: string; parent_email: string | null; target_score: number | null; notes: string | null } | null;
}

export default function SessionsPage() {
  const [sessions, setSessions]     = useState<SessionWithJoin[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<SessionWithJoin | null>(null);
  const [saving, setSaving]         = useState(false);
  const [progressForm, setProgressForm] = useState({ math: '', reading: '', writing: '', total: '' });

  // No-show state
  const [noShowOpen, setNoShowOpen]         = useState(false);
  const [noShowType, setNoShowType]         = useState<'student' | 'tutor' | 'both'>('student');
  const [markingNoShow, setMarkingNoShow]   = useState(false);
  const [noShowError, setNoShowError]       = useState('');

  // Reschedule state
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({ newTime: '', reason: 'Client Request', notes: '' });
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<string>('');

  const supabase = createClient();

  async function load() {
    setLoading(true);
    let q = supabase.from('sessions')
      .select('*, tutor:tutors(name), student:students(name,email,parent_email,target_score,notes), student_progress(*)')
      .order('scheduled_at', { ascending: false })
      .limit(100);
    if (statusFilter)  q = q.eq('status', statusFilter);
    if (paymentFilter) q = q.eq('payment_status', paymentFilter);
    const { data } = await q;
    setSessions(data as any ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [statusFilter, paymentFilter]);

  function openSession(s: SessionWithJoin) {
    setSelected(s);
    setProgressForm({ math: '', reading: '', writing: '', total: '' });
    setRescheduleOpen(false);
    setRescheduleForm({ newTime: '', reason: 'Client Request', notes: '' });
    setRescheduleError('');
    setNoShowOpen(false);
    setNoShowError('');
  }

  async function submitNoShow() {
    if (!selected) return;
    setMarkingNoShow(true);
    setNoShowError('');
    try {
      const res = await fetch(`/api/sessions/${selected.id}/no-show`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: noShowType }),
      });
      const data = await res.json();
      if (!res.ok) { setNoShowError(data.error ?? 'Failed to mark no-show'); return; }
      setNoShowOpen(false);
      await load();
      setSelected(prev => prev ? { ...prev, status: data.status } : null);
    } catch {
      setNoShowError('Network error — please try again.');
    } finally {
      setMarkingNoShow(false);
    }
  }

  async function updateSession(id: string, updates: Partial<Session>) {
    setSaving(true);
    await supabase.from('sessions').update(updates).eq('id', id);
    if (updates.status === 'completed' && selected) {
      await fetch('/api/emails/post-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id }),
      });
    }
    if (updates.status === 'cancelled') {
      fetch(`/api/sessions/${id}/google-event`, { method: 'DELETE' }).catch(() => {});
    }
    setSaving(false);
    await load();
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, ...updates } : null);
  }

  async function logProgress() {
    if (!selected) return;
    setSaving(true);
    const payload: any = { student_id: selected.student_id, session_id: selected.id, recorded_at: new Date().toISOString() };
    if (progressForm.math)    payload.math_score    = parseInt(progressForm.math);
    if (progressForm.reading) payload.reading_score = parseInt(progressForm.reading);
    if (progressForm.writing) payload.writing_score = parseInt(progressForm.writing);
    if (progressForm.total)   payload.total_score   = parseInt(progressForm.total);
    await supabase.from('student_progress').insert(payload);
    setSaving(false);
    setProgressForm({ math: '', reading: '', writing: '', total: '' });
  }

  async function submitReschedule() {
    if (!selected || !rescheduleForm.newTime) return;
    setRescheduling(true);
    setRescheduleError('');
    try {
      const res = await fetch(`/api/sessions/${selected.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newScheduledAt: new Date(rescheduleForm.newTime).toISOString(),
          reason: rescheduleForm.reason,
          notes: rescheduleForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setRescheduleError(data.error ?? 'Reschedule failed'); return; }

      await load();
      setRescheduleOpen(false);
      // Update selected session display
      setSelected(prev => prev ? {
        ...prev,
        scheduled_at: new Date(rescheduleForm.newTime).toISOString(),
        reschedule_count: (prev.reschedule_count ?? 0) + 1,
        rescheduled_from: prev.scheduled_at,
        reschedule_reason: rescheduleForm.reason,
      } : null);
    } finally {
      setRescheduling(false);
    }
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
          <p className="text-gray-500 text-sm mt-1">{sessions.length} sessions</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input w-auto text-sm">
            <option value="">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No Show</option>
            <option value="no_show_student">Student No-Show</option>
            <option value="no_show_tutor">Tutor No-Show</option>
            <option value="no_show_both">Both No-Show</option>
          </select>
        </div>
        <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} className="input w-auto text-sm">
          <option value="">All Payments</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="waived">Waived</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-header">Date & Time</th>
              <th className="table-header">Tutor</th>
              <th className="table-header">Student</th>
              <th className="table-header">Duration</th>
              <th className="table-header">Status</th>
              <th className="table-header">Payment</th>
              <th className="table-header">Zoom</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && <tr><td colSpan={7} className="table-cell text-center py-8 text-gray-400">Loading…</td></tr>}
            {!loading && sessions.length === 0 && <tr><td colSpan={7} className="table-cell text-center py-8 text-gray-400">No sessions found</td></tr>}
            {sessions.map(s => (
              <tr
                key={s.id}
                onClick={() => openSession(s)}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="table-cell font-medium text-sm">{formatDateTime(s.scheduled_at)}</td>
                <td className="table-cell">{s.tutor?.name ?? '—'}</td>
                <td className="table-cell">{s.student?.name ?? '—'}</td>
                <td className="table-cell">{s.duration_minutes} min</td>
                <td className="table-cell">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {s.status === 'cancelled' && s.cancellation_reason === 'tutor_switch' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                        Cancelled (Tutor Switch)
                      </span>
                    ) : (
                      <StatusBadge status={s.status} />
                    )}
                    {(s.reschedule_count ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        <CalendarClock className="w-3 h-3" />
                        {s.reschedule_count > 1 ? `Rescheduled ${s.reschedule_count}x` : 'Rescheduled'}
                      </span>
                    )}
                  </div>
                </td>
                <td className="table-cell"><StatusBadge status={s.payment_status} /></td>
                <td className="table-cell">
                  {s.zoom_join_url
                    ? <a href={s.zoom_join_url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-navy-600 hover:text-navy-800 text-xs font-medium"><ExternalLink className="w-3 h-3" />Join</a>
                    : <span className="text-gray-400 text-xs">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Session Detail Modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Session Details" size="lg">
        {selected && (
          <div className="space-y-5">
            {/* Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-gray-500">Tutor</p><p className="font-semibold">{selected.tutor?.name}</p></div>
              <div><p className="text-gray-500">Student</p><p className="font-semibold">{selected.student?.name}</p></div>
              <div>
                <p className="text-gray-500">Date & Time</p>
                <p className="font-semibold">{formatDateTime(selected.scheduled_at)}</p>
                {selected.rescheduled_from && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    Rescheduled from {formatDateTime(selected.rescheduled_from)}
                  </p>
                )}
              </div>
              <div><p className="text-gray-500">Duration</p><p className="font-semibold">{selected.duration_minutes} min</p></div>
              {selected.student?.target_score && <div><p className="text-gray-500">Target Score</p><p className="font-semibold">{selected.student.target_score}</p></div>}
              {selected.reschedule_reason && <div><p className="text-gray-500">Reschedule Reason</p><p className="font-semibold">{selected.reschedule_reason}</p></div>}
            </div>

            {/* Zoom Links */}
            {(selected.zoom_join_url || selected.zoom_host_url) && (
              <div className="flex gap-2">
                {selected.zoom_join_url && <a href={selected.zoom_join_url} target="_blank" rel="noopener" className="btn-primary text-xs"><ExternalLink className="w-3 h-3" />Join Link</a>}
                {selected.zoom_host_url && <a href={selected.zoom_host_url} target="_blank" rel="noopener" className="btn-secondary text-xs"><ExternalLink className="w-3 h-3" />Host Link</a>}
              </div>
            )}

            {/* Reschedule section */}
            {!rescheduleOpen ? (
              <button
                onClick={() => setRescheduleOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
              >
                <CalendarClock className="w-4 h-4" /> Reschedule Session
              </button>
            ) : (
              <div className="border border-amber-200 rounded-xl p-4 bg-amber-50 space-y-3">
                <p className="text-sm font-semibold text-amber-900">Reschedule Session</p>

                <div>
                  <label className="label">New Date & Time *</label>
                  <input
                    type="datetime-local"
                    value={rescheduleForm.newTime}
                    onChange={e => setRescheduleForm(f => ({ ...f, newTime: e.target.value }))}
                    className="input"
                  />
                </div>

                <div>
                  <label className="label">Reason *</label>
                  <select
                    value={rescheduleForm.reason}
                    onChange={e => setRescheduleForm(f => ({ ...f, reason: e.target.value }))}
                    className="input"
                  >
                    {RESCHEDULE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>

                <div>
                  <label className="label">Notes (optional)</label>
                  <textarea
                    value={rescheduleForm.notes}
                    onChange={e => setRescheduleForm(f => ({ ...f, notes: e.target.value }))}
                    className="input" rows={2}
                    placeholder="Additional context…"
                  />
                </div>

                {rescheduleError && <p className="text-sm text-red-600">{rescheduleError}</p>}

                <div className="flex gap-2">
                  <button
                    onClick={() => { setRescheduleOpen(false); setRescheduleError(''); }}
                    className="btn-secondary text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitReschedule}
                    disabled={!rescheduleForm.newTime || rescheduling}
                    className="btn-primary text-sm flex items-center gap-1.5"
                  >
                    {rescheduling && <Loader2 className="w-3 h-3 animate-spin" />}
                    {rescheduling ? 'Rescheduling…' : 'Confirm Reschedule'}
                  </button>
                </div>
              </div>
            )}

            {/* Mark No-Show — only for past scheduled sessions */}
            {selected.status === 'scheduled' && new Date(selected.scheduled_at) < new Date() && (
              !noShowOpen ? (
                <button
                  onClick={() => { setNoShowOpen(true); setNoShowType('student'); setNoShowError(''); }}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
                >
                  <UserX className="w-4 h-4" /> Mark No-Show
                </button>
              ) : (
                <div className="border border-red-200 rounded-xl p-4 bg-red-50 space-y-3">
                  <p className="text-sm font-semibold text-red-900">Who didn't show up?</p>
                  <div className="flex gap-2">
                    {(['student', 'tutor', 'both'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNoShowType(t)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors capitalize ${
                          noShowType === t
                            ? 'bg-red-700 text-white border-red-700'
                            : 'text-red-700 border-red-200 hover:bg-red-100'
                        }`}
                      >
                        {t === 'both' ? 'Both' : t === 'student' ? 'Student' : 'Tutor'}
                      </button>
                    ))}
                  </div>
                  {noShowError && <p className="text-sm text-red-700">{noShowError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setNoShowOpen(false); setNoShowError(''); }}
                      className="btn-secondary text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitNoShow}
                      disabled={markingNoShow}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {markingNoShow && <Loader2 className="w-3 h-3 animate-spin" />}
                      {markingNoShow ? 'Saving…' : 'Confirm No-Show'}
                    </button>
                  </div>
                </div>
              )
            )}

            {/* Status Controls */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Session Status</label>
                <select
                  value={selected.status}
                  onChange={e => updateSession(selected.id, { status: e.target.value as SessionStatus })}
                  className="input"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no_show">No Show</option>
                  <option value="no_show_student">Student No-Show</option>
                  <option value="no_show_tutor">Tutor No-Show</option>
                  <option value="no_show_both">Both No-Show</option>
                </select>
              </div>
              <div>
                <label className="label">Payment Status</label>
                <select
                  value={selected.payment_status}
                  onChange={e => updateSession(selected.id, { payment_status: e.target.value as PaymentStatus })}
                  className="input"
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="waived">Waived</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">Payment Amount ($)</label>
              <input
                type="number" step="0.01" min="0"
                defaultValue={selected.payment_amount ?? ''}
                onBlur={e => updateSession(selected.id, { payment_amount: parseFloat(e.target.value) || null })}
                className="input"
                placeholder="0.00"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="label">Session Notes</label>
              <textarea
                defaultValue={selected.session_notes ?? ''}
                onBlur={e => updateSession(selected.id, { session_notes: e.target.value })}
                className="input" rows={3}
                placeholder="What was covered in this session…"
              />
            </div>
            <div>
              <label className="label">Tutor Feedback</label>
              <textarea
                defaultValue={selected.tutor_feedback ?? ''}
                onBlur={e => updateSession(selected.id, { tutor_feedback: e.target.value })}
                className="input" rows={2}
                placeholder="Tutor's notes on student progress…"
              />
            </div>

            {/* Tutor-submitted notes */}
            {(selected as any).tutor_notes && (
              <div className="border border-indigo-100 rounded-xl p-4 bg-indigo-50 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-indigo-900">Tutor Notes (submitted)</p>
                  {(selected as any).session_rating && (
                    <span className="text-amber-500 text-sm">
                      {'★'.repeat((selected as any).session_rating)}{'☆'.repeat(5 - (selected as any).session_rating)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-indigo-800">{(selected as any).tutor_notes}</p>
                {(selected as any).homework_assigned && (
                  <p className="text-xs text-indigo-700">
                    <span className="font-semibold">Homework: </span>{(selected as any).homework_assigned}
                  </p>
                )}
                {(selected as any).notes_submitted_at && (
                  <p className="text-xs text-indigo-400">
                    Submitted {format(new Date((selected as any).notes_submitted_at), 'MMM d, yyyy h:mm a')}
                  </p>
                )}
              </div>
            )}

            {/* Existing scores */}
            {((selected as any).student_progress?.length ?? 0) > 0 && (() => {
              const scores = [...((selected as any).student_progress ?? [])].sort((a: any, b: any) =>
                new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
              );
              const latest = scores[0];
              return (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">Latest Logged Score</p>
                  <div className="flex gap-4 text-sm">
                    {latest.math_score    && <span><span className="text-gray-500">Math:</span> <strong>{latest.math_score}</strong></span>}
                    {latest.reading_score && <span><span className="text-gray-500">Reading:</span> <strong>{latest.reading_score}</strong></span>}
                    {latest.writing_score && <span><span className="text-gray-500">Writing:</span> <strong>{latest.writing_score}</strong></span>}
                    {latest.total_score   && <span><span className="text-gray-500">Total:</span> <strong className="text-indigo-700 text-base">{latest.total_score}</strong></span>}
                  </div>
                  <p className="text-xs text-indigo-400 mt-1">{scores.length} score{scores.length > 1 ? 's' : ''} logged</p>
                </div>
              );
            })()}

            {/* Log Progress Scores */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-semibold text-gray-900 mb-3">Log Progress Scores</p>
              <div className="grid grid-cols-4 gap-2">
                {(['math', 'reading', 'writing', 'total'] as const).map(field => (
                  <div key={field}>
                    <label className="label text-xs capitalize">{field}</label>
                    <input
                      type="number"
                      value={progressForm[field]}
                      onChange={e => setProgressForm(p => ({ ...p, [field]: e.target.value }))}
                      className="input text-sm"
                      placeholder={field === 'total' ? '400–1600' : '200–800'}
                    />
                  </div>
                ))}
              </div>
              <button onClick={logProgress} disabled={saving} className="btn-secondary mt-3 text-sm">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Log Scores
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}
