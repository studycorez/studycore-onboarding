'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { DollarSign, Download, Loader2, Check, Save, AlertTriangle, Mail, ArrowUp, ArrowDown, Clock } from 'lucide-react';
import Link from 'next/link';

interface PayrollLine {
  tutor_id: string;
  tutor_name: string;
  hourly_rate: number;
  sessions_count: number;
  current_period_minutes: number;
  catchup_minutes: number;
  catchup_sessions_count: number;
  total_minutes: number;
  payable_minutes: number;
  amount_owed: number;
  status: 'pending' | 'paid';
  actually_paid_amount: number | null;
}

interface ExcludedTutor {
  tutor_id: string;
  tutor_name: string;
  excluded_count: number;
}

interface FlaggedSession {
  tutor_id: string;
  tutor_name: string;
  session_id: string;
  scheduled_at: string;
  scheduled_minutes: number;
  reported_minutes: number;
}

function PaymentStatusBadge({ line }: { line: PayrollLine }) {
  if (line.actually_paid_amount === null) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
        Not yet paid
      </span>
    );
  }
  const diff = parseFloat((line.actually_paid_amount - line.amount_owed).toFixed(2));
  if (Math.abs(diff) < 0.01) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <Check className="w-3 h-3" /> Paid in full
      </span>
    );
  }
  if (diff > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        <ArrowUp className="w-3 h-3" /> Overpaid ${diff.toFixed(2)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <ArrowDown className="w-3 h-3" /> Underpaid ${Math.abs(diff).toFixed(2)}
    </span>
  );
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
  const [excluded,    setExcluded]    = useState<ExcludedTutor[]>([]);
  const [flagged,     setFlagged]     = useState<FlaggedSession[]>([]);
  const [generated,   setGenerated]   = useState(false);
  const [generating,  setGenerating]  = useState(false);
  const [savedRunId,  setSavedRunId]  = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [zeroRateTutors, setZeroRateTutors] = useState<{ id: string; name: string }[]>([]);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [emailsSent,    setEmailsSent]    = useState<number | null>(null);
  const [emailsError,   setEmailsError]   = useState('');

  useEffect(() => {
    // Show archived tutors here — historical payroll data must include past tutors
    supabase.from('tutors').select('id, name, hourly_rate')
      .then(({ data }) => {
        setZeroRateTutors((data ?? []).filter((t: any) => !t.hourly_rate || t.hourly_rate === 0));
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalSessions     = lines.reduce((s, l) => s + l.sessions_count, 0);
  const totalMinutes      = lines.reduce((s, l) => s + l.total_minutes, 0);
  const totalPayable      = lines.reduce((s, l) => s + l.payable_minutes, 0);
  const totalAmount       = lines.reduce((s, l) => s + l.amount_owed, 0);
  const totalActuallyPaid = lines
    .filter(l => l.actually_paid_amount !== null)
    .reduce((s, l) => s + (l.actually_paid_amount ?? 0), 0);
  const totalCatchup      = lines.reduce((s, l) => s + l.catchup_sessions_count, 0);

  async function generatePayroll() {
    setGenerating(true);
    setError('');
    setSavedRunId(null);
    setLines([]);
    setExcluded([]);
    setFlagged([]);
    setGenerated(false);

    const res = await fetch('/api/admin/payroll/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period_start: periodStart, period_end: periodEnd }),
    });
    const data = await res.json();
    setGenerating(false);

    if (!res.ok) {
      setError(data.error ?? 'Failed to generate payroll');
      return;
    }

    setLines(data.line_items ?? []);
    setExcluded(data.excluded ?? []);
    setFlagged(data.flagged ?? []);
    setSavedRunId(data.run_id ?? null);
    setGenerated(true);
  }

  function setActuallyPaid(tutorId: string, amount: number | null) {
    setLines(prev => prev.map(l =>
      l.tutor_id === tutorId ? { ...l, actually_paid_amount: amount } : l
    ));
  }

  function markPaid(tutorId: string) {
    setLines(prev => prev.map(l =>
      l.tutor_id === tutorId
        ? { ...l, status: 'paid', actually_paid_amount: l.actually_paid_amount ?? l.amount_owed }
        : l
    ));
  }

  function markAllPaid() {
    setLines(prev => prev.map(l => ({
      ...l,
      status: 'paid',
      actually_paid_amount: l.actually_paid_amount ?? l.amount_owed,
    })));
  }

  async function savePayments() {
    if (!savedRunId) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/payroll/${savedRunId}/payments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: lines.map(l => ({
          tutor_id:             l.tutor_id,
          actually_paid_amount: l.actually_paid_amount,
          status:               l.status,
        })) }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Failed to save payments');
    } finally {
      setSaving(false);
    }
  }

  function exportCSV() {
    const rows = [
      ['Tutor', 'Sessions', 'Period Minutes', 'Catch-up Minutes', 'Total Minutes', 'Payable Minutes', 'Hourly Rate', 'Amount Owed', 'Actually Paid', 'Status'],
      ...lines.map(l => [
        l.tutor_name,
        l.sessions_count,
        l.current_period_minutes,
        l.catchup_minutes,
        l.total_minutes,
        l.payable_minutes,
        `$${l.hourly_rate}`,
        `$${l.amount_owed.toFixed(2)}`,
        l.actually_paid_amount != null ? `$${l.actually_paid_amount.toFixed(2)}` : '',
        l.status,
      ]),
      ['TOTAL', totalSessions, '', '', totalMinutes, totalPayable, '', `$${totalAmount.toFixed(2)}`, `$${totalActuallyPaid.toFixed(2)}`, ''],
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
            {' '}— they will be excluded from payroll.{' '}
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
        {generated && savedRunId && (
          <p className="text-xs text-gray-400 mt-2">
            Run created — ID: <span className="font-mono">{savedRunId.slice(0, 8)}…</span>
            {' '}Regenerate to recalculate (clears and re-stamps sessions).
          </p>
        )}
      </div>

      {/* Results */}
      {generated && (
        <>
          {lines.length === 0 ? (
            <div className="card p-8 text-center text-gray-400">
              No payable sessions found for this period.
              {excluded.length > 0 && (
                <p className="text-xs mt-2 text-amber-600">
                  {excluded.reduce((s, e) => s + e.excluded_count, 0)} completed sessions were excluded — missing session reports.
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Catch-up banner */}
              {totalCatchup > 0 && (
                <div className="mb-4 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
                  <Clock className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
                  <span>
                    <span className="font-semibold">{totalCatchup} catch-up session{totalCatchup !== 1 ? 's' : ''} included</span>
                    {' '}— these were completed before this period but their reports were filed recently.
                  </span>
                </div>
              )}

              {/* Flagged sessions — reported longer than scheduled */}
              {flagged.length > 0 && (
                <div className="mb-4 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
                  <div>
                    {(() => {
                      const overReports = flagged.filter(f => f.reported_minutes > f.scheduled_minutes);
                      const underReports = flagged.filter(f => f.reported_minutes < f.scheduled_minutes);
                      return (
                        <>
                          <p className="font-semibold mb-1">
                            ⚠ {flagged.length} session{flagged.length !== 1 ? 's' : ''} with duration variance &gt; 5 min
                            {overReports.length > 0 && <span className="text-red-700"> · {overReports.length} over-reported</span>}
                            {underReports.length > 0 && <span className="text-orange-700"> · {underReports.length} under-reported</span>}
                          </p>
                          <ul className="space-y-0.5">
                            {flagged.map(f => {
                              const diff = f.reported_minutes - f.scheduled_minutes;
                              const isOver = diff > 0;
                              return (
                                <li key={f.session_id} className={isOver ? 'text-red-700' : 'text-orange-700'}>
                                  {isOver ? '▲' : '▼'} {f.tutor_name} · {format(new Date(f.scheduled_at), 'MMM d')}:{' '}
                                  reported {f.reported_minutes} min vs scheduled {f.scheduled_minutes} min ({diff > 0 ? '+' : ''}{diff} min)
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              <div className="card overflow-hidden mb-4">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-header">Tutor</th>
                      <th className="table-header text-right">Sessions</th>
                      <th className="table-header text-right">Period Min</th>
                      <th className="table-header text-right">Catch-up</th>
                      <th className="table-header text-right">Actual → Payable</th>
                      <th className="table-header text-right">Flagged Diff</th>
                      <th className="table-header text-right">Hourly Rate</th>
                      <th className="table-header text-right">Amount Owed</th>
                      <th className="table-header text-right">Actually Paid</th>
                      <th className="table-header text-center">Payment Status</th>
                      <th className="table-header"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {lines.map(l => (
                      <tr key={l.tutor_id} className="hover:bg-gray-50">
                        <td className="table-cell font-medium">
                          {l.tutor_name}
                        </td>
                        <td className="table-cell text-right">{l.sessions_count}</td>
                        <td className="table-cell text-right text-sm text-gray-600">
                          {l.current_period_minutes} min
                        </td>
                        <td className="table-cell text-right text-sm">
                          {l.catchup_sessions_count > 0 ? (
                            <span className="inline-flex items-center gap-1 text-blue-600 font-medium">
                              <Clock className="w-3 h-3" />
                              {l.catchup_sessions_count} ({l.catchup_minutes} min)
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="table-cell text-right text-sm">
                          <span className="text-gray-500">{l.total_minutes} min</span>
                          {l.total_minutes !== l.payable_minutes && (
                            <>
                              <span className="text-gray-400"> → </span>
                              <span className="font-medium text-gray-700">{l.payable_minutes} min</span>
                            </>
                          )}
                        </td>
                        <td className="table-cell text-right text-xs">
                          {(() => {
                            const tutorFlags = flagged.filter(f => f.tutor_id === l.tutor_id);
                            if (tutorFlags.length === 0) return <span className="text-green-600">0m</span>;
                            const aggDiff = tutorFlags.reduce((sum, f) => sum + (f.reported_minutes - f.scheduled_minutes), 0);
                            const color = aggDiff > 5 ? 'text-red-600' : aggDiff < -5 ? 'text-orange-600' : 'text-gray-500';
                            return <span className={`font-medium ${color}`}>{aggDiff > 0 ? '+' : ''}{aggDiff}m</span>;
                          })()}
                        </td>
                        <td className="table-cell text-right">${l.hourly_rate}/hr</td>
                        <td className="table-cell text-right font-semibold text-gray-900">
                          ${l.amount_owed.toFixed(2)}
                        </td>
                        {/* Actually Paid — editable input */}
                        <td className="table-cell text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400 text-xs">$</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={l.actually_paid_amount ?? ''}
                                placeholder={l.amount_owed.toFixed(2)}
                                onChange={e => {
                                  const val = e.target.value;
                                  setActuallyPaid(l.tutor_id, val === '' ? null : parseFloat(val));
                                }}
                                className="w-24 text-right text-sm border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-navy-500"
                              />
                            </div>
                            {l.actually_paid_amount !== null && (() => {
                              const diff = parseFloat((l.actually_paid_amount - l.amount_owed).toFixed(2));
                              if (Math.abs(diff) < 0.01) return null;
                              return (
                                <span className={`text-xs font-medium ${diff > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                  {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                                </span>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="table-cell text-center">
                          <PaymentStatusBadge line={l} />
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
                        {lines.reduce((s, l) => s + l.current_period_minutes, 0)} min
                      </td>
                      <td className="table-cell text-right text-navy-900 text-sm">
                        {totalCatchup > 0 ? `${totalCatchup} (${lines.reduce((s, l) => s + l.catchup_minutes, 0)} min)` : '—'}
                      </td>
                      <td className="table-cell text-right text-navy-900 text-sm">
                        {totalMinutes} min → {totalPayable} min
                      </td>
                      <td className="table-cell text-right text-navy-900 text-xs">
                        {(() => {
                          const totalDiff = flagged.reduce((sum, f) => sum + (f.reported_minutes - f.scheduled_minutes), 0);
                          if (totalDiff === 0) return '0m';
                          return <span className={totalDiff > 0 ? 'text-red-600' : 'text-orange-600'}>{totalDiff > 0 ? '+' : ''}{totalDiff}m</span>;
                        })()}
                      </td>
                      <td className="table-cell text-right text-navy-900">—</td>
                      <td className="table-cell text-right text-navy-900 text-base">${totalAmount.toFixed(2)}</td>
                      <td className="table-cell text-right text-navy-900 text-base">
                        {lines.some(l => l.actually_paid_amount !== null)
                          ? `$${totalActuallyPaid.toFixed(2)}`
                          : '—'
                        }
                      </td>
                      <td className="table-cell" colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Excluded sessions warning */}
              {excluded.length > 0 && (
                <div className="mb-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
                  <div>
                    <p className="font-semibold mb-1">Sessions excluded — missing reports:</p>
                    <ul className="space-y-0.5">
                      {excluded.map(e => (
                        <li key={e.tutor_id}>
                          {e.tutor_name}: {e.excluded_count} session{e.excluded_count !== 1 ? 's' : ''} not paid (no report filed)
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

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
                {savedRunId && (
                  <button
                    onClick={savePayments}
                    disabled={saving}
                    className="btn-primary flex items-center gap-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Saving…' : 'Save Payment Amounts'}
                  </button>
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
