'use client';

import { useEffect, useState } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/ui/Badge';
import { Check, ExternalLink, Loader2, List, CalendarDays, ChevronLeft, ChevronRight, Video, AlertCircle, CalendarPlus } from 'lucide-react';
import ProposeSessionModal from '@/components/tutor-portal/ProposeSessionModal';
import { formatDateTime, DAY_SHORT } from '@/lib/utils';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay } from 'date-fns';

export const dynamic = 'force-dynamic';

type Filter = 'all' | 'scheduled' | 'pending_approval' | 'completed' | 'cancelled';
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

  // Propose session modal
  const [proposeOpen,    setProposeOpen]    = useState(false);
  const [proposeStudents, setProposeStudents] = useState<{ id: string; name: string }[]>([]);

  async function load() {
    if (!tutor) return;
    const params = filter !== 'all' ? `?filter=${filter}` : '';
    const res = await fetch(`/api/tutor-portal/sessions${params}`, { cache: 'no-store' });
    const data = await res.json();
    setSessions(Array.isArray(data) ? data : []);
  }

  async function loadStudentsForProposal() {
    if (!tutor) return;
    const res = await fetch('/api/tutor-portal/my-students');
    const { students } = await res.json();
    setProposeStudents((students ?? []).map((s: any) => ({ id: s.id, name: s.name })));
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

  if (loading) return null;

  const now = new Date();
  const tz = typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/New_York';

  function fmtInTz(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  }

  function isTodayInTz(iso: string): boolean {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: tz }) ===
      new Date().toLocaleDateString('en-CA', { timeZone: tz });
  }

  function sessionCountdown(iso: string): string | null {
    const diff = new Date(iso).getTime() - now.getTime();
    if (diff <= 0 || diff > 24 * 60 * 60 * 1000) return null;
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    return h > 0 ? `in ${h}h ${m}m` : `in ${m} min`;
  }

  const nextSession = sessions
    .filter(s => s.status === 'scheduled' && new Date(s.scheduled_at) > now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];

  // Sessions completed but no report filed
  const missingReports = sessions.filter(s => s.status === 'completed' && !s.session_report);

  const weekEnd  = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const thisWeekSessions = sessions.filter(s => {
    const d = new Date(s.scheduled_at);
    return d >= weekStart && d <= weekEnd;
  });

  function SessionExpandDetail({ s }: { s: any }) {
    const isPast = new Date(s.scheduled_at) < new Date();
    const form   = getScoreForm(s.id);

    return (
      <div className="space-y-3 text-sm">
        {/* Report status */}
        {isPast && s.status === 'completed' && (
          <div>
            {s.session_report ? (
              <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded font-medium">
                <Check className="w-3 h-3" /> Report filed{s.session_report.submitted_at ? ` ${format(new Date(s.session_report.submitted_at), 'MMM d')}` : ''}
              </span>
            ) : (
              <a
                href={`/session-log/${s.id}`}
                className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded font-medium transition-colors"
              >
                <AlertCircle className="w-3 h-3" /> File Report
              </a>
            )}
          </div>
        )}

        {/* Score logger */}
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadStudentsForProposal(); setProposeOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-navy-700 text-white hover:bg-navy-800 transition-colors"
          >
            <CalendarPlus className="w-4 h-4" /> Propose Session
          </button>
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
      </div>

      {/* Missing reports banner */}
      {missingReports.length > 0 && (
        <div className="mb-5 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-red-800">
              {missingReports.length} session report{missingReports.length !== 1 ? 's' : ''} still due
            </p>
          </div>
          <div className="flex flex-col gap-1.5 pl-8">
            {missingReports.slice(0, 5).map(s => (
              <a
                key={s.id}
                href={`/session-log/${s.id}`}
                className="text-xs text-red-700 underline hover:text-red-900 font-medium"
              >
                {s.student?.name ?? 'Unknown student'} — {new Date(s.scheduled_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </a>
            ))}
            {missingReports.length > 5 && (
              <p className="text-xs text-red-600">+ {missingReports.length - 5} more — switch to List view to see all.</p>
            )}
          </div>
        </div>
      )}

      {/* Next session card */}
      {nextSession && (() => {
        const startMs = new Date(nextSession.scheduled_at).getTime();
        const endMs   = startMs + nextSession.duration_minutes * 60_000;
        const ongoing = now.getTime() >= startMs && now.getTime() < endMs;
        const canStart = (startMs - now.getTime()) <= 30 * 60_000 || ongoing;
        const cdText  = sessionCountdown(nextSession.scheduled_at);
        const today   = isTodayInTz(nextSession.scheduled_at);
        return (
          <div className="card p-4 mb-5 bg-navy-50 border-navy-200">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-navy-700 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                <CalendarDays className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-navy-600 uppercase tracking-wide">Next Session</p>
                <p className="font-semibold text-gray-900">{nextSession.student?.name}</p>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <p className="text-sm text-gray-600">{fmtInTz(nextSession.scheduled_at)} · {nextSession.duration_minutes} min</p>
                  {today && <span className="text-xs font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-md">Today</span>}
                  {cdText && <span className="text-xs font-semibold text-amber-600">{cdText}</span>}
                </div>
              </div>
              {nextSession.zoom_join_url && (
                <a
                  href={nextSession.zoom_join_url}
                  target="_blank"
                  rel="noopener"
                  className={`btn-primary text-sm flex items-center gap-2 flex-shrink-0 ${canStart && ongoing ? 'animate-pulse' : ''}`}
                >
                  <ExternalLink className="w-4 h-4" /> {ongoing ? 'Join Now' : 'Start Session'}
                </a>
              )}
            </div>
          </div>
        );
      })()}

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
            {(['all','scheduled','pending_approval','completed','cancelled'] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                  filter === f ? 'bg-navy-900 text-white' : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {f === 'pending_approval' ? 'Pending Approval' : f.charAt(0).toUpperCase() + f.slice(1)}
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
                        <td className="table-cell font-medium text-sm">{fmtInTz(s.scheduled_at)}</td>
                        <td className="table-cell">{s.student?.name ?? '—'}</td>
                        <td className="table-cell">{s.duration_minutes}min</td>
                        <td className="table-cell"><StatusBadge status={s.status} /></td>
                        <td className="table-cell" onClick={e => e.stopPropagation()}>
                          {s.status === 'completed' ? (
                            s.session_report ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                                <Check className="w-3 h-3" /> Filed{s.session_report.submitted_at ? ` ${format(new Date(s.session_report.submitted_at), 'MMM d')}` : ''}
                              </span>
                            ) : (
                              <a
                                href={`/session-log/${s.id}`}
                                className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 hover:bg-red-100 px-1.5 py-0.5 rounded font-medium transition-colors"
                              >
                                <AlertCircle className="w-3 h-3" /> File Report
                              </a>
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

      {/* Propose Session Modal */}
      {tutor && (
        <ProposeSessionModal
          open={proposeOpen}
          onClose={() => setProposeOpen(false)}
          onSuccess={() => load()}
          students={proposeStudents}
        />
      )}
    </TutorPortalLayout>
  );
}
