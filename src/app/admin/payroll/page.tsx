'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { DollarSign, Download, Loader2, Check, Save, AlertTriangle, Mail } from 'lucide-react';
import Link from 'next/link';
import { computePayableMinutes } from '@/lib/payroll';

interface PayrollLine {
  tutor_id: string;
  tutor_name: string;
  hourly_rate: number;
  sessions_count: number;
  logs_filed: number;          // informational only — does not affect pay
  absent_sessions: number;     // tutor_attended === false → $0
  pending_review: number;      // tutor_attended === null → excluded from pay
  total_minutes: number;       // scheduled minutes for attended sessions only
  payable_minutes: number;     // rounded per policy (used for pay calc)
  amount_owed: number;
  status: 'pending' | 'paid';
}

function defaultDates() {
  const prevWeek = subWeeks(new Date(), 1);
  return {
    start: format(startOfWeek(prevWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    end:   format(endOfWeek(prevWeek,   { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  };
}

export default function PayrollPage() {
  const supabase = createClient();
  const defaults = defaultDates();

  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd,   setPeriodEnd]   = useState(defaults.end);
  const [lines,       setLines]       = useState<PayrollLine[]>([]);
  const [generated,   setGenerated]   = useState(false);
  const [generating,  setGenerating]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [savedRunId,  setSavedRunId]  = useState<string | null>(null);
  const [error,       setError]       = useState('');
  const [zeroRateTutors, setZeroRateTutors] = useState<{ id: string; name: string }[]>([]);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [emailsSent,    setEmailsSent]    = useState<number | null>(null);
  const [emailsError,   setEmailsError]   = useState('');

  useEffect(() => {
    // Show archived tutors here — historical payroll data must include past tutors
    supabase.from('tutors').select('id, name, hourly_rate')
      .then(({ data }) => {
        setZeroRateTutors((data ?? []).filter(t => !t.hourly_rate || t.hourly_rate === 0));
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalSessions = lines.reduce((s, l) => s + l.sessions_count, 0);
  const totalMinutes  = lines.reduce((s, l) => s + l.total_minutes, 0);
  const totalAmount   = lines.reduce((s, l) => s + l.amount_owed, 0);

  async function generatePayroll() {
    setGenerating(true);
    setError('');
    setSavedRunId(null);

    // Payroll is attendance-gated: tutor_attended=true → pay, false → $0, null → pending review.
    // ghost_pending/ghost_confirmed sessions are excluded from pay entirely.
    const { data, error: err } = await supabase
      .from('sessions')
      .select('id, tutor_id, duration_minutes, tutor_attended, tutor:tutors(name, hourly_rate)')
      .eq('status', 'completed')
      .gte('scheduled_at', periodStart + 'T00:00:00.000Z')
      .lte('scheduled_at', periodEnd   + 'T23:59:59.999Z')
      .or('attendance_review_status.is.null,attendance_review_status.eq.real_confirmed');

    if (err) {
      setError(err.message);
      setGenerating(false);
      return;
    }

    // Fetch session_logs for all sessions in batches of 200 (URL length safety)
    const allSessionIds = (data ?? []).map((s: any) => s.id as string);
    const loggedSessionIds = new Set<string>();
    const BATCH_SIZE = 200;
    for (let i = 0; i < allSessionIds.length; i += BATCH_SIZE) {
      const chunk = allSessionIds.slice(i, i + BATCH_SIZE);
      const { data: logs } = await supabase
        .from('session_logs')
        .select('session_id')
        .in('session_id', chunk);
      for (const log of logs ?? []) loggedSessionIds.add(log.session_id);
    }

    const map = new Map<string, PayrollLine>();
    for (const s of data ?? []) {
      const tutor = (s as any).tutor;
      if (!tutor || !s.tutor_id) continue;
      if (!map.has(s.tutor_id)) {
        map.set(s.tutor_id, {
          tutor_id:        s.tutor_id,
          tutor_name:      tutor.name,
          hourly_rate:     tutor.hourly_rate ?? 0,
          sessions_count:  0,
          logs_filed:      0,
          absent_sessions: 0,
          pending_review:  0,
          total_minutes:   0,
          payable_minutes: 0,
          amount_owed:     0,
          status:          'pending',
        });
      }
      const line = map.get(s.tutor_id)!;
      const sessionMinutes = (s as any).duration_minutes ?? 0;
      const attended = (s as any).tutor_attended as boolean | null;
      line.sessions_count += 1;
      if (loggedSessionIds.has(s.id)) line.logs_filed += 1;
      if (attended === false) {
        line.absent_sessions += 1;
        // $0 for confirmed absences — no minutes added
      } else if (attended === null) {
        line.pending_review += 1;
        // Excluded from pay calculation pending sync
      } else {
        // tutor_attended === true (or pre-attendance-era rows where it's always paid)
        line.total_minutes   += sessionMinutes;
        line.payable_minutes += computePayableMinutes(sessionMinutes);
      }
      line.amount_owed = parseFloat(((line.payable_minutes / 60) * line.hourly_rate).toFixed(2));
    }

    setLines(Array.from(map.values()).sort((a, b) => a.tutor_name.localeCompare(b.tutor_name)));
    setGenerated(true);
    setGenerating(false);
  }

  function markPaid(tutorId: string) {
    setLines(prev => prev.map(l => l.tutor_id === tutorId ? { ...l, status: 'paid' } : l));
  }

  function markAllPaid() {
    setLines(prev => prev.map(l => ({ ...l, status: 'paid' })));
  }

  function exportCSV() {
    const totalPayableMinutes = lines.reduce((s, l) => s + l.payable_minutes, 0);
    const rows = [
      ['Tutor', 'Sessions', 'Logs Filed', 'Absent', 'Pending Review', 'Attended Minutes', 'Payable Minutes', 'Hourly Rate', 'Amount Owed', 'Status'],
      ...lines.map(l => [
        l.tutor_name,
        l.sessions_count,
        `${l.logs_filed} / ${l.sessions_count}`,
        l.absent_sessions,
        l.pending_review,
        l.total_minutes,
        l.payable_minutes,
        `$${l.hourly_rate}`,
        `$${l.amount_owed.toFixed(2)}`,
        l.status,
      ]),
      ['TOTAL', totalSessions, '', '', '', totalMinutes, totalPayableMinutes, '', `$${totalAmount.toFixed(2)}`, ''],
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll_${periodStart}_to_${periodEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveRun() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_start:  periodStart,
          period_end:    periodEnd,
          lines,
          total_amount:  totalAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to save payroll run');
        return;
      }
      setSavedRunId(data.run_id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
        <p className="text-gray-500 text-sm mt-1">Generate and track tutor payments</p>
      </div>

      {zeroRateTutors.length > 0 && (
        <div className="mb-5 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
          <span>
            <span className="font-semibold">{zeroRateTutors.length} tutor{zeroRateTutors.length !== 1 ? 's' : ''} have no hourly rate set</span>
            {' '}— payroll will be inaccurate.{' '}
            <Link href="/tutors" className="underline hover:text-amber-900">Set rates →</Link>
          </span>
        </div>
      )}

      {/* Controls */}
      <div className="card p-5 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label">Period Start</label>
            <input
              type="date"
              value={periodStart}
              onChange={e => { setPeriodStart(e.target.value); setGenerated(false); }}
              className="input w-auto"
            />
          </div>
          <div>
            <label className="label">Period End</label>
            <input
              type="date"
              value={periodEnd}
              onChange={e => { setPeriodEnd(e.target.value); setGenerated(false); }}
              className="input w-auto"
            />
          </div>
          <button
            onClick={generatePayroll}
            disabled={generating || !periodStart || !periodEnd}
            className="btn-primary flex items-center gap-2"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
            {generating ? 'Generating…' : 'Generate Payroll'}
          </button>
        </div>
        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
      </div>

      {/* Results */}
      {generated && (
        <>
          {lines.length === 0 ? (
            <div className="card p-8 text-center text-gray-400">
              No completed sessions with session logs found for this period.
            </div>
          ) : (
            <>
              <div className="card overflow-hidden mb-4">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-header">Tutor</th>
                      <th className="table-header text-right">Sessions</th>
                      <th className="table-header text-right">Logs</th>
                      <th className="table-header text-right">Absent</th>
                      <th className="table-header text-right">Pending Review</th>
                      <th className="table-header text-right">Actual → Payable</th>
                      <th className="table-header text-right">Hourly Rate</th>
                      <th className="table-header text-right">Amount Owed</th>
                      <th className="table-header text-center">Status</th>
                      <th className="table-header"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {lines.map(l => (
                      <tr key={l.tutor_id} className="hover:bg-gray-50">
                        <td className="table-cell font-medium">{l.tutor_name}</td>
                        <td className="table-cell text-right">{l.sessions_count}</td>
                        <td className={`table-cell text-right text-sm font-medium ${l.logs_filed === l.sessions_count ? 'text-green-600' : 'text-amber-600'}`}>
                          {l.logs_filed} / {l.sessions_count}
                        </td>
                        <td className={`table-cell text-right text-sm font-medium ${l.absent_sessions > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {l.absent_sessions > 0 ? l.absent_sessions : '—'}
                        </td>
                        <td className={`table-cell text-right text-sm font-medium ${l.pending_review > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                          {l.pending_review > 0 ? l.pending_review : '—'}
                        </td>
                        <td className="table-cell text-right text-sm">
                          <span className="text-gray-500">{l.total_minutes} min</span>
                          {l.total_minutes !== l.payable_minutes && (
                            <span className="text-gray-400"> → </span>
                          )}
                          {l.total_minutes !== l.payable_minutes && (
                            <span className="font-medium text-gray-700">{l.payable_minutes} min</span>
                          )}
                        </td>
                        <td className="table-cell text-right">${l.hourly_rate}/hr</td>
                        <td className="table-cell text-right font-semibold text-gray-900">
                          ${l.amount_owed.toFixed(2)}
                        </td>
                        <td className="table-cell text-center">
                          {l.status === 'paid' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              <Check className="w-3 h-3" /> Paid
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="table-cell">
                          {l.status !== 'paid' && (
                            <button
                              onClick={() => markPaid(l.tutor_id)}
                              className="text-xs font-medium text-navy-600 hover:text-navy-800"
                            >
                              Mark Paid
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}

                    {/* Summary row */}
                    <tr className="bg-navy-50 font-semibold">
                      <td className="table-cell text-navy-900">Total</td>
                      <td className="table-cell text-right text-navy-900">{totalSessions}</td>
                      <td className="table-cell text-right text-navy-900 text-sm">
                        {lines.reduce((s, l) => s + l.logs_filed, 0)} / {totalSessions}
                      </td>
                      <td className="table-cell text-right text-navy-900 text-sm">
                        {lines.reduce((s, l) => s + l.absent_sessions, 0) || '—'}
                      </td>
                      <td className="table-cell text-right text-navy-900 text-sm">
                        {lines.reduce((s, l) => s + l.pending_review, 0) || '—'}
                      </td>
                      <td className="table-cell text-right text-navy-900 text-sm">
                        {totalMinutes} min → {lines.reduce((s, l) => s + l.payable_minutes, 0)} min
                      </td>
                      <td className="table-cell text-right text-navy-900">—</td>
                      <td className="table-cell text-right text-navy-900 text-base">${totalAmount.toFixed(2)}</td>
                      <td className="table-cell" colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 items-center">
                <button onClick={markAllPaid} className="btn-secondary flex items-center gap-2">
                  <Check className="w-4 h-4" /> Mark All Paid
                </button>
                <button onClick={exportCSV} className="btn-secondary flex items-center gap-2">
                  <Download className="w-4 h-4" /> Export CSV
                </button>
                <button
                  onClick={async () => {
                    setSendingEmails(true);
                    setEmailsError('');
                    setEmailsSent(null);
                    const paidLines = lines.filter(l => l.status === 'paid');
                    if (paidLines.length === 0) { setEmailsError('Mark tutors as paid first.'); setSendingEmails(false); return; }
                    const res = await fetch('/api/payroll/send-emails', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ lines: paidLines, period_start: periodStart, period_end: periodEnd }),
                    });
                    const d = await res.json();
                    setSendingEmails(false);
                    if (!res.ok) { setEmailsError(d.error ?? 'Failed to send'); }
                    else { setEmailsSent(d.sent); }
                  }}
                  disabled={sendingEmails}
                  className="btn-secondary flex items-center gap-2"
                >
                  {sendingEmails ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {sendingEmails ? 'Sending…' : emailsSent !== null ? `Sent to ${emailsSent}` : 'Send Payment Emails'}
                </button>
                <button
                  onClick={saveRun}
                  disabled={saving || !!savedRunId}
                  className="btn-primary flex items-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Saving…' : savedRunId ? 'Saved ✓' : 'Save Payroll Run'}
                </button>
                {savedRunId && (
                  <span className="text-sm text-green-600 font-medium">
                    Run saved (ID: {savedRunId.slice(0, 8)}…)
                  </span>
                )}
                {emailsError && <span className="text-sm text-red-500">{emailsError}</span>}
              </div>
            </>
          )}
        </>
      )}
    </AdminLayout>
  );
}
