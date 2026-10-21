'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Check, X, Loader2, CalendarClock } from 'lucide-react';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

interface RescheduleRequest {
  id: string;
  session_id: string;
  requested_by: string;
  original_time: string;
  requested_time: string;
  note: string | null;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
  student: { id: string; name: string; email: string; parent_email: string | null; timezone: string | null } | null;
  tutor: { id: string; name: string; email: string } | null;
}

function fmtTime(iso: string, tz?: string | null) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: tz ?? 'America/New_York',
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZoneName: 'short',
  });
}

const STATUS_BADGE: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  denied:   'bg-red-100 text-red-700 border-red-200',
};

export default function RescheduleRequestsPage() {
  const [requests, setRequests] = useState<RescheduleRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [acting,   setActing]   = useState<string | null>(null); // request id being acted on

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/reschedule-requests', { cache: 'no-store' });
    const data = await res.json();
    setRequests(data.requests ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function act(id: string, action: 'approve' | 'deny') {
    setActing(id);
    await fetch(`/api/admin/reschedule-requests/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setActing(null);
    load();
  }

  const pending  = requests.filter(r => r.status === 'pending');
  const resolved = requests.filter(r => r.status !== 'pending');

  return (
    <AdminLayout>
      <div className="max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <CalendarClock className="w-6 h-6 text-navy-600" />
          <h1 className="text-2xl font-bold text-gray-900">Reschedule Requests</h1>
          {pending.length > 0 && (
            <span className="ml-1 bg-amber-100 text-amber-700 border border-amber-200 text-xs font-semibold px-2 py-0.5 rounded-full">
              {pending.length} pending
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 py-12">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading…</span>
          </div>
        ) : requests.length === 0 ? (
          <div className="card p-8 text-center text-gray-400">
            <CalendarClock className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No reschedule requests yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Pending */}
            {pending.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Pending</h2>
                <div className="space-y-3">
                  {pending.map(r => (
                    <RequestCard key={r.id} r={r} acting={acting} onAct={act} />
                  ))}
                </div>
              </section>
            )}

            {/* Resolved */}
            {resolved.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Resolved</h2>
                <div className="space-y-3">
                  {resolved.map(r => (
                    <RequestCard key={r.id} r={r} acting={acting} onAct={act} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function RequestCard({
  r, acting, onAct,
}: {
  r: RescheduleRequest;
  acting: string | null;
  onAct: (id: string, action: 'approve' | 'deny') => void;
}) {
  const tz = r.student?.timezone ?? 'America/New_York';
  const isActing = acting === r.id;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-semibold text-gray-900">{r.student?.name ?? '—'}</span>
            <span className="text-gray-400">→</span>
            <span className="text-gray-700">{r.tutor?.name ?? '—'}</span>
            <span className={`text-xs font-medium border rounded-full px-2 py-0.5 capitalize ${STATUS_BADGE[r.status]}`}>
              {r.status}
            </span>
            <span className="text-xs text-gray-400 ml-auto">
              Requested by {r.requested_by} · {format(new Date(r.created_at), 'MMM d, h:mm a')}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2 text-sm">
            <div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Original</span>
              <p className="text-gray-700">{fmtTime(r.original_time, tz)}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Requested</span>
              <p className="text-gray-700">{fmtTime(r.requested_time, tz)}</p>
            </div>
          </div>

          {r.note && (
            <p className="mt-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
              &ldquo;{r.note}&rdquo;
            </p>
          )}
        </div>

        {r.status === 'pending' && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => onAct(r.id, 'deny')}
              disabled={!!acting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              Deny
            </button>
            <button
              onClick={() => onAct(r.id, 'approve')}
              disabled={!!acting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-navy-700 rounded-lg hover:bg-navy-800 transition-colors disabled:opacity-40"
            >
              {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Approve
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
