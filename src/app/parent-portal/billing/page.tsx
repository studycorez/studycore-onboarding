'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useParentAuth } from '@/hooks/useParentAuth';
import ParentPortalLayout from '@/components/parent-portal/ParentPortalLayout';
import { CreditCard, Check, Loader2, FileText, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface Invoice {
  id: string;
  student_id: string;
  period_start: string;
  period_end: string;
  amount: number;
  status: string;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

const PACKAGES = [
  { hours: 10, price: 350,  label: 'Starter',  perHour: '$35/hr',  popular: false },
  { hours: 20, price: 640,  label: 'Standard', perHour: '$32/hr',  popular: true  },
  { hours: 30, price: 900,  label: 'Premium',  perHour: '$30/hr',  popular: false },
] as const;

export default function BillingPage() {
  const { parent, loading: authLoading } = useParentAuth();
  const searchParams = useSearchParams();
  const successHours = searchParams.get('hours');
  const showSuccess  = searchParams.get('success') === '1';

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [invoices, setInvoices]   = useState<Invoice[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<number | null>(null);

  // Auto-select first student
  useEffect(() => {
    if (parent?.students.length && !selectedStudentId) {
      setSelectedStudentId(parent.students[0].id);
    }
  }, [parent, selectedStudentId]);

  // Load invoices
  useEffect(() => {
    fetch('/api/parent-portal/billing/invoices')
      .then(r => r.json())
      .then(data => { setInvoices(Array.isArray(data) ? data : []); setInvoiceLoading(false); });
  }, []);

  async function buyPackage(hours: number) {
    if (!selectedStudentId || purchasing) return;
    setPurchasing(hours);
    const res = await fetch('/api/parent-portal/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: selectedStudentId, hours }),
    });
    if (res.ok) {
      const { url } = await res.json();
      if (url) window.location.href = url;
    } else {
      setPurchasing(null);
    }
  }

  const student = parent?.students.find(s => s.id === selectedStudentId);
  const purchased = student?.purchased_hours ?? 0;
  const used      = student?.used_hours ?? 0;
  const remaining = purchased - used;
  const pctUsed   = purchased > 0 ? Math.min(100, Math.round((used / purchased) * 100)) : 0;

  if (authLoading) {
    return (
      <ParentPortalLayout parent={null}>
        <div className="animate-pulse space-y-4 max-w-2xl">
          {[1, 2, 3].map(i => <div key={i} className="h-32 card rounded-xl" />)}
        </div>
      </ParentPortalLayout>
    );
  }

  return (
    <ParentPortalLayout parent={parent}>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your tutoring hours and payments</p>
        </div>

        {/* Payment success banner */}
        {showSuccess && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800 font-medium">
              Payment successful! {successHours} hours have been added to your account.
            </p>
          </div>
        )}

        {/* Student selector */}
        {(parent?.students.length ?? 0) > 1 && (
          <div className="flex gap-2">
            {parent!.students.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStudentId(s.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  selectedStudentId === s.id
                    ? 'bg-navy-600 text-white border-navy-600'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Hours balance */}
        {student && (
          <div className="card p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Hours Balance</p>
            <div className="flex items-end gap-6 mb-3">
              <div>
                <p className="text-3xl font-bold text-gray-900">{remaining.toFixed(1)}</p>
                <p className="text-xs text-gray-500 mt-0.5">hours remaining</p>
              </div>
              <div className="text-right text-sm text-gray-500 pb-0.5">
                {used.toFixed(1)} used / {purchased} purchased
              </div>
            </div>
            {purchased > 0 && (
              <div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${pctUsed >= 80 ? 'bg-red-500' : pctUsed >= 60 ? 'bg-amber-400' : 'bg-green-500'}`}
                    style={{ width: `${pctUsed}%` }}
                  />
                </div>
                {remaining < 5 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                    <p className="text-xs text-red-600 font-medium">Running low — consider purchasing more hours</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Packages */}
        <div>
          <p className="text-sm font-semibold text-gray-900 mb-3">Purchase Hours</p>
          <div className="grid grid-cols-3 gap-3">
            {PACKAGES.map(pkg => (
              <div
                key={pkg.hours}
                className={`card p-4 flex flex-col ${pkg.popular ? 'border-navy-300 ring-1 ring-navy-200' : ''}`}
              >
                {pkg.popular && (
                  <span className="inline-block self-start text-xs font-bold text-navy-700 bg-navy-100 rounded-full px-2.5 py-0.5 mb-2">
                    Most Popular
                  </span>
                )}
                <p className="font-bold text-gray-900 text-lg">{pkg.hours} hrs</p>
                <p className="text-xs text-gray-500">{pkg.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">${pkg.price}</p>
                <p className="text-xs text-gray-400 mb-4">{pkg.perHour}</p>
                <button
                  onClick={() => buyPackage(pkg.hours)}
                  disabled={!!purchasing}
                  className="btn-primary w-full justify-center text-sm mt-auto"
                >
                  {purchasing === pkg.hours
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <CreditCard className="w-4 h-4" />
                  }
                  {purchasing === pkg.hours ? 'Redirecting…' : 'Buy Now'}
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Secure payment via Stripe. Hours are credited immediately after payment.
          </p>
        </div>

        {/* Invoice history */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-400" />
            <h2 className="font-semibold text-gray-900 text-sm">Payment History</h2>
          </div>
          {invoiceLoading ? (
            <div className="px-6 py-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-gray-300 mx-auto" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-400 text-center">No payments yet.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {invoices.map(inv => (
                <div key={inv.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      ${Number(inv.amount).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(new Date(inv.created_at), 'MMMM d, yyyy')}
                      {inv.notes && inv.notes.includes('hrs') && (
                        <span className="ml-1.5 text-navy-600">
                          · {inv.notes.match(/(\d+) hrs/)?.[1]} hours added
                        </span>
                      )}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    inv.status === 'paid' ? 'bg-green-100 text-green-700' :
                    inv.status === 'sent' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ParentPortalLayout>
  );
}
