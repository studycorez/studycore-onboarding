'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/Badge';
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Search, ExternalLink, Video, Loader2, Calendar,
  Users, Clock, BookOpen,
} from 'lucide-react';
import Link from 'next/link';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isSameDay, parseISO } from 'date-fns';

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

function formatInTz(isoStr: string, tz: string, fmt: string): string {
  try {
    const d = new Date(isoStr);
    const parts: Record<string, string> = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).formatToParts(d).forEach(p => { parts[p.type] = p.value; });

    const map: Record<string, string> = {
      'EEEE': new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(d),
      'EEE': new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d),
      'MMM d': `${new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short' }).format(d)} ${parseInt(parts['day'])}`,
      'MMM d, yyyy': `${new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short' }).format(d)} ${parseInt(parts['day'])}, ${parts['year']}`,
      'h:mm a': `${parseInt(parts['hour'])}:${parts['minute']} ${parts['dayPeriod']}`,
      'EEEE, MMM d': `${new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(d)}, ${new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short' }).format(d)} ${parseInt(parts['day'])}`,
    };
    return map[fmt] ?? new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(d);
  } catch {
    return isoStr;
  }
}

function getDateInTz(isoStr: string, tz: string): string {
  // Returns YYYY-MM-DD in the given timezone
  const d = new Date(isoStr);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/**
 * Convert a datetime-local string ("YYYY-MM-DDTHH:mm") interpreted in the
 * given IANA timezone to a UTC ISO string.
 */
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

type ViewMode = 'agenda' | 'all' | 'tutor' | 'student';
type SortKey = 'scheduled_at' | 'student' | 'tutor' | 'duration' | 'status';
type SortDir = 'asc' | 'desc';

const RESCHEDULE_REASONS = ['Client Request','Tutor Request','Technical Issue','Emergency','Other'];

// ── Dot indicator ─────────────────────────────────────────────────────────────
function ColorDot({ id, size = 8 }: { id: string; size?: number }) {
  return (
    <span
      style={{ width: size, height: size, background: hashColor(id), borderRadius: '50%', display: 'inline-block', flexShrink: 0 }}
    />
  );
}

// ── Session Detail Modal ───────────────────────────────────────────────────────
function SessionDetailModal({
  session,
  tz,
  onClose,
  onRescheduleSuccess,
}: {
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
    if (session) {
      setRescheduleMode(false);
      setRsDate('');
      setRsError('');
    }
  }, [session]);

  async function doReschedule() {
    if (!session || !rsDate) return;
    setRsSaving(true);
    setRsError('');
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_at: localDatetimeToUtcIso(rsDate, tz), reschedule_reason: rsReason }),
    });
    setRsSaving(false);
    if (!res.ok) { setRsError('Failed to reschedule. Please try again.'); return; }
    onRescheduleSuccess();
    onClose();
  }

  if (!session) return null;

  const timeDisplay = formatInTz(session.scheduled_at, tz, 'EEEE, MMM d') +
    ' at ' + formatInTz(session.scheduled_at, tz, 'h:mm a');

  return (
    <Modal open={true} onClose={onClose} title="Session Details">
      <div className="space-y-4 min-w-[480px]">
        {/* Time */}
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

        {/* Status row */}
        <div className="flex items-center gap-3 flex-wrap">
          <StatusBadge status={session.status} />
          {session.payment_status && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{session.payment_status}</span>
          )}
          {(session.reschedule_count ?? 0) > 0 && (
            <span className="text-xs text-amber-600">Rescheduled {session.reschedule_count}×</span>
          )}
        </div>

        {/* Notes / reasons */}
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
              <ExternalLink className="w-3.5 h-3.5" /> Fathom Recording
            </a>
          )}
          <Link href={`/sessions/${session.id}`}
            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 font-medium bg-gray-100 px-3 py-1.5 rounded-lg">
            <ExternalLink className="w-3.5 h-3.5" /> Full Details
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
                {rsSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm
              </button>
              <button onClick={() => setRescheduleMode(false)} className="btn-secondary text-sm">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Day section (collapsible) ──────────────────────────────────────────────────
function DaySection({
  date, sessions, tz, onSelect,
}: {
  date: string; // YYYY-MM-DD
  sessions: Session[];
  tz: string;
  onSelect: (s: Session) => void;
}) {
  const [open, setOpen] = useState(true);
  const today = new Date();
  const isToday = date === new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(today);

  const label = isToday
    ? `Today — ${new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`))}`
    : new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors
          ${isToday ? 'bg-navy-50 text-navy-900' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
      >
        <div className="flex items-center gap-2">
          {isToday && <span className="w-2 h-2 rounded-full bg-navy-600" />}
          <span>{label}</span>
          <span className={`text-xs font-normal ${isToday ? 'text-navy-500' : 'text-gray-400'}`}>
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </span>
        </div>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="mt-1 space-y-1 pl-2">
          {sessions.map(s => (
            <SessionCard key={s.id} session={s} tz={tz} onClick={() => onSelect(s)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Session card ──────────────────────────────────────────────────────────────
function SessionCard({ session: s, tz, onClick }: { session: Session; tz: string; onClick: () => void }) {
  const time = formatInTz(s.scheduled_at, tz, 'h:mm a');
  const studentColor = s.student ? hashColor(s.student.id) : '#9ca3af';
  const tutorColor = s.tutor ? hashColor(s.tutor.id) : '#9ca3af';

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 bg-white border border-gray-100 rounded-xl hover:border-navy-200 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center gap-3">
        {/* Time */}
        <div className="w-16 flex-shrink-0">
          <p className="text-sm font-semibold text-gray-900">{time}</p>
          <p className="text-xs text-gray-400">{s.duration_minutes}m</p>
        </div>

        {/* Student */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span style={{ width: 8, height: 8, background: studentColor, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
          <span className="text-sm font-medium text-gray-900 truncate">{s.student?.name ?? '—'}</span>
        </div>

        {/* Tutor */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span style={{ width: 8, height: 8, background: tutorColor, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
          <span className="text-sm text-gray-600 truncate">{s.tutor?.name ?? '—'}</span>
        </div>

        {/* Status + links */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={s.status} />
          {s.zoom_join_url && <Video className="w-3.5 h-3.5 text-gray-300 group-hover:text-navy-500" />}
          {s.fathom_recording_url && <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-purple-500" />}
        </div>
      </div>
    </button>
  );
}

// ── Week Agenda ───────────────────────────────────────────────────────────────
function WeekAgenda({
  sessions, tz, weekStart, todayOnly, onSelect,
}: {
  sessions: Session[];
  tz: string;
  weekStart: Date;
  todayOnly: boolean;
  onSelect: (s: Session) => void;
}) {
  // Group sessions by date in the given timezone
  const byDate = useMemo(() => {
    const map: Record<string, Session[]> = {};
    for (const s of sessions) {
      const d = getDateInTz(s.scheduled_at, tz);
      if (!map[d]) map[d] = [];
      map[d].push(s);
    }
    // Sort sessions within each day by scheduled_at
    for (const d of Object.keys(map)) {
      map[d].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    }
    return map;
  }, [sessions, tz]);

  // Generate days to display: just today when todayOnly, else full week
  const days = useMemo(() => {
    if (todayOnly) {
      return [new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())];
    }
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
    });
  }, [weekStart, tz, todayOnly]);

  const activeDays = days.filter(d => byDate[d]?.length > 0);

  if (activeDays.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Calendar className="w-10 h-10 text-gray-200 mb-3" />
        <p className="text-gray-400 text-sm">{todayOnly ? 'No sessions today.' : 'No sessions this week.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {days.map(d => {
        const daySessions = byDate[d];
        if (!daySessions?.length) return null;
        return (
          <DaySection key={d} date={d} sessions={daySessions} tz={tz} onSelect={onSelect} />
        );
      })}
    </div>
  );
}

// ── All Sessions Table ─────────────────────────────────────────────────────────
function AllSessionsTable({
  sessions, tz, onSelect,
}: {
  sessions: Session[];
  tz: string;
  onSelect: (s: Session) => void;
}) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('scheduled_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const PAGE_SIZE = 50;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(0);
  }

  const sorted = useMemo(() => {
    return [...sessions].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'scheduled_at') cmp = a.scheduled_at.localeCompare(b.scheduled_at);
      else if (sortKey === 'student') cmp = (a.student?.name ?? '').localeCompare(b.student?.name ?? '');
      else if (sortKey === 'tutor') cmp = (a.tutor?.name ?? '').localeCompare(b.tutor?.name ?? '');
      else if (sortKey === 'duration') cmp = a.duration_minutes - b.duration_minutes;
      else if (sortKey === 'status') cmp = a.status.localeCompare(b.status);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [sessions, sortKey, sortDir]);

  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  function SortHeader({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k;
    return (
      <th className="px-4 py-2.5 text-left cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
        onClick={() => toggleSort(k)}>
        <div className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {label}
          <span className="text-gray-300">
            {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
          </span>
        </div>
      </th>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <SortHeader k="scheduled_at" label="Date / Time" />
              <SortHeader k="student" label="Student" />
              <SortHeader k="tutor" label="Tutor" />
              <SortHeader k="duration" label="Duration" />
              <SortHeader k="status" label="Status" />
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Links</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {paged.map(s => (
              <tr key={s.id} className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => onSelect(s)}>
                <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                  <p className="font-medium">{formatInTz(s.scheduled_at, tz, 'MMM d, yyyy')}</p>
                  <p className="text-gray-400 text-xs">{formatInTz(s.scheduled_at, tz, 'h:mm a')}</p>
                </td>
                <td className="px-4 py-3">
                  {s.student ? (
                    <div className="flex items-center gap-1.5">
                      <ColorDot id={s.student.id} />
                      <span className="text-sm text-gray-900">{s.student.name}</span>
                    </div>
                  ) : <span className="text-gray-400 text-sm">—</span>}
                </td>
                <td className="px-4 py-3">
                  {s.tutor ? (
                    <div className="flex items-center gap-1.5">
                      <ColorDot id={s.tutor.id} />
                      <span className="text-sm text-gray-900">{s.tutor.name}</span>
                    </div>
                  ) : <span className="text-gray-400 text-sm">—</span>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{s.duration_minutes}m</td>
                <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {s.zoom_join_url && (
                      <a href={s.zoom_join_url} target="_blank" rel="noopener"
                        className="text-xs text-navy-600 hover:text-navy-800 font-medium flex items-center gap-0.5">
                        <Video className="w-3 h-3" /> Zoom
                      </a>
                    )}
                    {s.fathom_recording_url && (
                      <a href={s.fathom_recording_url} target="_blank" rel="noopener"
                        className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-0.5">
                        <ExternalLink className="w-3 h-3" /> Fathom
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No sessions found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <p className="text-xs text-gray-400">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-500 px-2">Page {page + 1} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function StatsBar({ sessions }: { sessions: Session[] }) {
  const stats = useMemo(() => {
    const uniqueStudents = new Set(sessions.map(s => s.student_id).filter(Boolean)).size;
    const uniqueTutors = new Set(sessions.map(s => s.tutor_id).filter(Boolean)).size;
    const totalHours = sessions.reduce((acc, s) => acc + s.duration_minutes, 0) / 60;
    return { count: sessions.length, students: uniqueStudents, tutors: uniqueTutors, hours: totalHours };
  }, [sessions]);

  return (
    <div className="grid grid-cols-4 gap-3 mb-4">
      {[
        { icon: Calendar, label: 'Sessions', value: stats.count, color: 'text-navy-600' },
        { icon: Users, label: 'Students', value: stats.students, color: 'text-purple-600' },
        { icon: BookOpen, label: 'Tutors', value: stats.tutors, color: 'text-emerald-600' },
        { icon: Clock, label: 'Hours', value: stats.hours.toFixed(1), color: 'text-amber-600' },
      ].map(({ icon: Icon, label, value, color }) => (
        <div key={label} className="card p-3 flex items-center gap-3">
          <Icon className={`w-5 h-5 ${color} flex-shrink-0`} />
          <div>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-400">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CalendarUI() {
  const [view, setView] = useState<ViewMode>('agenda');
  const [tz, setTz] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem(TZ_KEY) ?? 'America/New_York';
    return 'America/New_York';
  });
  const [weekStart, setWeekStart] = useState(() => {
    // Anchor to today in the persisted timezone so the right week loads on mount.
    const initialTz = (typeof window !== 'undefined' ? localStorage.getItem(TZ_KEY) : null) ?? 'America/New_York';
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: initialTz }).format(new Date());
    return startOfWeek(new Date(`${todayStr}T12:00:00`), { weekStartsOn: 0 });
  });
  const [todayOnly, setTodayOnly] = useState(true); // start in today-only mode
  const [search, setSearch] = useState('');
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [filterTutorId, setFilterTutorId] = useState('');
  const [filterStudentId, setFilterStudentId] = useState('');

  // Persist timezone
  useEffect(() => {
    localStorage.setItem(TZ_KEY, tz);
  }, [tz]);

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    setLoading(true);
    const isAll = view === 'all';
    let url: string;
    if (isAll) {
      url = '/api/calendar/sessions?all=true';
    } else {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
      // Pad ±14 h on each side so sessions in any timezone (UTC±14) that
      // fall within the displayed week are always fetched. The client-side
      // getDateInTz() grouping then places them on the correct calendar day.
      const PAD_MS = 14 * 60 * 60 * 1000;
      const paddedStart = new Date(weekStart.getTime() - PAD_MS);
      const paddedEnd   = new Date(weekEnd.getTime()   + PAD_MS);
      url = `/api/calendar/sessions?start=${paddedStart.toISOString()}&end=${paddedEnd.toISOString()}`;
    }
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    setAllSessions(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [view, weekStart]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Tutor/student lists derived from loaded sessions
  const tutorOptions = useMemo(() => {
    const map = new Map<string, string>();
    allSessions.forEach(s => { if (s.tutor) map.set(s.tutor.id, s.tutor.name); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allSessions]);

  const studentOptions = useMemo(() => {
    const map = new Map<string, string>();
    allSessions.forEach(s => { if (s.student) map.set(s.student.id, s.student.name); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allSessions]);

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    let s = allSessions;
    const q = search.toLowerCase().trim();
    if (q) {
      s = s.filter(x =>
        x.student?.name.toLowerCase().includes(q) ||
        x.tutor?.name.toLowerCase().includes(q) ||
        x.status.toLowerCase().includes(q) ||
        x.student?.email?.toLowerCase().includes(q) ||
        x.tutor?.email?.toLowerCase().includes(q)
      );
    }
    if (view === 'tutor' && filterTutorId) {
      s = s.filter(x => x.tutor_id === filterTutorId);
    }
    if (view === 'student' && filterStudentId) {
      s = s.filter(x => x.student_id === filterStudentId);
    }
    return s;
  }, [allSessions, search, view, filterTutorId, filterStudentId]);

  // Week range label — shows today's date when in todayOnly mode
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
  const weekLabel = todayOnly
    ? `Today — ${new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date())}`
    : `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;

  function goToday() {
    // Use today's calendar date in the SELECTED timezone (not browser-local),
    // so the week range is anchored to the right week when browser tz ≠ UI tz.
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    // Parse as noon to avoid DST midnight edge cases, then get week start.
    setWeekStart(startOfWeek(new Date(`${todayStr}T12:00:00`), { weekStartsOn: 0 }));
    setTodayOnly(true);
  }
  function goPrev() { setTodayOnly(false); setWeekStart(w => subWeeks(w, 1)); }
  function goNext() { setTodayOnly(false); setWeekStart(w => addWeeks(w, 1)); }

  const VIEW_TABS: { key: ViewMode; label: string }[] = [
    { key: 'agenda', label: 'Week Agenda' },
    { key: 'all', label: 'All Sessions' },
    { key: 'tutor', label: 'By Tutor' },
    { key: 'student', label: 'By Student' },
  ];

  return (
    <div>
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        {/* View tabs */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {VIEW_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                view === t.key ? 'bg-white text-navy-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              className="input pl-7 py-1.5 text-sm w-48"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Timezone */}
          <select
            className="input text-sm py-1.5 pr-8"
            value={tz}
            onChange={e => setTz(e.target.value)}
          >
            {TIMEZONES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Week nav (not shown in all-sessions view) */}
      {view !== 'all' && (
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center gap-1">
            <button onClick={goPrev} className="p-1.5 rounded-lg hover:bg-gray-100">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={goToday} className="px-3 py-1 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100">
              Today
            </button>
            <button onClick={goNext} className="p-1.5 rounded-lg hover:bg-gray-100">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <span className="text-sm font-semibold text-gray-900">{weekLabel}</span>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
      )}

      {/* Per-view dropdowns */}
      {view === 'tutor' && (
        <div className="mb-4">
          <select
            className="input text-sm max-w-xs"
            value={filterTutorId}
            onChange={e => setFilterTutorId(e.target.value)}
          >
            <option value="">— All Tutors —</option>
            {tutorOptions.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}
      {view === 'student' && (
        <div className="mb-4">
          <select
            className="input text-sm max-w-xs"
            value={filterStudentId}
            onChange={e => setFilterStudentId(e.target.value)}
          >
            <option value="">— All Students —</option>
            {studentOptions.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Stats bar */}
      <StatsBar sessions={filteredSessions} />

      {/* Loading skeleton */}
      {loading && view === 'all' && (
        <div className="animate-pulse space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl" />)}
        </div>
      )}

      {/* Content */}
      {!loading || view !== 'all' ? (
        <>
          {(view === 'agenda' || view === 'tutor' || view === 'student') && (
            <WeekAgenda
              sessions={filteredSessions}
              tz={tz}
              weekStart={weekStart}
              todayOnly={todayOnly}
              onSelect={setSelectedSession}
            />
          )}
          {view === 'all' && (
            <AllSessionsTable
              sessions={filteredSessions}
              tz={tz}
              onSelect={setSelectedSession}
            />
          )}
        </>
      ) : null}

      {/* Detail modal */}
      <SessionDetailModal
        session={selectedSession}
        tz={tz}
        onClose={() => setSelectedSession(null)}
        onRescheduleSuccess={fetchSessions}
      />
    </div>
  );
}
