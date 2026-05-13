'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/Badge';
import {
  ChevronLeft, ChevronRight, Search, ExternalLink, Video, Loader2,
  Calendar, BookOpen, X,
} from 'lucide-react';
import Link from 'next/link';

// ── Color palette ─────────────────────────────────────────────────────────────
const PALETTE = [
  '#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444',
  '#06b6d4','#ec4899','#84cc16','#f97316','#6366f1','#14b8a6','#a855f7',
];
function hashColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ── Timezones ─────────────────────────────────────────────────────────────────
const TIMEZONES = [
  { label: 'PST (UTC−8)', value: 'America/Los_Angeles' },
  { label: 'MST (UTC−7)', value: 'America/Denver' },
  { label: 'CST (UTC−6)', value: 'America/Chicago' },
  { label: 'EST (UTC−5)', value: 'America/New_York' },
  { label: 'IST (UTC+5:30)', value: 'Asia/Kolkata' },
  { label: 'GMT (UTC+0)', value: 'UTC' },
];
const TZ_KEY = 'adminCalendarTz';

// ── Date helpers (all timezone-safe, no browser-tz dependence) ────────────────
function getTodayInTz(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return isoDate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

function addMonths(dateStr: string, n: number): string {
  const [y, m] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1 + n, 1);
  return isoDate(dt.getFullYear(), dt.getMonth() + 1, 1);
}

function getWeekDates(anchorDate: string): string[] {
  const [y, m, d] = anchorDate.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  const dow = base.getDay();
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(y, m - 1, d + (i - dow));
    return isoDate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  });
}

function getMonthGridDates(anchorDate: string): string[] {
  const [y, m] = anchorDate.split('-').map(Number);
  const firstDow = new Date(y, m - 1, 1).getDay();
  return Array.from({ length: 42 }, (_, i) => {
    const dt = new Date(y, m - 1, 1 - firstDow + i);
    return isoDate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  });
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Timezone-aware formatting ─────────────────────────────────────────────────
function formatInTz(isoStr: string, tz: string, fmt: string): string {
  try {
    const d = new Date(isoStr);
    const parts: Record<string, string> = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).formatToParts(d).forEach(p => { parts[p.type] = p.value; });

    const map: Record<string, string> = {
      'EEEE': new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(d),
      'EEE':  new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d),
      'MMM d': `${new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short' }).format(d)} ${parseInt(parts['day'])}`,
      'MMM d, yyyy': `${new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short' }).format(d)} ${parseInt(parts['day'])}, ${parts['year']}`,
      'h:mm a': `${parseInt(parts['hour'])}:${parts['minute']} ${parts['dayPeriod']}`,
      'EEEE, MMM d': `${new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(d)}, ${new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short' }).format(d)} ${parseInt(parts['day'])}`,
    };
    return map[fmt] ?? new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(d);
  } catch { return isoStr; }
}

function getDateInTz(isoStr: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(isoStr));
}

/** Returns total minutes since midnight in the given timezone */
function getMinutesInTz(isoStr: string, tz: string): number {
  const d = new Date(isoStr);
  const parts: Record<string, string> = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).forEach(p => { parts[p.type] = p.value; });
  return parseInt(parts['hour'] ?? '0') * 60 + parseInt(parts['minute'] ?? '0');
}

function localDatetimeToUtcIso(datetimeLocal: string, tz: string): string {
  const [dateStr, timeStr] = datetimeLocal.split('T');
  if (!dateStr || !timeStr) return new Date(datetimeLocal).toISOString();
  const localDt = new Date(`${dateStr}T${timeStr}:00`);
  const tzDt    = new Date(localDt.toLocaleString('en-US', { timeZone: tz }));
  return new Date(localDt.getTime() + (localDt.getTime() - tzDt.getTime())).toISOString();
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Session {
  id: string;
  tutor_id: string | null;
  student_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  payment_status: string | null;
  zoom_join_url: string | null;
  zoom_host_url: string | null;
  reschedule_count: number | null;
  reschedule_reason: string | null;
  cancellation_reason: string | null;
  session_notes: string | null;
  fathom_recording_url: string | null;
  tutor: { id: string; name: string; email: string } | null;
  student: { id: string; name: string; email: string; grade: string | null; target_score: number | null } | null;
}

type CalView = 'month' | 'week' | 'day';

const RESCHEDULE_REASONS = ['Client Request', 'Tutor Request', 'Technical Issue', 'Emergency', 'Other'];

// ── ColorDot ──────────────────────────────────────────────────────────────────
function ColorDot({ id, size = 8 }: { id: string; size?: number }) {
  return (
    <span style={{ width: size, height: size, background: hashColor(id), borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
  );
}

// ── Session Detail Modal ───────────────────────────────────────────────────────
function SessionDetailModal({ session, tz, onClose, onRescheduleSuccess }: {
  session: Session | null;
  tz: string;
  onClose: () => void;
  onRescheduleSuccess: () => void;
}) {
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [rsDate, setRsDate] = useState('');
  const [rsReason, setRsReason] = useState(RESCHEDULE_REASONS[0]);
  const [rsSaving, setRsSaving] = useState(false);
  const [rsError, setRsError] = useState('');

  useEffect(() => {
    if (session) { setRescheduleMode(false); setRsDate(''); setRsError(''); }
  }, [session]);

  async function doReschedule() {
    if (!session || !rsDate) return;
    setRsSaving(true); setRsError('');
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_at: localDatetimeToUtcIso(rsDate, tz), reschedule_reason: rsReason }),
    });
    setRsSaving(false);
    if (!res.ok) { setRsError('Failed to reschedule.'); return; }
    onRescheduleSuccess(); onClose();
  }

  if (!session) return null;

  const timeDisplay = formatInTz(session.scheduled_at, tz, 'EEEE, MMM d') +
    ' at ' + formatInTz(session.scheduled_at, tz, 'h:mm a');
  const hasReport = !!(session.session_notes?.trim());

  return (
    <Modal open={true} onClose={onClose} title="Session Details">
      <div className="space-y-4 min-w-[480px]">
        {/* Time + duration */}
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="font-medium text-gray-900">{timeDisplay}</span>
          <span className="text-gray-400">· {session.duration_minutes} min</span>
        </div>

        {/* People */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Student</p>
            {session.student ? (
              <>
                <div className="flex items-center gap-1.5">
                  <ColorDot id={session.student.id} />
                  <Link href={`/students/${session.student.id}`} className="font-medium text-navy-700 hover:underline text-sm">
                    {session.student.name}
                  </Link>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{session.student.email}</p>
                {session.student.grade && <p className="text-xs text-gray-400">Grade {session.student.grade}</p>}
                {session.student.target_score && <p className="text-xs text-gray-400">Target: {session.student.target_score}</p>}
              </>
            ) : <p className="text-sm text-gray-400">—</p>}
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Tutor</p>
            {session.tutor ? (
              <>
                <div className="flex items-center gap-1.5">
                  <ColorDot id={session.tutor.id} />
                  <Link href={`/tutors/${session.tutor.id}`} className="font-medium text-navy-700 hover:underline text-sm">
                    {session.tutor.name}
                  </Link>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{session.tutor.email}</p>
              </>
            ) : <p className="text-sm text-gray-400">—</p>}
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-3 flex-wrap">
          <StatusBadge status={session.status} />
          {session.payment_status && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{session.payment_status}</span>
          )}
          {(session.reschedule_count ?? 0) > 0 && (
            <span className="text-xs text-amber-600">Rescheduled {session.reschedule_count}×</span>
          )}
        </div>

        {/* Report status */}
        <div className="flex items-center gap-2 text-sm">
          <BookOpen className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-gray-500">Session report:</span>
          {hasReport
            ? <span className="text-green-600 font-medium">Submitted</span>
            : <span className="text-gray-400">Not submitted</span>}
        </div>

        {/* Notes */}
        {session.session_notes && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Session Notes</p>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{session.session_notes}</p>
          </div>
        )}
        {session.cancellation_reason && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Cancellation Reason</p>
            <p className="text-sm text-gray-700 bg-red-50 rounded-lg p-3">{session.cancellation_reason}</p>
          </div>
        )}

        {/* Links */}
        <div className="flex flex-wrap gap-2">
          {session.zoom_join_url && (
            <a href={session.zoom_join_url} target="_blank" rel="noopener"
              className="inline-flex items-center gap-1 text-xs text-navy-600 hover:text-navy-800 font-medium bg-navy-50 px-3 py-1.5 rounded-lg">
              <Video className="w-3.5 h-3.5" /> Join Zoom
            </a>
          )}
          {session.zoom_host_url && (
            <a href={session.zoom_host_url} target="_blank" rel="noopener"
              className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 font-medium bg-gray-100 px-3 py-1.5 rounded-lg">
              <ExternalLink className="w-3.5 h-3.5" /> Host Link
            </a>
          )}
          {session.fathom_recording_url && (
            <a href={session.fathom_recording_url} target="_blank" rel="noopener"
              className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium bg-purple-50 px-3 py-1.5 rounded-lg">
              <ExternalLink className="w-3.5 h-3.5" /> Recording
            </a>
          )}
          <Link href={`/sessions/${session.id}`}
            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 font-medium bg-gray-100 px-3 py-1.5 rounded-lg">
            <ExternalLink className="w-3.5 h-3.5" /> Session Report
          </Link>
        </div>

        {/* Reschedule */}
        {!rescheduleMode ? (
          <button onClick={() => setRescheduleMode(true)}
            className="text-sm text-navy-600 hover:text-navy-800 font-medium">
            Reschedule session →
          </button>
        ) : (
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-900">Reschedule</p>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">New Date & Time</label>
              <input type="datetime-local" className="input text-sm" value={rsDate}
                onChange={e => setRsDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Reason</label>
              <select className="input text-sm" value={rsReason} onChange={e => setRsReason(e.target.value)}>
                {RESCHEDULE_REASONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            {rsError && <p className="text-xs text-red-600">{rsError}</p>}
            <div className="flex gap-2">
              <button onClick={doReschedule} disabled={rsSaving || !rsDate}
                className="btn-primary text-sm flex items-center gap-1">
                {rsSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirm
              </button>
              <button onClick={() => setRescheduleMode(false)} className="btn-secondary text-sm">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Shared: build byDate map ──────────────────────────────────────────────────
function groupByDate(sessions: Session[], tz: string): Record<string, Session[]> {
  const map: Record<string, Session[]> = {};
  for (const s of sessions) {
    const d = getDateInTz(s.scheduled_at, tz);
    if (!map[d]) map[d] = [];
    map[d].push(s);
  }
  for (const d of Object.keys(map)) {
    map[d].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  }
  return map;
}

// ── Month View ────────────────────────────────────────────────────────────────
function MonthView({ sessions, tz, anchorDate, todayStr, onSelectSession, onSelectDay }: {
  sessions: Session[];
  tz: string;
  anchorDate: string;
  todayStr: string;
  onSelectSession: (s: Session) => void;
  onSelectDay: (date: string) => void;
}) {
  const cells = useMemo(() => getMonthGridDates(anchorDate), [anchorDate]);
  const [y, m] = anchorDate.split('-').map(Number);
  const monthPrefix = `${y}-${String(m).padStart(2, '0')}`;
  const byDate = useMemo(() => groupByDate(sessions, tz), [sessions, tz]);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden select-none">
      {/* DOW header */}
      <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
        {DOW_LABELS.map(d => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Grid cells */}
      <div className="grid grid-cols-7" style={{ gridAutoRows: 'minmax(90px, auto)' }}>
        {cells.map(date => {
          const inMonth = date.startsWith(monthPrefix);
          const isToday = date === todayStr;
          const daySessions = byDate[date] ?? [];
          const shown = daySessions.slice(0, 3);
          const extra = daySessions.length - 3;

          return (
            <div
              key={date}
              className={`border-b border-r border-gray-100 p-1 cursor-pointer transition-colors
                ${inMonth ? 'bg-white hover:bg-blue-50/40' : 'bg-gray-50 hover:bg-gray-100'}`}
              onClick={() => onSelectDay(date)}
            >
              {/* Date number */}
              <div className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-semibold mb-1
                ${isToday ? 'bg-navy-600 text-white' : inMonth ? 'text-gray-800' : 'text-gray-300'}`}>
                {parseInt(date.slice(8))}
              </div>

              {/* Session chips */}
              <div className="space-y-px">
                {shown.map(s => {
                  const color = s.tutor ? hashColor(s.tutor.id) : '#9ca3af';
                  return (
                    <button
                      key={s.id}
                      onClick={e => { e.stopPropagation(); onSelectSession(s); }}
                      title={`${s.student?.name ?? '?'} · ${formatInTz(s.scheduled_at, tz, 'h:mm a')} · ${s.tutor?.name ?? '—'}`}
                      className="w-full text-left flex items-center gap-1 px-1.5 py-0.5 rounded text-xs truncate hover:opacity-75 transition-opacity"
                      style={{ background: color + '25', color }}
                    >
                      <span className="font-medium truncate">{s.student?.name?.split(' ')[0] ?? '?'}</span>
                      <span className="opacity-70 flex-shrink-0 text-[10px]">{formatInTz(s.scheduled_at, tz, 'h:mm a')}</span>
                    </button>
                  );
                })}
                {extra > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); onSelectDay(date); }}
                    className="text-[10px] text-navy-600 hover:text-navy-800 font-medium px-1.5"
                  >
                    +{extra} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week View ─────────────────────────────────────────────────────────────────
function WeekView({ sessions, tz, anchorDate, todayStr, onSelect }: {
  sessions: Session[];
  tz: string;
  anchorDate: string;
  todayStr: string;
  onSelect: (s: Session) => void;
}) {
  const weekDates = useMemo(() => getWeekDates(anchorDate), [anchorDate]);
  const byDate = useMemo(() => groupByDate(sessions, tz), [sessions, tz]);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
        {weekDates.map((date, i) => {
          const isToday = date === todayStr;
          return (
            <div key={date}
              className={`py-3 text-center border-r last:border-r-0 border-gray-200 ${isToday ? 'bg-navy-50' : ''}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase">{DOW_LABELS[i]}</p>
              <div className={`mx-auto mt-1 w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold
                ${isToday ? 'bg-navy-600 text-white' : 'text-gray-800'}`}>
                {parseInt(date.slice(8))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Day columns */}
      <div className="grid grid-cols-7 divide-x divide-gray-100">
        {weekDates.map(date => {
          const daySessions = byDate[date] ?? [];
          const isToday = date === todayStr;
          return (
            <div key={date}
              className={`min-h-[180px] p-1.5 space-y-1 ${isToday ? 'bg-navy-50/30' : 'bg-white'}`}>
              {daySessions.length === 0 && (
                <p className="text-xs text-gray-300 text-center pt-6">—</p>
              )}
              {daySessions.map(s => {
                const color = s.tutor ? hashColor(s.tutor.id) : '#9ca3af';
                return (
                  <button
                    key={s.id}
                    onClick={() => onSelect(s)}
                    className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:opacity-80 transition-opacity"
                    style={{ background: color + '22', borderLeft: `3px solid ${color}` }}
                  >
                    <div className="font-semibold text-gray-900 truncate">
                      {s.student?.name?.split(' ')[0] ?? '?'}
                    </div>
                    <div className="text-gray-500">{formatInTz(s.scheduled_at, tz, 'h:mm a')} · {s.duration_minutes}m</div>
                    <div className="truncate" style={{ color }}>{s.tutor?.name?.split(' ')[0] ?? '—'}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Day View ──────────────────────────────────────────────────────────────────
const DAY_START = 6;   // 6 am
const DAY_END   = 23;  // 11 pm
const HR_PX     = 64;  // px per hour

function DayView({ sessions, tz, anchorDate, todayStr, onSelect }: {
  sessions: Session[];
  tz: string;
  anchorDate: string;
  todayStr: string;
  onSelect: (s: Session) => void;
}) {
  const totalH = (DAY_END - DAY_START) * HR_PX;
  const hours   = Array.from({ length: DAY_END - DAY_START }, (_, i) => i + DAY_START);

  const daySessions = useMemo(() =>
    sessions
      .filter(s => getDateInTz(s.scheduled_at, tz) === anchorDate)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
    [sessions, tz, anchorDate],
  );

  // Greedy column assignment for overlap handling
  const laid = useMemo(() => {
    const items = daySessions.map(s => {
      const startMin = getMinutesInTz(s.scheduled_at, tz);
      const endMin   = startMin + (s.duration_minutes ?? 60);
      return { s, startMin, endMin, col: 0 };
    });
    const colEnds: number[] = [];
    for (const item of items) {
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= item.startMin) {
          item.col = c; colEnds[c] = item.endMin; placed = true; break;
        }
      }
      if (!placed) { item.col = colEnds.length; colEnds.push(item.endMin); }
    }
    const numCols = Math.max(1, colEnds.length);
    return items.map(item => ({ ...item, numCols }));
  }, [daySessions, tz]);

  const isToday = anchorDate === todayStr;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Day header */}
      <div className={`px-4 py-3 border-b border-gray-200 ${isToday ? 'bg-navy-50' : 'bg-gray-50'}`}>
        <p className={`text-sm font-semibold ${isToday ? 'text-navy-900' : 'text-gray-900'}`}>
          {isToday ? 'Today — ' : ''}
          {new Date(`${anchorDate}T12:00:00`).toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          })}
        </p>
        <p className="text-xs text-gray-500">
          {daySessions.length} session{daySessions.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Timeline */}
      <div className="flex overflow-y-auto" style={{ maxHeight: '70vh' }}>
        {/* Hour gutter */}
        <div className="w-16 flex-shrink-0 border-r border-gray-100 bg-white">
          {hours.map(h => (
            <div key={h} style={{ height: HR_PX }}
              className="border-b border-gray-100 flex items-start justify-end pr-2 pt-1">
              <span className="text-[11px] text-gray-400 leading-none">
                {h === 12 ? '12pm' : h > 12 ? `${h - 12}pm` : `${h}am`}
              </span>
            </div>
          ))}
        </div>

        {/* Events area */}
        <div className="relative flex-1 bg-white" style={{ height: totalH }}>
          {/* Hour lines */}
          {hours.map((_, i) => (
            <div key={i} className="absolute left-0 right-0 border-b border-gray-100"
              style={{ top: i * HR_PX }} />
          ))}
          {/* Half-hour lines */}
          {hours.map((_, i) => (
            <div key={`h${i}`} className="absolute left-0 right-0 border-b border-gray-50"
              style={{ top: i * HR_PX + HR_PX / 2 }} />
          ))}

          {/* Session blocks */}
          {laid.map(({ s, startMin, endMin, col, numCols }) => {
            const top    = Math.max(0, (startMin - DAY_START * 60) / 60 * HR_PX);
            const bottom = Math.min(totalH, (endMin   - DAY_START * 60) / 60 * HR_PX);
            const height = Math.max(18, bottom - top);
            if (bottom < 0 || top > totalH) return null;

            const color  = s.tutor ? hashColor(s.tutor.id) : '#9ca3af';
            const colW   = 100 / numCols;

            return (
              <button
                key={s.id}
                onClick={() => onSelect(s)}
                className="absolute rounded-lg px-2 py-1 text-left text-xs shadow-sm hover:opacity-90 transition-opacity overflow-hidden"
                style={{
                  top, height,
                  left: `calc(${col * colW}% + 4px)`,
                  width: `calc(${colW}% - 8px)`,
                  background: color + 'e0',
                  color: '#fff',
                }}
              >
                <div className="font-semibold truncate leading-tight">
                  {s.student?.name ?? '—'}
                </div>
                {height > 32 && (
                  <div className="opacity-90 truncate leading-tight">
                    {formatInTz(s.scheduled_at, tz, 'h:mm a')} · {s.duration_minutes}m
                  </div>
                )}
                {height > 48 && s.tutor && (
                  <div className="opacity-75 truncate leading-tight">{s.tutor.name}</div>
                )}
              </button>
            );
          })}

          {daySessions.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-300">
              No sessions
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main CalendarUI ───────────────────────────────────────────────────────────
export default function CalendarUI() {
  const [view, setView] = useState<CalView>('month');
  const [tz, setTz] = useState<string>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem(TZ_KEY) ?? 'America/New_York';
    return 'America/New_York';
  });
  const [anchorDate, setAnchorDate] = useState<string>(() => {
    const initTz = (typeof window !== 'undefined' ? localStorage.getItem(TZ_KEY) : null) ?? 'America/New_York';
    return getTodayInTz(initTz);
  });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  // Filters
  const [filterTutorId, setFilterTutorId] = useState('');
  const [filterStudent, setFilterStudent] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const todayStr = getTodayInTz(tz);

  useEffect(() => { localStorage.setItem(TZ_KEY, tz); }, [tz]);

  function handleTzChange(newTz: string) {
    setTz(newTz);
    setAnchorDate(getTodayInTz(newTz));
  }

  // Compute API fetch range based on view + anchor (or custom date range)
  const fetchRange = useMemo(() => {
    const PAD = 14 * 60 * 60 * 1000; // 14h to cover any timezone offset

    if (filterDateFrom && filterDateTo) {
      return {
        start: new Date(`${filterDateFrom}T00:00:00`).toISOString(),
        end:   new Date(`${filterDateTo}T23:59:59`).toISOString(),
      };
    }

    if (view === 'day') {
      const [y, m, d] = anchorDate.split('-').map(Number);
      const base = new Date(y, m - 1, d).getTime();
      return {
        start: new Date(base - PAD).toISOString(),
        end:   new Date(base + 86_400_000 + PAD).toISOString(),
      };
    }

    if (view === 'week') {
      const [y, m, d] = anchorDate.split('-').map(Number);
      const base = new Date(y, m - 1, d);
      const dow  = base.getDay();
      const weekStart = new Date(y, m - 1, d - dow).getTime();
      return {
        start: new Date(weekStart - PAD).toISOString(),
        end:   new Date(weekStart + 7 * 86_400_000 + PAD).toISOString(),
      };
    }

    // month
    const [y, m] = anchorDate.split('-').map(Number);
    const monthStart = new Date(y, m - 1, 1).getTime();
    const monthEnd   = new Date(y, m, 0, 23, 59, 59).getTime();
    return {
      start: new Date(monthStart - 7 * 86_400_000 - PAD).toISOString(),
      end:   new Date(monthEnd   + 7 * 86_400_000 + PAD).toISOString(),
    };
  }, [view, anchorDate, filterDateFrom, filterDateTo]);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    const url = `/api/calendar/sessions?start=${encodeURIComponent(fetchRange.start)}&end=${encodeURIComponent(fetchRange.end)}`;
    const res  = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    setSessions(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [fetchRange]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Tutor options from loaded sessions
  const tutorOptions = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach(s => { if (s.tutor) map.set(s.tutor.id, s.tutor.name); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions]);

  // Client-side filters
  const filteredSessions = useMemo(() => {
    let s = sessions;
    if (filterTutorId) s = s.filter(x => x.tutor_id === filterTutorId);
    if (filterStudent) {
      const q = filterStudent.toLowerCase();
      s = s.filter(x => x.student?.name.toLowerCase().includes(q));
    }
    if (filterStatus) s = s.filter(x => x.status === filterStatus);
    return s;
  }, [sessions, filterTutorId, filterStudent, filterStatus]);

  // Navigation
  function goToday() {
    setAnchorDate(getTodayInTz(tz));
    setFilterDateFrom(''); setFilterDateTo('');
  }
  function goPrev() {
    if (view === 'day')   setAnchorDate(d => addDays(d, -1));
    if (view === 'week')  setAnchorDate(d => addDays(d, -7));
    if (view === 'month') setAnchorDate(d => addMonths(d, -1));
  }
  function goNext() {
    if (view === 'day')   setAnchorDate(d => addDays(d, 1));
    if (view === 'week')  setAnchorDate(d => addDays(d, 7));
    if (view === 'month') setAnchorDate(d => addMonths(d, 1));
  }

  // Header label
  const headerLabel = useMemo(() => {
    if (filterDateFrom && filterDateTo) return `${filterDateFrom} → ${filterDateTo}`;
    if (view === 'day') {
      return new Date(`${anchorDate}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      });
    }
    if (view === 'week') {
      const dates = getWeekDates(anchorDate);
      const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const yr   = new Date(`${dates[6]}T12:00:00`).getFullYear();
      return `${fmt(dates[0])} – ${fmt(dates[6])}, ${yr}`;
    }
    return new Date(`${anchorDate}T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [view, anchorDate, filterDateFrom, filterDateTo]);

  return (
    <div>
      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        {/* Left: nav controls + label */}
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={goPrev}
            className="p-1.5 rounded-lg hover:bg-gray-100 border border-gray-200 flex-shrink-0">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <button onClick={goToday}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 border border-gray-200 flex-shrink-0">
            Today
          </button>
          <button onClick={goNext}
            className="p-1.5 rounded-lg hover:bg-gray-100 border border-gray-200 flex-shrink-0">
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
          <h2 className="text-base font-semibold text-gray-900 ml-1 truncate">{headerLabel}</h2>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400 flex-shrink-0" />}
        </div>

        {/* Right: date picker + view toggle + timezone */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            className="input text-sm py-1.5"
            value={anchorDate}
            onChange={e => {
              if (e.target.value) {
                setAnchorDate(e.target.value);
                setFilterDateFrom(''); setFilterDateTo('');
              }
            }}
          />

          <div className="flex items-center bg-gray-100 rounded-xl p-1">
            {(['month', 'week', 'day'] as CalView[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                  view === v ? 'bg-white text-navy-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <select
            className="input text-sm py-1.5 pr-8"
            value={tz}
            onChange={e => handleTzChange(e.target.value)}
          >
            {TIMEZONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200">
        {/* Tutor */}
        <select
          className="input text-sm py-1.5 max-w-[180px]"
          value={filterTutorId}
          onChange={e => setFilterTutorId(e.target.value)}
        >
          <option value="">All Tutors</option>
          {tutorOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        {/* Student search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            className="input pl-7 text-sm py-1.5 w-36"
            placeholder="Student…"
            value={filterStudent}
            onChange={e => setFilterStudent(e.target.value)}
          />
        </div>

        {/* Status */}
        <select
          className="input text-sm py-1.5"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show_student">No Show (Student)</option>
          <option value="no_show_tutor">No Show (Tutor)</option>
          <option value="no_show_both">No Show (Both)</option>
        </select>

        {/* Date range */}
        <div className="flex items-center gap-1">
          <input type="date" className="input text-sm py-1.5"
            value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
          <span className="text-gray-400 text-xs">→</span>
          <input type="date" className="input text-sm py-1.5"
            value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
          {(filterDateFrom || filterDateTo) && (
            <button
              onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); }}
              className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Count */}
        <div className="ml-auto text-xs text-gray-500">
          {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''}
          {filteredSessions.length !== sessions.length ? ` (of ${sessions.length})` : ''}
        </div>
      </div>

      {/* ── Calendar views ── */}
      {view === 'month' && (
        <MonthView
          sessions={filteredSessions}
          tz={tz}
          anchorDate={anchorDate}
          todayStr={todayStr}
          onSelectSession={setSelectedSession}
          onSelectDay={date => { setAnchorDate(date); setView('day'); }}
        />
      )}
      {view === 'week' && (
        <WeekView
          sessions={filteredSessions}
          tz={tz}
          anchorDate={anchorDate}
          todayStr={todayStr}
          onSelect={setSelectedSession}
        />
      )}
      {view === 'day' && (
        <DayView
          sessions={filteredSessions}
          tz={tz}
          anchorDate={anchorDate}
          todayStr={todayStr}
          onSelect={setSelectedSession}
        />
      )}

      {/* Session detail modal */}
      <SessionDetailModal
        session={selectedSession}
        tz={tz}
        onClose={() => setSelectedSession(null)}
        onRescheduleSuccess={fetchSessions}
      />
    </div>
  );
}
