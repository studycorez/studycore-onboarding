'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParentAuth } from '@/hooks/useParentAuth';
import ParentPortalLayout from '@/components/parent-portal/ParentPortalLayout';
import { format } from 'date-fns';
import { Video, Play, Calendar, Clock, CheckCircle, XCircle, X, FileText, CheckSquare, Square } from 'lucide-react';

function formatInTz(iso: string, tz: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function tzAbbr(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')?.value ?? '';
  } catch { return ''; }
}

function isToday(iso: string, tz: string): boolean {
  const dateStr = new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  return dateStr === todayStr;
}

function countdown(iso: string, now: Date): string | null {
  const diff = new Date(iso).getTime() - now.getTime();
  if (diff <= 0 || diff > 24 * 60 * 60 * 1000) return null;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m} min`;
}

interface HWItem {
  description: string;
  estimated_minutes: number | null;
  completed: boolean;
}

interface SessionReport {
  topics_covered: string;
  engagement_rating: number;
  homework_assigned: string;
  concerns_for_parent: string | null;
  target_score_range: string | null;
  extra_practice_areas: string | null;
  homework_items: HWItem[];
}

interface SessionItem {
  id: string;
  student_id: string;
  studentName: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  zoom_join_url?: string | null;
  fathom_recording_url?: string | null;
  report_submitted?: boolean;
  // Old system fields (fallback)
  topics_covered?: string | null;
  student_engagement?: number | null;
  session_notes?: string | null;
  homework_assigned?: string | null;
  homework_due_date?: string | null;
  next_session_plan?: string | null;
  tutor: { id: string; name: string } | null;
  // New system
  session_report?: SessionReport | null;
}

const ENGAGEMENT_LABELS = ['', 'Not engaged', 'Low engagement', 'Moderate', 'Engaged', 'Highly engaged'];

function Stars({ n }: { n: number | null | undefined }) {
  if (!n) return null;
  const labels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
  return <span title={labels[n] ?? ''}>{('⭐').repeat(n)}</span>;
}

function EngagementStars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{('⭐').repeat(n)}</span>
      <span className="text-xs text-gray-500">{ENGAGEMENT_LABELS[n]}</span>
    </span>
  );
}

export default function ParentSessionsPage() {
  const { parent, loading } = useParentAuth();
  const [upcoming, setUpcoming] = useState<SessionItem[]>([]);
  const [past, setPast]         = useState<SessionItem[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [reportModal, setReportModal] = useState<SessionItem | null>(null);
  const tz = typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/New_York';

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch('/api/parent-portal/sessions').catch(() => null);
    if (!res?.ok) { setDataLoading(false); return; }
    const data = await res.json();
    setUpcoming(data.upcoming ?? []);
    setPast(data.past ?? []);
    setDataLoading(false);
  }, []);

  useEffect(() => { if (parent) load(); }, [parent, load]);

  if (loading || dataLoading) {
    return (
      <ParentPortalLayout parent={null}>
        <div className="animate-pulse space-y-3 max-w-2xl">
          {[1, 2, 3].map(i => <div key={i} className="h-20 card rounded-xl" />)}
        </div>
      </ParentPortalLayout>
    );
  }

  return (
    <ParentPortalLayout parent={parent}>
      <div className="max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
          <p className="text-gray-500 text-sm mt-1">All upcoming and past tutoring sessions</p>
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
                const tutorName = (s.tutor as any)?.name ?? '—';
                const startMs = new Date(s.scheduled_at).getTime();
                const endMs   = startMs + s.duration_minutes * 60 * 1000;
                const ongoing = now.getTime() >= startMs && now.getTime() < endMs;
                const canJoin = (startMs - now.getTime()) <= 30 * 60 * 1000 || ongoing;
                const today = isToday(s.scheduled_at, tz);
                const countdownText = countdown(s.scheduled_at, now);
                const abbr = tzAbbr(tz);

                return (
                  <div key={s.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900">
                            {formatInTz(s.scheduled_at, tz)}{abbr ? ` ${abbr}` : ''}
                          </p>
                          {today && (
                            <span className="text-xs font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-md">Today</span>
                          )}
                          {countdownText && (
                            <span className="text-xs font-semibold text-amber-600">{countdownText}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {s.studentName && <span>{s.studentName} · </span>}
                          with {tutorName} · {s.duration_minutes} min
                        </p>
                        {canJoin && (
                          <p className="text-xs text-gray-400 mt-1">Please join a few minutes early. Need help? Email support@studycore.net</p>
                        )}
                      </div>
                      {s.zoom_join_url && (
                        <a
                          href={s.zoom_join_url}
                          target="_blank"
                          rel="noopener"
                          className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex-shrink-0 ${
                            canJoin
                              ? `text-white bg-green-600 hover:bg-green-700 ${ongoing ? 'animate-pulse' : ''}`
                              : 'text-navy-700 bg-navy-50 border border-navy-200 hover:bg-navy-100'
                          }`}
                        >
                          <Video className="w-3 h-3" />
                          {ongoing ? 'Join Now' : 'Join Session'}
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Past ── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Session History
          </h2>
          {past.length === 0 ? (
            <div className="card p-8 text-center">
              <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No past sessions yet.</p>
            </div>
          ) : (
            <div className="card overflow-hidden divide-y divide-gray-50">
              {past.map(s => {
                const tutorName = (s.tutor as any)?.name ?? '—';
                const completed = s.status === 'completed';

                return (
                  <div key={s.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">
                          {new Date(s.scheduled_at).toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        {completed
                          ? <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          : <XCircle className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                        }
                        {s.session_report && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded font-medium">
                            New report format
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {s.studentName && <span>{s.studentName} · </span>}
                        with {tutorName} · {s.duration_minutes} min
                        {!completed && <span className="ml-1 text-gray-400">({s.status})</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {completed && (s.report_submitted || s.session_report) && (
                        <button
                          onClick={() => setReportModal(s)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-700 bg-navy-50 border border-navy-200 hover:bg-navy-100 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <FileText className="w-3 h-3" />
                          View Report
                        </button>
                      )}
                      {completed && !s.report_submitted && !s.session_report && (
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
                          Watch
                        </a>
                      )}
                    </div>
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
                  {reportModal.studentName && `${reportModal.studentName} · `}
                  {(reportModal.tutor as any)?.name ?? '—'} · {format(new Date(reportModal.scheduled_at), 'MMM d, yyyy')}
                </p>
              </div>
              <button onClick={() => setReportModal(null)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 text-sm">
              {reportModal.session_report ? (
                /* ── New system: session_reports ── */
                <>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Student Engagement</p>
                    <EngagementStars n={reportModal.session_report.engagement_rating} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Topics Covered</p>
                    <p className="text-gray-800">{reportModal.session_report.topics_covered}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Homework Assigned</p>
                    <p className="text-gray-800">{reportModal.session_report.homework_assigned}</p>
                  </div>
                  {reportModal.session_report.homework_items.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Homework Tasks</p>
                      <ul className="space-y-1.5">
                        {reportModal.session_report.homework_items.map((item, i) => (
                          <li key={i} className="flex items-start gap-2">
                            {item.completed
                              ? <CheckSquare className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                              : <Square className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                            }
                            <span className={item.completed ? 'text-gray-400 line-through' : 'text-gray-800'}>
                              {item.description}
                              {item.estimated_minutes && (
                                <span className="text-gray-400 ml-1 not-italic">~{item.estimated_minutes} min</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {reportModal.session_report.concerns_for_parent && (
                    <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Note from Tutor</p>
                      <p className="text-gray-800">{reportModal.session_report.concerns_for_parent}</p>
                    </div>
                  )}
                  {reportModal.session_report.target_score_range && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Target Score Range</p>
                      <p className="text-gray-800">{reportModal.session_report.target_score_range}</p>
                    </div>
                  )}
                  {reportModal.session_report.extra_practice_areas && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Extra Practice Areas</p>
                      <p className="text-gray-800">{reportModal.session_report.extra_practice_areas}</p>
                    </div>
                  )}
                </>
              ) : (
                /* ── Old system: fields on sessions table ── */
                <>
                  {reportModal.student_engagement != null && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Student Engagement</p>
                      <Stars n={reportModal.student_engagement} />
                    </div>
                  )}
                  {reportModal.topics_covered && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Topics Covered</p>
                      <p className="text-gray-800">{reportModal.topics_covered}</p>
                    </div>
                  )}
                  {reportModal.session_notes && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Session Notes</p>
                      <p className="text-gray-800">{reportModal.session_notes}</p>
                    </div>
                  )}
                  {reportModal.homework_assigned && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Homework Assigned</p>
                      <p className="text-gray-800">{reportModal.homework_assigned}</p>
                      {reportModal.homework_due_date && (
                        <p className="text-xs text-gray-500 mt-0.5">Due: {format(new Date(reportModal.homework_due_date), 'MMM d, yyyy')}</p>
                      )}
                    </div>
                  )}
                  {reportModal.next_session_plan && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Plan for Next Session</p>
                      <p className="text-gray-800">{reportModal.next_session_plan}</p>
                    </div>
                  )}
                </>
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
    </ParentPortalLayout>
  );
}
