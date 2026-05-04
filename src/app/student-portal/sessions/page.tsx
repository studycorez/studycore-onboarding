'use client';

import { useEffect, useState, useCallback } from 'react';
import { useStudentAuth } from '@/hooks/useStudentAuth';
import StudentPortalLayout from '@/components/student-portal/StudentPortalLayout';
import { format } from 'date-fns';
import { Video, Play, Calendar, Clock, CheckCircle, XCircle } from 'lucide-react';

interface SessionItem {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  zoom_join_url?: string | null;
  fathom_recording_url?: string | null;
  tutor_notes?: string | null;
  tutor: { id: string; name: string } | null;
}

const PALETTE = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16'];
function hashColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function TutorAvatar({ name, id }: { name: string; id: string }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%', background: hashColor(id),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0,
    }}>
      {name.trim()[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

export default function StudentSessionsPage() {
  const { student, loading } = useStudentAuth();
  const [upcoming, setUpcoming] = useState<SessionItem[]>([]);
  const [past, setPast]         = useState<SessionItem[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch('/api/student-portal/sessions').catch(() => null);
    if (!res?.ok) { setDataLoading(false); return; }
    const data = await res.json();
    setUpcoming(data.upcoming ?? []);
    setPast(data.past ?? []);
    setDataLoading(false);
  }, []);

  useEffect(() => { if (student) load(); }, [student, load]);

  if (loading || dataLoading) {
    return (
      <StudentPortalLayout student={null}>
        <div className="animate-pulse space-y-3 max-w-2xl">
          {[1, 2, 3].map(i => <div key={i} className="h-20 card rounded-xl" />)}
        </div>
      </StudentPortalLayout>
    );
  }
  if (!student) return null;

  return (
    <StudentPortalLayout student={student}>
      <div className="max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
          <p className="text-gray-500 text-sm mt-1">Your upcoming and past tutoring sessions</p>
        </div>

        {/* ── Upcoming ── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Upcoming
          </h2>
          {upcoming.length === 0 ? (
            <div className="card p-8 text-center">
              <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No upcoming sessions scheduled.</p>
            </div>
          ) : (
            <div className="card overflow-hidden divide-y divide-gray-50">
              {upcoming.map(s => {
                const tutorName = (s.tutor as any)?.name ?? 'Tutor';
                const tutorId   = (s.tutor as any)?.id ?? s.id;
                const startMs   = new Date(s.scheduled_at).getTime();
                const endMs     = startMs + s.duration_minutes * 60 * 1000;
                const ongoing   = now.getTime() >= startMs && now.getTime() < endMs;
                const canJoin   = (startMs - now.getTime()) <= 30 * 60 * 1000 || ongoing;

                return (
                  <div key={s.id} className="flex items-center gap-4 px-5 py-4">
                    <TutorAvatar name={tutorName} id={tutorId} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {format(new Date(s.scheduled_at), "EEE, MMM d 'at' h:mm a")}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        with {tutorName} · {s.duration_minutes} min
                      </p>
                    </div>
                    {s.zoom_join_url && (
                      <a
                        href={s.zoom_join_url}
                        target="_blank"
                        rel="noopener"
                        className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex-shrink-0 ${
                          canJoin
                            ? `text-white ${ongoing ? 'bg-green-600 animate-pulse' : 'bg-green-600 hover:bg-green-700'}`
                            : 'text-navy-700 bg-navy-50 border border-navy-200 hover:bg-navy-100'
                        }`}
                      >
                        <Video className="w-3 h-3" />
                        {ongoing ? 'Join Now' : canJoin ? 'Join Zoom' : 'Join Zoom'}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Past ── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Past Sessions
          </h2>
          {past.length === 0 ? (
            <div className="card p-8 text-center">
              <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No past sessions yet.</p>
            </div>
          ) : (
            <div className="card overflow-hidden divide-y divide-gray-50">
              {past.map(s => {
                const tutorName = (s.tutor as any)?.name ?? 'Tutor';
                const tutorId   = (s.tutor as any)?.id ?? s.id;
                const completed = s.status === 'completed';

                return (
                  <div key={s.id} className="flex items-center gap-4 px-5 py-4">
                    <TutorAvatar name={tutorName} id={tutorId} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">
                          {format(new Date(s.scheduled_at), "EEE, MMM d, yyyy")}
                        </p>
                        {completed
                          ? <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          : <XCircle className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                        }
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        with {tutorName} · {s.duration_minutes} min
                        {!completed && <span className="ml-1.5 text-gray-400">({s.status})</span>}
                      </p>
                    </div>
                    {s.fathom_recording_url && (
                      <a
                        href={s.fathom_recording_url}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-700 bg-navy-50 border border-navy-200 hover:bg-navy-100 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                      >
                        <Play className="w-3 h-3" />
                        Watch Recording
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </StudentPortalLayout>
  );
}
