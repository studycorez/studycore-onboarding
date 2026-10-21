'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import { Loader2, RefreshCw } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface StudentRequest {
  id: string;
  student_name: string;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  grade: string | null;
  target_score: number | null;
  test_date: string | null;
  school: string | null;
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  tutor: { id: string; name: string; email: string } | null;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending:  { label: 'Pending',  className: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700'   },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700'       },
};

export default function StudentRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<StudentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StudentRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/student-requests');
    const data = await res.json();
    setRequests(data.requests ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function closeModal() {
    setSelected(null);
    setError('');
    setRejectionReason('');
  }

  function handleApprove(r: StudentRequest) {
    const url = new URLSearchParams();
    url.set('from_request', r.id);
    if (r.student_name) url.set('prefill_name', r.student_name);
    if (r.parent_name) url.set('prefill_parent_name', r.parent_name);
    if (r.parent_email) url.set('prefill_parent_email', r.parent_email);
    if (r.notes) url.set('prefill_notes', r.notes);
    router.push(`/students?${url.toString()}`);
  }

  function openReject(r: StudentRequest) {
    setSelected(r);
    setRejectionReason('');
    setError('');
  }

  async function handleReject() {
    if (!selected) return;
    if (rejectionReason.trim().length < 5) { setError('Reason must be at least 5 characters'); return; }

    setActing(true);
    setError('');
    const res = await fetch(`/api/admin/student-requests/${selected.id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejection_reason: rejectionReason.trim() }),
    });
    const data = await res.json();
    setActing(false);

    if (!res.ok) {
      setError(data.error ?? 'Reject failed');
      return;
    }

    closeModal();
    await load();
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Student Requests</h1>
          <p className="text-gray-500 text-sm mt-1">
            {pendingCount} pending · {requests.length} total
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase">
              <tr>
                <th className="table-header">Tutor</th>
                <th className="table-header">Student</th>
                <th className="table-header">Parent</th>
                <th className="table-header text-center">Grade</th>
                <th className="table-header text-center">Target</th>
                <th className="table-header">Status</th>
                <th className="table-header">Submitted</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-cell text-center text-gray-400 py-8">No requests yet.</td>
                </tr>
              ) : (
                requests.map(r => {
                  const badge = STATUS_BADGE[r.status];
                  return (
                    <tr key={r.id}>
                      <td className="table-cell text-sm">{r.tutor?.name ?? '—'}</td>
                      <td className="table-cell text-sm font-medium">{r.student_name}</td>
                      <td className="table-cell text-sm text-gray-500">
                        {r.parent_email ?? r.parent_name ?? '—'}
                      </td>
                      <td className="table-cell text-center text-sm">{r.grade ?? '—'}</td>
                      <td className="table-cell text-center text-sm">{r.target_score ?? '—'}</td>
                      <td className="table-cell">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="table-cell text-sm text-gray-400">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td className="table-cell text-right">
                        {r.status === 'pending' && (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => handleApprove(r)} className="text-xs font-medium text-green-600 hover:text-green-800">
                              Approve
                            </button>
                            <button onClick={() => openReject(r)} className="text-xs font-medium text-red-600 hover:text-red-800">
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject Modal */}
      <Modal open={!!selected} onClose={closeModal} title="Reject Student Request">
        {selected && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Rejecting request for <strong>{selected.student_name}</strong> from {selected.tutor?.name}.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                rows={3}
                className="input w-full"
                placeholder="Why is this request being rejected? (min 5 characters)"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button onClick={closeModal} className="btn-secondary flex-1 justify-center">
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={acting || rejectionReason.trim().length < 5}
                className="btn-primary flex-1 justify-center bg-red-600 hover:bg-red-700"
              >
                {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Reject
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}
