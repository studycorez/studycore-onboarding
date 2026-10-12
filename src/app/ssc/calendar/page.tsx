'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { calcCheckInReminders, hasSchedule, CheckInReminder } from '@/lib/ssc-schedule';
import type { SscStudent } from '@/lib/ghl-support';

const AUTH_KEY = 'sc_auth';
const PASSWORD = 'StudyCore25';

const CALL_TYPE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'Post-Session 1': { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-400' },
  'Post-Session 3': { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-400' },
  'Weekly Sync':    { bg: 'bg-emerald-50',text: 'text-emerald-700',dot: 'bg-emerald-400' },
  'Phase Check-in': { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-400' },
  'Post-SAT Day':   { bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-400' },
  'Post-SAT Results':{ bg: 'bg-rose-50',  text: 'text-rose-700',   dot: 'bg-rose-400' },
};

function colorFor(type: string) {
  return CALL_TYPE_COLORS[type] ?? { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' };
}

function formatDay(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

interface CalItem {
  student: SscStudent;
  reminder: CheckInReminder;
}

export default function SscCalendarPage() {
  const [authed, setAuthed]   = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [students, setStudents] = useState<SscStudent[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const [filterType, setFilterType] = useState('');
  const [lookaheadDays, setLookaheadDays] = useState(14);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAuthed(!!localStorage.getItem(AUTH_KEY));
    }
  }, []);

  function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (password === PASSWORD) {
      localStorage.setItem(AUTH_KEY, '1');
      setAuthed(true);
    } else {
      setAuthError('Wrong password');
    }
  }

  useEffect(() => {
    if (!authed) return;
    fetch('/api/ssc-students')
      .then(r => r.ok ? r.json() : Promise.reject('Failed'))
      .then(d => setStudents(d.students ?? []))
      .catch(() => setError('Failed to load students'))
      .finally(() => setLoading(false));
  }, [authed]);

  // Build calendar items for the next N days
  const calendarByDay = useMemo(() => {
    const today     = midnight(new Date());
    const cutoff    = new Date(today);
    cutoff.setDate(cutoff.getDate() + lookaheadDays);

    const byDay = new Map<string, CalItem[]>();

    for (const student of students) {
      if (!hasSchedule(student.availability) || !student.startDate) continue;
      const reminders = calcCheckInReminders(student);
      for (const reminder of reminders) {
        if (reminder.status === 'done') continue;
        const d = midnight(reminder.dueDate);
        if (d < today || d >= cutoff) continue;
        if (filterType && !reminder.type.includes(filterType)) continue;
        const key = dateKey(d);
        const list = byDay.get(key) ?? [];
        list.push({ student, reminder });
        byDay.set(key, list);
      }
    }

    // Sort days
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({
        key,
        date: new Date(key + 'T12:00:00'),
        items: items.sort((a, b) => a.student.studentName.localeCompare(b.student.studentName)),
      }));
  }, [students, lookaheadDays, filterType]);

  const allTypes = useMemo(() => {
    const types = new Set<string>();
    for (const student of students) {
      if (!hasSchedule(student.availability) || !student.startDate) continue;
      calcCheckInReminders(student).forEach(r => types.add(r.type));
    }
    return Array.from(types).sort();
  }, [students]);

  const totalItems = useMemo(() => calendarByDay.reduce((s, d) => s + d.items.length, 0), [calendarByDay]);

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <form onSubmit={handleAuth} className="bg-white rounded-2xl shadow p-8 w-80 space-y-4">
          <h1 className="text-xl font-bold text-gray-900">SSC Dashboard</h1>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2090]"
          />
          {authError && <p className="text-red-500 text-sm">{authError}</p>}
          <button type="submit" className="w-full bg-[#1e2090] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#171a7a] transition">
            Sign in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/ssc" className="text-xs text-gray-400 hover:text-gray-600 transition">← Dashboard</Link>
            <span className="text-gray-200">|</span>
            <h1 className="text-base font-bold text-gray-900">Call Calendar</h1>
            {!loading && (
              <span className="text-xs text-gray-400">{totalItems} call{totalItems !== 1 ? 's' : ''} in next {lookaheadDays}d</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Lookahead selector */}
            <select
              value={lookaheadDays}
              onChange={e => setLookaheadDays(parseInt(e.target.value))}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
            {/* Type filter */}
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white"
            >
              <option value="">All types</option>
              {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {loading && (
          <div className="text-center py-16 text-gray-400 text-sm">Loading students…</div>
        )}
        {error && (
          <div className="text-center py-8 text-red-500 text-sm">{error}</div>
        )}
        {!loading && !error && calendarByDay.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">
            No upcoming calls in the next {lookaheadDays} days for students with a schedule set.
          </div>
        )}

        {calendarByDay.map(({ key, date, items }) => {
          const today  = midnight(new Date());
          const dayMs  = midnight(date).getTime();
          const isToday    = dayMs === today.getTime();
          const isTomorrow = dayMs === today.getTime() + 86400000;
          const label = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : formatDay(date);

          return (
            <div key={key}>
              <div className="flex items-center gap-3 mb-2">
                <span className={`text-xs font-bold uppercase tracking-widest ${isToday ? 'text-[#1e2090]' : 'text-gray-400'}`}>
                  {label}
                </span>
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-300">{items.length}</span>
              </div>

              <div className="space-y-1.5">
                {items.map(({ student, reminder }, i) => {
                  const color = colorFor(reminder.type);
                  const statusBadge =
                    reminder.status === 'overdue'    ? 'text-red-600 font-bold' :
                    reminder.status === 'today'      ? 'text-orange-600 font-semibold' :
                    reminder.status === 'this-week'  ? 'text-amber-600' :
                    'text-gray-400';

                  return (
                    <Link
                      key={`${student.opportunityId}-${reminder.type}-${i}`}
                      href={`/ssc/${student.opportunityId}`}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border border-transparent hover:border-gray-200 ${color.bg} transition group`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${color.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900 truncate">{student.studentName}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color.bg} ${color.text} border border-current border-opacity-20`}>
                            {reminder.type}
                          </span>
                        </div>
                        {student.tutorAssigned && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">Tutor: {student.tutorAssigned}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-xs ${statusBadge}`}>
                          {reminder.status === 'overdue' ? `${Math.abs(reminder.daysUntil)}d overdue` :
                           reminder.status === 'today'   ? 'Today' :
                           `${reminder.daysUntil}d`}
                        </span>
                        <p className="text-xs text-gray-300 group-hover:text-gray-400 transition mt-0.5">Open →</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Legend */}
        {!loading && calendarByDay.length > 0 && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Legend</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CALL_TYPE_COLORS).map(([type, c]) => (
                <span key={type} className={`text-xs px-2.5 py-1 rounded-full font-medium ${c.bg} ${c.text}`}>{type}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
