'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { StatusBadge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';
import type { Contract } from '@/types';
import { formatDateTime } from '@/lib/utils';
import { AlertTriangle, Send, Slash } from 'lucide-react';

export default function AdminContractsPage() {
  const supabase = createClient();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading]     = useState(true);
  const [acting, setActing]       = useState<string | null>(null); // contract id being actioned

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('contracts')
      .select('*, tutor:tutors(name, email), student:students(name)')
      .order('created_at', { ascending: false });
    setContracts((data as Contract[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function action(contractId: string, endpoint: string) {
    setActing(contractId);
    await fetch(`/api/contracts/${contractId}/${endpoint}`, { method: 'POST' });
    await load();
    setActing(null);
  }

  async function handleVoid(contractId: string) {
    if (!window.confirm('Void this contract? The tutor will no longer be able to sign it.')) return;
    await action(contractId, 'void');
  }

  async function handleViolation(contractId: string) {
    await action(contractId, 'violation');
  }

  async function handleRemind(contractId: string) {
    await action(contractId, 'remind');
  }

  return (
    <AdminLayout>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contracts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage tutor commitment contracts. Create new contracts from a tutor&apos;s profile page.
          </p>
        </div>
        <span className="text-xs text-gray-400 mt-1">{contracts.length} total</span>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">Loading…</div>
        ) : contracts.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">
            No contracts yet. Go to a tutor&apos;s profile to send one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header">Tutor</th>
                  <th className="table-header">Student</th>
                  <th className="table-header">Rate</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Signed</th>
                  <th className="table-header">Violations</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {contracts.map(c => {
                  const tutor   = (c.tutor   as any);
                  const student = (c.student as any);
                  const busy    = acting === c.id;
                  const isVoided = c.status === 'voided';
                  const isSigned = c.status === 'signed';

                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="table-cell">
                        <div className="font-medium text-gray-900">{tutor?.name ?? '—'}</div>
                        <div className="text-xs text-gray-400">{tutor?.email ?? ''}</div>
                      </td>
                      <td className="table-cell text-gray-700">{student?.name ?? '—'}</td>
                      <td className="table-cell text-gray-700">${c.hourly_rate}/hr</td>
                      <td className="table-cell"><StatusBadge status={c.status} /></td>
                      <td className="table-cell text-gray-500 text-sm">
                        {c.signed_at ? formatDateTime(c.signed_at) : '—'}
                      </td>
                      <td className="table-cell">
                        <span className={`font-semibold text-sm ${c.violation_count >= 3 ? 'text-red-600' : c.violation_count > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                          {c.violation_count}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1.5">
                          {/* Remind */}
                          <button
                            onClick={() => handleRemind(c.id)}
                            disabled={busy || isSigned || isVoided}
                            title="Resend contract email"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:border-navy-300 hover:text-navy-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <Send className="w-3 h-3" /> Remind
                          </button>

                          {/* Log Violation */}
                          <button
                            onClick={() => handleViolation(c.id)}
                            disabled={busy || isVoided}
                            title="Log a violation"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <AlertTriangle className="w-3 h-3" /> Violation
                          </button>

                          {/* Void */}
                          <button
                            onClick={() => handleVoid(c.id)}
                            disabled={busy || isVoided}
                            title="Void this contract"
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
