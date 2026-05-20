'use client';

import { useEffect, useState } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { Check, Clock } from 'lucide-react';

export default function TutorPayrollPage() {
  const { tutor, loading } = useTutorAuth();
  const supabase = createClient();
  const [lineItems, setLineItems] = useState<any[]>([]);

  useEffect(() => {
    if (!tutor) return;
    supabase
      .from('payroll_line_items')
      .select('*, run:payroll_runs(period_start, period_end, generated_at)')
      .eq('tutor_id', tutor.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setLineItems((data as any[]) ?? []));
  }, [tutor]);

  const totalEarned  = lineItems.filter(l => l.status === 'paid').reduce((s, l) => s + l.amount_owed, 0);
  const totalPending = lineItems.filter(l => l.status === 'pending').reduce((s, l) => s + l.amount_owed, 0);

  if (loading) return null;

  return (
    <TutorPortalLayout tutor={tutor}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
        <p className="text-gray-500 text-sm mt-1">Your earnings history</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs text-gray-500 font-medium">Total Earned</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">${totalEarned.toFixed(2)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 font-medium">Pending</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">${totalPending.toFixed(2)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 font-medium">Hourly Rate</p>
          <p className="text-2xl font-bold text-navy-900 mt-1">${tutor?.hourly_rate}/hr</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-header">Period</th>
              <th className="table-header text-right">Sessions</th>
              <th className="table-header text-right">Hours</th>
              <th className="table-header text-right">Rate</th>
              <th className="table-header text-right">Amount</th>
              <th className="table-header text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {lineItems.length === 0 && (
              <tr><td colSpan={6} className="table-cell text-center py-8 text-gray-400">No payroll records yet.</td></tr>
            )}
            {lineItems.map((l: any) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="table-cell text-sm">
                  {l.run?.period_start} – {l.run?.period_end}
                </td>
                <td className="table-cell text-right">{l.sessions_count}</td>
                <td className="table-cell text-right">
                  <span>{(l.total_minutes / 60).toFixed(2)}</span>
                  {(l.catchup_sessions_count ?? 0) > 0 && (
                    <p className="text-xs text-blue-600 flex items-center justify-end gap-0.5 mt-0.5">
                      <Clock className="w-3 h-3" />
                      Incl. {l.catchup_sessions_count} catch-up ({(l.catchup_minutes / 60).toFixed(1)} hr)
                    </p>
                  )}
                </td>
                <td className="table-cell text-right">${l.hourly_rate}/hr</td>
                <td className="table-cell text-right font-semibold">${Number(l.amount_owed).toFixed(2)}</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TutorPortalLayout>
  );
}
