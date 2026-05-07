'use client';

import { useEffect, useState } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/ui/Badge';
import { Check, ExternalLink, Loader2, List, CalendarDays, ChevronLeft, ChevronRight, Video, AlertCircle, X } from 'lucide-react';
import { formatDateTime, DAY_SHORT } from '@/lib/utils';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay } from 'date-fns';

type Filter = 'all' | 'scheduled' | 'completed' | 'cancelled';
type ViewMode = 'list' | 'week';

export default function TutorSessionsPage() {
  const { tutor, loading } = useTutorAuth();
  const supabase = createClient();
  const [sessions, setSessions] = useState<any[]>([]);
  const [filter,   setFilter]   = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Score form state per session
  const [scoreForm, setScoreForm] = useState<Record<string, { math: string; reading: string; writing: string; total: string }>>({});
  const [scoreSaving, setScoreSaving] = useState<string | null>(null);
  const [scoreSuccess, setScoreSuccess] = useState<Set<string>>(new Set());
  const [scoreError, setScoreError] = useState<Record<string, string>>({});

  // Report modal state
  const [reportSession, setReportSession] = useState<any | null>(null);
  const [reportForm, setReportForm] = useState<{
    topics_covered: string;
    homework_assigned: string;
    homework_due_date: string;
    student_engagement: number;
    session_notes: string;
    next_session_plan: string;
    homework_completed: boolean | null;
    homework_completion_notes: string;
    at_risk: boolean;
    at_risk_reason: string;
    practice_test_score: string;
    practice_test_type: string;
  }>({
    topics_covered: '',
    homework_assigned: '',
    homework_due_date: '',
    student_engagement: 0,
    session_notes: '',
    next_session_plan: '',
    homework_completed: null,
    homework_completion_notes: '',
    at_risk: false,
    at_risk_reason: '',
    practice_test_score: '',
    practice_test_type: '',
  });
  const [reportSaving, setReportSaving] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportToast, setReportToast] = useState('');

  async function load() {
    if (!tutor) return;
    let q = supabase
      .from('sessions')
      .select('*, student:students(name), session_logs(*), student_progress(*), report_submitted, report_submitted_at, topics_covered, student_engagement, session_notes, next_session_plan')
      .eq('tutor_id', tutor.id)
      .order('scheduled_at', { ascending: false })
      .limit(100);
    if (filter !== 'all') q = q.eq('status', filter);
    const { data } = await q;
    setSessions((data as any[]) ?? []);
  }

  useEffect(() => { load(); }, [tutor, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  function getScoreForm(sessionId: string) {
    return scoreForm[sessionId] ?? { math: '', reading: '', writing: '', total: '' };
  }

  function setScoreField(sessionId: string, field: string, value: string) {
    setScoreForm(prev => ({
      ...prev,
      [sessionId]: { ...getScoreForm(sessionId), [field]: value },
    }));
  }

  async function submitScore(sessionId: string) {
    const form = getScoreForm(sessionId);
    if (!form.math && !form.reading && !form.writing && !form.total) return;
    setScoreSaving(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          math_score:    form.math    ? parseInt(form.math)    : null,
          reading_score: form.reading ? parseInt(form.reading) : null,
          writing_score: form.writing ? parseInt(form.writing) : null,
          total_score:   form.total   ? parseInt(form.total)   : null,
        }),
      });
      if (res.ok) {
        setScoreSuccess(prev => new Set(prev).add(sessionId));
        setScoreForm(prev => ({ ...prev, [sessionId]: { math: '', reading: '', writing: '', total: '' } }));
        setScoreError(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
        await load();
      } else {
        const d = await res.json().catch(() => ({}));
        setScoreError(prev => ({ ...prev, [sessionId]: d.error ?? 'Failed to save score' }));
      }
    } finally {
      setScoreSaving(null);
    }
  }

  function openReportModal(s: any) {
    setReportForm({
      topics_covered: s.topics_covered ?? '',
      homework_assigned: s.homework_assigned ?? '',
      homework_due_date: s.homework_due_date ?? '',
      student_engagement: s.student_engagement ?? 0,
      session_notes: s.session_notes ?? s.tutor_notes ?? '',
      next_session_plan: s.next_session_plan ?? '',
      homework_completed: s.homework_completed ?? null,
      homework_completion_notes: s.homework_completion_notes ?? '',
      at_risk: s.at_risk ?? false,
      at_risk_reason: s.at_risk_reason ?? '',
      practice_test_score: s.practice_test_score?.toString() ?? '',
      practice_test_type: s.practice_test_type ?? '',
    });
    setReportError('');
    setReportSession(s);
  }

  async function submitReport() {
    if (!reportSession) return;
    setReportSaving(true);
    setReportError('');
    try {
      const res = await fetch(`/api/sessions/${reportSession.id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportForm),
      });
      if (res.ok) {
        setReportSession(null);
        setReportToast('Report submitted!');
        setTimeout(() => setReportToast(''), 3000);
        await load();
      } else {
        const d = await res.json().catch(() => ({}));
        setReportError(d.error ?? 'Failed to save report');
      }
    } finally {
      setReportSaving(false);
    }
  }

  if (loading) return null;

  // Next upcoming session
  const now = new Date();
  const nextSession = sessions
    .filter(s => s.status === 'scheduled' && new Date(s.scheduled_at) > now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];

  // Week view data
  const weekEnd  = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const thisWeekSessions = sessions.filter(s => {
    const d = new Date(s.scheduled_at);
    return d >= weekStart && d <= weekEnd;
  });

  function SessionExpandDetail({ s }: { s: any }) {
    const log = s.session_logs?.[0];
    const scores = (s.student_progress ?? []).sort((a: any, b: any) =>
      new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    );
    const latestScore = scores[0] ?? null;
    const isPast = new Date(s.scheduled_at) < new Date();
    const form = getScoreForm(s.id);

    return (
      <div className="space-y-3 text-sm">
        {/* Report status */}
        {isPast && s.status === 'completed' && (
          <div>
            {s.report_submitted ? (
              <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded font-medium">
                <Check className="w-3 h-3" /> Report submitted {s.report_submitted_at ? format(new Date(s.report_submitted_at), 'MMM d') : ''}
              </span>
            ) : (
              <button
                onClick={() => openReportModal(s)}
                className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded font-medium transition-colors"
              >
                <AlertCircle className="w-3 h-3" /> Report Due — click to submit
              </button>
            )}
          </div>
        )}
        {s.tutor_notes && (
          <div>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Session Notes</p>
            <p className="text-gray-700">{s.tutor_notes}</p>
            {s.homework_assigned && (
              <p className="text-gray-600 mt-1"><span className="font-medium">Homework:</span> {s.homework_assigned}</p>
            )}
          </div>
        )}
        {log && !s.tutor_notes && (
          <div className="grid grid-cols-3 gap-3">
            {log.went_well && <div><p className="text-xs text-gray-500 mb-1">Went Well</p><p>{log.went_well}</p></div>}
            {log.issues    && <div><p className="text-xs text-gray-500 mb-1">Issues</p><p>{log.issues}</p></div>}
            {log.homework  && <div><p className="text-xs text-gray-500 mb-1">Homework</p><p>{log.homework}</p></div>}
          </div>
        )}
        {latestScore && (
          <div className="flex gap-4">
            {latestScore.math_score    && <span><span className="text-gray-500">Math: </span><strong>{latestScore.math_score}</strong></span>}
            {latestScore.reading_score && <span><span className="text-gray-500">Reading: </span><strong>{latestScore.reading_score}</strong></span>}
            {latestScore.writing_score && <span><span className="text-gray-500">Writing: </span><strong>{latestScore.writing_score}</strong></span>}
            {latestScore.total_score   && <span><span className="text-gray-500">Total: </span><strong className="text-navy-700">{latestScore.total_score}</strong></span>}
          </div>
        )}
        {isPast && (
          <div className="border-t border-gray-200 pt-2">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">
              {scoreSuccess.has(s.id) ? '✓ Score logged' : 'Log Score'}
            </p>
            <div className="flex items-end gap-2 flex-wrap">
              {(['math', 'reading', 'writing', 'total'] as const).map(field => (
                <div key={field}>
                  <label className="block text-xs text-gray-500 capitalize mb-1">{field}</label>
                  <input
                    type="number"
                    value={form[field]}
                    onChange={e => setScoreField(s.id, field, e.target.value)}
                    className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-navy-500"
                    placeholder={field === 'total' ? '1600' : '800'}
                  />
                </div>
              ))}
              <button
                onClick={() => submitScore(s.id)}
                disabled={scoreSaving === s.id || (!form.math && !form.reading && !form.writing && !form.total)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-navy-900 text-white text-sm font-medium rounded hover:bg-navy-800 disabled:opacity-40 transition-colors"
              >
                {scoreSaving === s.id && <Loader2 className="w-3 h-3 animate-spin" />}
                Save
              </button>
              {scoreError[s.id] && <p className="text-red-500 text-xs mt-1">{scoreError[s.id]}</p>}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <TutorPortalLayout tutor={tutor}>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
          <p className="text-gray-500 text-sm mt-1">{sessions.length} sessions total</p>
        </div>
        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('week')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'week' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <CalendarDays className="w-4 h-4" /> Week
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <List className="w-4 h-4" /> List
          </button>
        </div>
      </div>

      {/* Next session card */}
      {nextSession && (
        <div className="card p-4 mb-5 flex items-center gap-4 bg-navy-50 border-navy-200">
          <div className="w-10 h-10 bg-navy-700 rounded-xl flex items-center justify-center flex-shrink-0">
            <CalendarDays className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-navy-600 uppercase tracking-wide">Next Session</p>
            <p className="font-semibold text-gray-900">{nextSession.student?.name}</p>
            <p className="text-sm text-gray-600">{formatDateTime(nextSession.scheduled_at)} · {nextSession.duration_minutes} min</p>
          </div>
          {nextSession.zoom_join_url && (
            <a
              href={nextSession.zoom_join_url}
              target="_blank"
              rel="noopener"
              className="btn-primary text-sm flex items-center gap-2 flex-shrink-0"
            >
              <ExternalLink className="w-4 h-4" /> Join Zoom
            </a>
          )}
        </div>
      )}

      {viewMode === 'week' ? (
        <div className="card overflow-hidden">
          {/* Week navigation */}
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <button
              onClick={() => setWeekStart(w => subWeeks(w, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <div className="text-center">
              <p className="font-semibold text-gray-900 text-sm">
                {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
              </p>
              <p className="text-xs text-gray-500">{thisWeekSessions.length} session{thisWeekSessions.length !== 1 ? 's' : ''} this week</p>
            </div>
            <button
              onClick={() => setWeekStart(w => addWeeks(w, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          <div className="grid grid-cols-7 divide-x divide-gray-100">
            {weekDays.map((day, i) => {
              const daySessions = thisWeekSessions.filter(s =>
                isSameDay(new Date(s.scheduled_at), day)
              ).sort((a, b) =>
                new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
              );
              const isToday = isSameDay(day, now);

              return (
                <div key={i} className="min-h-32">
                  <div className={`px-2 py-2 border-b border-gray-100 text-center ${isToday ? 'bg-navy-50' : ''}`}>
                    <p className="text-xs font-semibold text-gray-500 uppercase">{DAY_SHORT[i === 6 ? 0 : i + 1]}</p>
                    <p className={`text-sm font-bold mt-0.5 ${isToday ? 'text-navy-700' : 'text-gray-900'}`}>
                      {format(day, 'd')}
                    </p>
                  </div>
                  <div className="p-1.5 space-y-1">
                    {daySessions.map(s => {
                      const statusColor =
                        s.status === 'completed' ? 'bg-green-100 border-green-300 text-green-800' :
                        s.status === 'cancelled' ? 'bg-gray-100 border-gray-200 text-gray-500 line-through' :
                        'bg-navy-50 border-navy-200 text-navy-800';
                      return (
                        <button
                          key={s.id}
                          onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                          className={`w-full text-left px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:brightness-95 ${statusColor}`}
                        >
                          <p className="truncate">{format(new Date(s.scheduled_at), 'h:mm a')}</p>
                          <p className="truncate text-xs opacity-80">{s.student?.name}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Expanded session detail */}
          {expanded && (() => {
            const s = sessions.find(x => x.id === expanded);
            if (!s) return null;
            return (
              <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{s.student?.name} — {formatDateTime(s.scheduled_at)}</p>
                    <p className="text-xs text-gray-500">{s.duration_minutes} min · <StatusBadge status={s.status} /></p>
                  </div>
                  <div className="flex gap-2">
                    {s.zoom_join_url && (
                      <a href={s.zoom_join_url} target="_blank" rel="noopener" className="btn-secondary text-xs flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> Zoom
                      </a>
                    )}
                    <button onClick={() => setExpanded(null)} className="text-xs text-gray-500 hover:text-gray-700">✕</button>
                  </div>
                </div>
                <SessionExpandDetail s={s} />
              </div>
            );
          })()}
        </div>
      ) : (
        <>
          {/* Filter tabs (list view only) */}
          <div className="flex gap-2 mb-5">
            {(['all','scheduled','completed','cancelled'] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                  filter === f ? 'bg-navy-900 text-white' : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="card overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header">Date & Time</th>
                  <th className="table-header">Student</th>
                  <th className="table-header">Duration</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Report</th>
                  <th className="table-header">Zoom</th>
                  <th className="table-header">Recording</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sessions.length === 0 && (
                  <tr><td colSpan={7} className="table-cell text-center py-8 text-gray-400">No sessions found</td></tr>
                )}
                {sessions.map((s: any) => {
                  const isExpanded = expanded === s.id;
                  return (
                    <>
                      <tr
                        key={s.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpanded(isExpanded ? null : s.id)}
                      >
                        <td className="table-cell font-medium text-sm">{formatDateTime(s.scheduled_at)}</td>
                        <td className="table-cell">{s.student?.name ?? '—'}</td>
                        <td className="table-cell">{s.duration_minutes}min</td>
                        <td className="table-cell"><StatusBadge status={s.status} /></td>
                        <td className="table-cell" onClick={e => e.stopPropagation()}>
                          {s.status === 'completed' ? (
                            s.report_submitted ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                                <Check className="w-3 h-3" /> Submitted {s.report_submitted_at ? format(new Date(s.report_submitted_at), 'MMM d') : ''}
                              </span>
                            ) : (
                              <button
                                onClick={() => openReportModal(s)}
                                className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 hover:bg-red-100 px-1.5 py-0.5 rounded font-medium transition-colors"
                              >
                                <AlertCircle className="w-3 h-3" /> Report Due
                              </button>
                            )
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="table-cell">
                          {s.zoom_join_url
                            ? <a href={s.zoom_join_url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-navy-600 hover:text-navy-800 text-xs font-medium">
                                <ExternalLink className="w-3 h-3" />Join
                              </a>
                            : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                        <td className="table-cell" onClick={e => e.stopPropagation()}>
                          {s.fathom_recording_url
                            ? <a href={s.fathom_recording_url} target="_blank" rel="noopener"
                                className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-800 text-xs font-medium">
                                <Video className="w-3 h-3" />Watch
                              </a>
                            : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${s.id}-detail`}>
                          <td colSpan={7} className="px-5 py-4 bg-gray-50 text-sm">
                            <SessionExpandDetail s={s} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {/* Report submission modal */}
      {reportSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Session Report</h2>
                <p className="text-xs text-gray-500 mt-0.5">{reportSession.student?.name} · {format(new Date(reportSession.scheduled_at), 'MMM d, yyyy h:mm a')}</p>
              </div>
              <button onClick={() => setReportSession(null)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Topics Covered */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Topics Covered <span className="text-red-500">*</span></label>
                <textarea
                  rows={3}
                  value={reportForm.topics_covered}
                  onChange={e => setReportForm(f => ({ ...f, topics_covered: e.target.value }))}
                  placeholder="e.g. Quadratic equations, graphing parabolas…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
                />
              </div>

              {/* Student Engagement */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Student Engagement <span className="text-red-500">*</span></label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setReportForm(f => ({ ...f, student_engagement: n }))}
                      className={`text-2xl transition-colors ${n <= reportForm.student_engagement ? 'text-yellow-400' : 'text-gray-200 hover:text-yellow-300'}`}
                    >
                      ★
                    </button>
                  ))}
                  {reportForm.student_engagement > 0 && (
                    <span className="text-xs text-gray-500 self-center ml-1">
                      {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][reportForm.student_engagement]}
                    </span>
                  )}
                </div>
              </div>

              {/* Session Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Session Notes</label>
                <textarea
                  rows={3}
                  value={reportForm.session_notes}
                  onChange={e => setReportForm(f => ({ ...f, session_notes: e.target.value }))}
                  placeholder="How did the session go? Any breakthroughs or struggles?"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
                />
              </div>

              {/* Homework */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Homework Assigned</label>
                <textarea
                  rows={2}
                  value={reportForm.homework_assigned}
                  onChange={e => setReportForm(f => ({ ...f, homework_assigned: e.target.value }))}
                  placeholder="e.g. Khan Academy: Quadratics sections 1–3"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
                />
              </div>

              {/* Homework Due Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Homework Due Date</label>
                <input
                  type="date"
                  value={reportForm.homework_due_date}
                  onChange={e => setReportForm(f => ({ ...f, homework_due_date: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                />
              </div>

              {/* Plan for Next Session */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan for Next Session</label>
                <textarea
                  rows={2}
                  value={reportForm.next_session_plan}
                  onChange={e => setReportForm(f => ({ ...f, next_session_plan: e.target.value }))}
                  placeholder="What will you focus on next time?"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
                />
              </div>

              {/* Homework Completion */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Previous Homework Completion</label>
                <div className="flex gap-2">
                  {([
                    { label: 'Yes', value: true },
                    { label: 'No', value: false },
                    { label: 'No homework assigned', value: null },
                  ] as { label: string; value: boolean | null }[]).map(opt => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setReportForm(f => ({ ...f, homework_completed: opt.value, homework_completion_notes: opt.value === false ? f.homework_completion_notes : '' }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        reportForm.homework_completed === opt.value
                          ? 'bg-navy-900 text-white border-navy-900'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {reportForm.homework_completed === false && (
                  <textarea
                    rows={2}
                    value={reportForm.homework_completion_notes}
                    onChange={e => setReportForm(f => ({ ...f, homework_completion_notes: e.target.value }))}
                    placeholder="What was incomplete?"
                    className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
                  />
                )}
              </div>

              {/* Practice Test Score */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Practice Test Score (optional)</label>
                <div className="flex gap-2 items-center flex-wrap">
                  <select
                    value={reportForm.practice_test_type}
                    onChange={e => setReportForm(f => ({ ...f, practice_test_type: e.target.value, practice_test_score: e.target.value ? f.practice_test_score : '' }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                  >
                    <option value="">Select test type…</option>
                    {['SAT Full','SAT Reading','SAT Math','SAT Writing','ACT Full','ACT English','ACT Math','ACT Reading','ACT Science','Other'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {reportForm.practice_test_type && (
                    <input
                      type="number"
                      value={reportForm.practice_test_score}
                      onChange={e => setReportForm(f => ({ ...f, practice_test_score: e.target.value }))}
                      placeholder="Score"
                      className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    />
                  )}
                </div>
              </div>

              {/* At-Risk Flag */}
              <div className="border border-amber-200 bg-amber-50 rounded-lg px-4 py-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reportForm.at_risk}
                    onChange={e => setReportForm(f => ({ ...f, at_risk: e.target.checked, at_risk_reason: e.target.checked ? f.at_risk_reason : '' }))}
                    className="w-4 h-4 rounded border-amber-400 accent-amber-600"
                  />
                  <span className="text-sm font-semibold text-amber-800">Flag this student for fulfillment team review</span>
                </label>
                {reportForm.at_risk && (
                  <textarea
                    rows={2}
                    value={reportForm.at_risk_reason}
                    onChange={e => setReportForm(f => ({ ...f, at_risk_reason: e.target.value }))}
                    placeholder="Reason for flagging (required)"
                    className="mt-2 w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none bg-white"
                  />
                )}
              </div>

              {reportError && <p className="text-red-500 text-sm">{reportError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setReportSession(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={submitReport}
                disabled={reportSaving || !reportForm.topics_covered.trim() || reportForm.student_engagement === 0 || (reportForm.at_risk && !reportForm.at_risk_reason.trim())}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-navy-900 rounded-lg hover:bg-navy-800 disabled:opacity-40 transition-colors"
              >
                {reportSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {reportToast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-sm px-4 py-3 rounded-lg shadow-lg z-50">
          {reportToast}
        </div>
      )}
    </TutorPortalLayout>
  );
}
