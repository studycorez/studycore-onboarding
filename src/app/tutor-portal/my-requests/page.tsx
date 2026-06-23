'use client';

import { useEffect, useState } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { Loader2, UserPlus } from 'lucide-react';
import Link from 'next/link';

interface Request {
  id: string;
  student_name: string;
  parent_name: string | null;
  parent_email: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending:  { label: 'Pending',  className: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700'   },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700'       },
};

export default function MyRequestsPage() {
  const { tutor, loading: authLoading } = useTutorAuth();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tutor) return;
    fetch('/api/tutor-portal/student-requests')
      .then(r => r.json())
      .then(d => setRequests(d.requests ?? []))
      .finally(() => setLoading(false));
  }, [tutor]);

  if (authLoading) return null;

  return (
    <TutorPortalLayout tutor={tutor}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Requests</h1>
          <p className="text-gray-500 text-sm mt-1">Student add requests you&apos;ve submitted</p>
        </div>
        <Link href="/tutor-portal/students/request" className="btn-primary inline-flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> Request New Student
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : requests.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-400 text-sm">No requests yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => {
            const badge = STATUS_BADGE[r.status];
            return (
              <div key={r.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{r.student_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {r.parent_name && `${r.parent_name} · `}
                      {r.parent_email && `${r.parent_email} · `}
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
                {r.status === 'rejected' && r.rejection_reason && (
                  <p className="text-sm text-red-600 mt-2 bg-red-50 rounded-lg px-3 py-2">
                    {r.rejection_reason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </TutorPortalLayout>
  );
}
