'use client';

import { useEffect, useState, useCallback } from 'react';
import { useStudentAuth } from '@/hooks/useStudentAuth';
import StudentPortalLayout from '@/components/student-portal/StudentPortalLayout';
import { format } from 'date-fns';
import { Video, Play, Calendar, Clock, CheckCircle, XCircle, X, FileText } from 'lucide-react';

interface SessionItem {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  zoom_join_url?: string | null;
  fathom_recording_url?: string | null;
  fathom_summary?: string | null;
  fathom_transcript?: string | null;
  recording_verified?: boolean;
  report_submitted?: boolean;
  topics_covered?: string | null;
  homework_assigned?: string | null;
  homework_due_date?: string | null;
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

function Stars({ n }: { n: number | null | undefined }) {
  if (!n) return null;
  const labels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
  return <span title={labels[n] ?? ''}>{('⭐').repeat(n)}</span>;
}

export default function StudentSessionsPage() {
  const { student, loading } = useStudentAuth();
  const [upcoming, setUpcoming] = useState<SessionItem[]>([]);
  const [past, setPast]         = useState<SessionItem[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [reportModal, setReportModal] = useState<SessionItem | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState<Record<string, boolean>>({});

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
                  <div key={s.id} className="px-5 py-4 space-y-3">
                    <div className="flex items-center gap-4">
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
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {completed && s.report_submitted && (
                        <button
                          onClick={() => setReportModal(s)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-700 bg-navy-50 border border-navy-200 hover:bg-navy-100 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <FileText className="w-3 h-3" />
                          View Report
                        </button>
                      )}
                      {completed && !s.report_submitted && (
                        <span className="text-xs text-gray-400 italic">Report pending</span>
                      )}
                      {s.fathom_recording_url && (
                        <a
                          href={s.fathom_recording_url}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-700 bg-navy-50 border border-navy-200 hover:bg-navy-100 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Play className="w-3 h-3" />
                          Watch Recording
                        </a>
                      )}
                    </div>
                    </div>
                    {/* Recording summary + transcript — only when verified */}
                    {s.fathom_recording_url && (
                      <div className="ml-13 pl-1 space-y-2 text-sm border-t border-gray-50 pt-3">
                        {s.fathom_summary && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Session Summary</p>
                            <p className="text-gray-700 text-sm leading-relaxed">{s.fathom_summary}</p>
                          </div>
                        )}
                        {s.fathom_transcript && (
                          <div>
                            <button
                              onClick={() => setTranscriptOpen(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                              className="text-xs font-semibold text-navy-600 hover:text-navy-800 flex items-center gap-1"
                            >
                              {transcriptOpen[s.id] ? '▾ Hide transcript' : '▸ Show transcript'}
                            </button>
                            {transcriptOpen[s.id] && (
                              <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto font-sans leading-relaxed">
                                {s.fathom_transcript}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Report modal */}
      {reportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Session Report</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {(reportModal.tutor as any)?.name ?? '—'} · {format(new Date(reportModal.scheduled_at), 'MMM d, yyyy')}
                </p>
              </div>
              <button onClick={() => setReportModal(null)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 text-sm">
              {reportModal.topics_covered && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Topics Covered</p>
                  <p className="text-gray-800">{reportModal.topics_covered}</p>
                </div>
              )}
              {reportModal.homework_assigned && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Homework</p>
                  <p className="text-gray-800">{reportModal.homework_assigned}</p>
                  {reportModal.homework_due_date && (
                    <p className="text-xs text-gray-500 mt-0.5">Due: {format(new Date(reportModal.homework_due_date), 'MMM d, yyyy')}</p>
                  )}
                </div>
              )}
              {reportModal.fathom_recording_url && (
                <a
                  href={reportModal.fathom_recording_url}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-navy-900 text-white text-sm font-semibold rounded-lg hover:bg-navy-800 transition-colors"
                >
                  <Play className="w-4 h-4" /> Watch Recording →
                </a>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button onClick={() => setReportModal(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </StudentPortalLayout>
  );
}
