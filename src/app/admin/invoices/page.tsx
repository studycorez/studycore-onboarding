'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { StatusBadge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';
import type { Invoice } from '@/types';
import { format } from 'date-fns';
import { Plus, Send, Check, Slash, Loader2 } from 'lucide-react';

export default function InvoicesPage() {
  const supabase = createClient();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);
  const [acting, setActing]     = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [students, setStudents]     = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ student_id: '', period_start: '', period_end: '', amount: '', notes: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('invoices')
      .select('*, student:students(name, email, parent_email)')
      .order('created_at', { ascending: false });
    setInvoices((data as Invoice[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    supabase.from('students').select('id, name').eq('status', 'active').order('name')
      .then(({ data }) => setStudents((data as any[]) ?? []));
  }, [load]);

  async function doAction(invoiceId: string, endpoint: string) {
    setActing(invoiceId);
    await fetch(`/api/invoices/${invoiceId}/${endpoint}`, { method: 'POST' });
    await load();
    setActing(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
    });
    const data = await res.json();
    if (!res.ok) { setCreateError(data.error ?? 'Failed to create invoice'); setCreating(false); return; }
    setForm({ student_id: '', period_start: '', period_end: '', amount: '', notes: '' });
    setShowCreate(false);
    await load();
    setCreating(false);
  }

  function fmtDate(d: string) { return format(new Date(d), 'MMM d, yyyy'); }
  function fmtAmt(n: number)  { return `$${Number(n).toFixed(2)}`; }

  return (
    <AdminLayout>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">Track and send parent billing invoices.</p>
        </div>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Invoice
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="card p-6 mb-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Create Invoice</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Student *</label>
              <select value={form.student_id} onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))} className="input" required>
                <option value="">Select student…</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Amount ($) *</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="input" placeholder="0.00" required />
            </div>
            <div>
              <label className="label">Period Start *</label>
              <input type="date" value={form.period_start} onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} className="input" required />
            </div>
            <div>
              <label className="label">Period End *</label>
              <input type="date" value={form.period_end} onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} className="input" required />
            </div>
            <div className="col-span-2">
              <label className="label">Notes (optional)</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input" rows={2} placeholder="e.g. 8 sessions at $50/hr…" />
            </div>
          </div>
          {createError && <p className="text-sm text-red-500">{createError}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={creating} className="btn-primary flex items-center gap-2">
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              {creating ? 'Creating…' : 'Create Draft'}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Invoices table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">No invoices yet. Create one above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header">Student</th>
                  <th className="table-header">Period</th>
                  <th className="table-header">Amount</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Sent</th>
                  <th className="table-header">Paid</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invoices.map(inv => {
                  const student = (inv.student as any);
                  const busy    = acting === inv.id;
                  const isVoided = inv.status === 'voided';
                  const isPaid   = inv.status === 'paid';
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="table-cell">
                        <p className="font-medium text-gray-900">{student?.name ?? '—'}</p>
                        <p className="text-xs text-gray-400">{student?.email ?? ''}</p>
                      </td>
                      <td className="table-cell text-gray-600 text-sm">
                        {fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}
                      </td>
                      <td className="table-cell font-semibold text-gray-900">{fmtAmt(inv.amount)}</td>
                      <td className="table-cell"><StatusBadge status={inv.status} /></td>
                      <td className="table-cell text-gray-500 text-sm">{inv.sent_at ? format(new Date(inv.sent_at), 'MMM d') : '—'}</td>
                      <td className="table-cell text-gray-500 text-sm">{inv.paid_at ? format(new Date(inv.paid_at), 'MMM d') : '—'}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Send */}
                          <button
                            onClick={() => doAction(inv.id, 'send')}
                            disabled={busy || isVoided}
                            title="Send invoice email"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Send
                          </button>

                          {/* Mark Paid */}
                          <button
                            onClick={() => doAction(inv.id, 'pay')}
                            disabled={busy || isPaid || isVoided}
                            title="Mark as paid"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <Check className="w-3 h-3" /> Paid
                          </button>

                          {/* Void */}
                          <button
                            onClick={() => doAction(inv.id, 'void')}
                            disabled={busy || isVoided}
                            title="Void invoice"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <Slash className="w-3 h-3" /> Void
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
