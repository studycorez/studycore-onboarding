'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Loader2, ChevronLeft, ChevronRight, SkipForward, UserX } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface QueueTutor {
  tutor_id: string;
  name: string;
  email: string;
  timezone: string | null;
  contract_count: number;
  schedule_count: number;
  status: 'unprocessed' | 'processed';
}

interface Contract {
  id: string;
  student_id: string;
  student_name: string;
  hourly_rate: number;
  status: string;
  signed_at: string;
}

interface Schedule {
  id: string;
  student_id: string;
  student_name: string;
  day_of_week: number;
  time_local: string;
  timezone: string;
  duration_minutes: number;
  recurring_started_on: string | null;
  notes: string | null;
  reported_at: string;
}

interface TutorDetail {
  tutor: { id: string; name: string; email: string; timezone: string | null; hourly_rate: number | null; active: boolean };
  contracts: Contract[];
  schedules: Schedule[];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ScheduleBuilderPage() {
  const [queue, setQueue] = useState<QueueTutor[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tutorData, setTutorData] = useState<TutorDetail | null>(null);
  const [tutorLoading, setTutorLoading] = useState(false);
  const [markingInactive, setMarkingInactive] = useState(false);

  // Load queue on mount
  useEffect(() => {
    fetch('/api/admin/schedule-builder/queue')
      .then(r => r.json())
      .then(data => { setQueue(Array.isArray(data) ? data : []); })
      .finally(() => setQueueLoading(false));
  }, []);

  // Load tutor detail when index changes
  const loadTutor = useCallback(async (tutorId: string) => {
    setTutorLoading(true);
    setTutorData(null);
    try {
      const res = await fetch(`/api/admin/schedule-builder/tutors/${tutorId}`);
      if (res.ok) {
        const data = await res.json();
        setTutorData(data);
      }
    } finally {
      setTutorLoading(false);
    }
  }, []);

  useEffect(() => {
    if (queue.length > 0 && currentIndex < queue.length) {
      loadTutor(queue[currentIndex].tutor_id);
    }
  }, [queue, currentIndex, loadTutor]);

  // ── Actions ──────────────────────────────────────────────────────────────

  function handleSkip() {
    if (currentIndex < queue.length - 1) setCurrentIndex(i => i + 1);
  }

  async function handleMarkInactive() {
    const tutor = queue[currentIndex];
    if (!tutor) return;
    if (!window.confirm(`Mark ${tutor.name} inactive? They'll be hidden from the queue.`)) return;
    setMarkingInactive(true);
    try {
      await fetch(`/api/admin/tutors/${tutor.tutor_id}/mark-inactive`, { method: 'POST' });
      // Remove from queue and stay at same index (or move back if at end)
      setQueue(prev => prev.filter((_, i) => i !== currentIndex));
      setCurrentIndex(i => Math.min(i, queue.length - 2));
    } finally {
      setMarkingInactive(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (queueLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </AdminLayout>
    );
  }

  if (queue.length === 0) {
    return (
      <AdminLayout>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Schedule Builder</h1>
        <p className="text-gray-500">No active tutors with signed contracts found.</p>
      </AdminLayout>
    );
  }

  const currentTutor = queue[currentIndex];
  const isLast = currentIndex >= queue.length - 1;
  const isFirst = currentIndex === 0;

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule Builder</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Tutor {currentIndex + 1} of {queue.length}
            {currentTutor && (
              <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${
                currentTutor.status === 'unprocessed'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-green-100 text-green-700'
              }`}>
                {currentTutor.status}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSkip}
            disabled={isLast || tutorLoading}
            className="btn-secondary text-sm"
          >
            <SkipForward className="w-4 h-4" /> Skip
          </button>
          <button
            onClick={handleMarkInactive}
            disabled={markingInactive || tutorLoading}
            className="btn-secondary text-sm text-red-600 border-red-200 hover:bg-red-50"
          >
            <UserX className="w-4 h-4" />
            {markingInactive ? 'Marking…' : 'Mark Inactive'}
          </button>
        </div>
      </div>

      {/* Tutor Card */}
      {tutorLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : tutorData ? (
        <div className="space-y-6">
          {/* Tutor info banner */}
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{tutorData.tutor.name}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{tutorData.tutor.email}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-700">
                  {tutorData.tutor.timezone ?? 'No timezone set'}
                </p>
                {tutorData.tutor.hourly_rate != null && (
                  <p className="text-xs text-gray-400">${tutorData.tutor.hourly_rate}/hr</p>
                )}
              </div>
            </div>
          </div>

          {/* Contracts section — placeholder for step 2 */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">
              Students from contracts ({tutorData.contracts.length})
            </h3>
            {tutorData.contracts.length === 0 ? (
              <p className="text-sm text-gray-400">No signed contracts.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {tutorData.contracts.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2.5">
                    <span className="text-sm font-medium text-gray-800">{c.student_name}</span>
                    <span className="text-xs text-gray-400">Contract signed</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Schedules entered — placeholder for step 2 */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">
              Schedules entered ({tutorData.schedules.length})
            </h3>
            {tutorData.schedules.length === 0 ? (
              <p className="text-sm text-gray-400">No schedules entered yet.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {tutorData.schedules.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-2.5">
                    <span className="text-sm text-gray-800">
                      {DAY_NAMES[s.day_of_week]} {s.time_local.slice(0, 5)} {s.timezone} · {s.student_name} · {s.duration_minutes}min
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nav buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentIndex(i => i - 1)}
              disabled={isFirst || tutorLoading}
              className="btn-secondary"
            >
              <ChevronLeft className="w-4 h-4" /> Prev tutor
            </button>
            <button
              onClick={handleSkip}
              disabled={isLast || tutorLoading}
              className="btn-primary"
            >
              Save & Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <p className="text-gray-400 text-sm">Failed to load tutor data.</p>
      )}
    </AdminLayout>
  );
}
