'use client';

import { useEffect, useRef, useState } from 'react';
import { CALL_TYPES, type CallTypeId, type CallType } from '@/lib/call-scripts';
import { calcTotalSessions } from '@/lib/ghl-support';
import {
  ALL_DAYS,
  calcCheckInReminders,
  encodeSchedule,
  generateSessionDates,
  hasSchedule,
  parseSchedule,
  type CheckInReminder,
  type DayAbbrev,
} from '@/lib/ssc-schedule';

interface SscStudent {
  opportunityId:     string;
  contactId:         string;
  studentName:       string;
  parentName:        string;
  stageId:           string;
  currentScore:      string;
  targetScore:       string;
  tutorAssigned:     string;
  weeklyCheckinTime: string;
  availability:      string;
  hasGuarantee:      string;
  sessionsCompleted: number;
  sessionsPerWeek:   string;
  hoursCompleted:    number;
  hoursRemaining:    number;
  hoursPurchased:    number;
  startDate:         string;
}

// Stages SSC can assign (founders own: Completed, Cancelled, Guarantee Case)
const SELECTABLE_STAGES: { id: string; label: string }[] = [
  { id: '79095236-7c28-4684-b7ce-29d03e2d1c86', label: 'New Enrollment' },
  { id: 'eb217c7e-1f20-4a6d-aeec-f5123fe625db', label: 'Form Completed' },
  { id: 'f145c10b-bd9f-4794-ab8b-1d3cdc6c3707', label: 'Diagnostic Done' },
  { id: 'e3af64f6-0af3-487f-aa5c-f8b05f3a84a3', label: 'Onboarding Call Done' },
  { id: '34126179-af56-4feb-969d-aec6dd9b6547', label: 'Session 1 Done' },
  { id: '22ddfa4c-a618-467f-b894-980d2d2ef4af', label: 'Session 3 Done' },
  { id: '99803c34-071c-476c-a513-e3789816bf85', label: 'Active' },
  { id: '3294f8d5-ff1c-4368-b0a0-17c3bf0cccc5', label: 'Phase 1 Done' },
  { id: '0f27807f-987a-44a4-9e3e-6399c4f73ff4', label: 'Phase 2 Done' },
  { id: 'd3e839e1-1128-4308-9d51-93b8f2b7dd0d', label: 'Phase 3 Done' },
  { id: 'd4454fd6-e20f-476d-896b-d4ad2c55c021', label: 'Phase 4 Done' },
  { id: '54e8aab9-ddd4-40d9-ab0a-95a7fb753c23', label: 'Low Hours' },
  { id: 'b3731eaf-3b6f-4db2-9369-d0665f7f6e03', label: 'SAT Day Done' },
  { id: 'eefacac9-3cbd-46ba-a711-ac24bc00a16c', label: 'Results Done' },
];

function buildDefaults(student: SscStudent): Record<string, string> {
  const firstName       = student.studentName.split(' ')[0] || student.studentName;
  const parentFirstName = student.parentName.split(' ')[0]  || student.parentName;
  return {
    sscName:              'Jonas',
    studentFirstName:     firstName,
    parentFirstName:      parentFirstName,
    studentName:          student.studentName,
    parentName:           student.parentName,
    currentScore:         student.currentScore,
    targetScore:          student.targetScore,
    tutorAssigned:        student.tutorAssigned,
    tutorName:            student.tutorAssigned,
    weeklyCheckinTime:    student.weeklyCheckinTime,
    weeklyCheckinStudent: student.weeklyCheckinTime,
    startDate:            student.startDate,
    testDate:             student.startDate,
    sessionsCompleted:    student.sessionsCompleted.toString(),
    hoursRemaining:       Math.round(student.hoursRemaining).toString(),
    prevScore:            student.currentScore,
  };
}

function ScriptRenderer({ template, values }: { template: string; values: Record<string, string> }) {
  const lines = template.split('\n');
  return (
    <div className="font-mono text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) {
          return (
            <div key={i} className="mt-6 mb-2 text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1">
              {line.replace('### ', '')}
            </div>
          );
        }
        if (line === '---') return <div key={i} className="my-3 border-t border-gray-100" />;
        if (line.trim() === '') return <div key={i} className="h-2" />;

        const isStageDirection = line.trim().startsWith('[') && !line.includes('{{');
        const isScreenAction   = line.includes('[SCREEN ACTION:');
        const isQuoted         = line.trim().startsWith('"') || line.trim().startsWith('\u201c');

        const parts = line.split(/(\{\{[^}]+\}\})/g);
        const rendered = parts.map((part, j) => {
          const match = part.match(/^\{\{([^}]+)\}\}$/);
          if (match) {
            const key   = match[1];
            const value = values[key];
            if (value) {
              return <span key={j} className="bg-blue-50 text-blue-700 font-semibold px-0.5 rounded">{value}</span>;
            }
            return (
              <span key={j} className="bg-orange-50 text-orange-500 border border-orange-200 px-1 rounded text-xs">
                {key.replace(/_/g, ' ')}
              </span>
            );
          }
          return <span key={j}>{part}</span>;
        });

        if (isScreenAction) {
          return (
            <div key={i} className="my-2 bg-indigo-50 border border-indigo-200 rounded px-3 py-2 text-indigo-700 text-xs">
              {rendered}
            </div>
          );
        }
        if (isStageDirection) {
          return <div key={i} className="my-1 text-purple-500 italic text-xs">{rendered}</div>;
        }
        if (isQuoted) {
          return <div key={i} className="my-1.5 text-gray-900">{rendered}</div>;
        }
        return <div key={i} className="my-0.5 text-gray-600 text-xs">{rendered}</div>;
      })}
    </div>
  );
}

// ─── Reminder row ─────────────────────────────────────────────────────────────

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function addMinutesToTime(timeStr: string, mins: number): string {
  // Parse "5:00 PM" style
  const match = timeStr.match(/^(\d+):(\d{2})\s*(AM|PM)$/i);
  if (!match) return '';
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  // Convert to 24h
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  const nAmpm = nh < 12 ? 'AM' : 'PM';
  const nh12 = nh % 12 || 12;
  return `${nh12}:${nm.toString().padStart(2, '0')} ${nAmpm}`;
}

function fmtDate(d: Date) {
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}

function reminderIcon(status: CheckInReminder['status']) {
  if (status === 'overdue')   return '🔴';
  if (status === 'today')     return '🟡';
  if (status === 'this-week') return '🟡';
  if (status === 'done')      return '✅';
  return '⚪';
}

function reminderBg(status: CheckInReminder['status']) {
  if (status === 'overdue')   return 'bg-red-50 border-red-200';
  if (status === 'today')     return 'bg-yellow-50 border-yellow-200';
  if (status === 'this-week') return 'bg-yellow-50 border-yellow-200';
  if (status === 'done')      return 'bg-gray-50 border-gray-100';
  return 'bg-gray-50 border-gray-100';
}

function reminderLabel(r: CheckInReminder) {
  if (r.status === 'done') return `Completed`;
  if (r.daysUntil < 0) return `Overdue since ${fmtDate(r.dueDate)}`;
  if (r.daysUntil === 0) return `Due today`;
  return `Due ${fmtDate(r.dueDate)}`;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SscContactPage({ params }: { params: { id: string } }) {
  const [authed, setAuthed]               = useState(false);
  const [password, setPassword]           = useState('');
  const [authError, setAuthError]         = useState('');
  const [student, setStudent]             = useState<SscStudent | null>(null);
  const [loading, setLoading]             = useState(true);
  const [activeCallType, setActiveCallType] = useState<CallTypeId>('onboarding');
  const [prepCard, setPrepCard]           = useState<Record<string, string>>({});
  const [sopOpen, setSopOpen]             = useState(false);
  const [stageSaving, setStageSaving]     = useState(false);
  const [toasts, setToasts]               = useState<{ id: number; msg: string; ok: boolean }[]>([]);

  const [airtableLoading, setAirtableLoading] = useState(false);
  const [airtableBadge, setAirtableBadge]     = useState<string>('');
  const [hasSavedData, setHasSavedData]       = useState(false);

  // Schedule editor state
  const [scheduleOpen, setScheduleOpen]     = useState(false);
  const [schedDays, setSchedDays]           = useState<DayAbbrev[]>([]);
  const [schedDuration, setSchedDuration]   = useState<number>(1.5);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [calendarOpen, setCalendarOpen]     = useState(false);
  const [schedTimes, setSchedTimes]         = useState<Partial<Record<DayAbbrev, string>>>({});
  const [schedTimezone, setSchedTimezone]   = useState('America/New_York');
  const [schedStartDate, setSchedStartDate] = useState('');

  // Progress manual override
  const [progressOpen, setProgressOpen]         = useState(false);
  const [editSessions, setEditSessions]         = useState('');
  const [editHours, setEditHours]               = useState('');
  const [progressSaving, setProgressSaving]     = useState(false);
  const [sessionsSavedToGHL, setSessionsSavedToGHL] = useState(false);

  const callTabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('sc_auth') === 'true') setAuthed(true);
  }, []);

  useEffect(() => {
    if (!authed) return;
    fetch(`/api/ssc-student/${params.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.student) {
          setStudent(data.student);
          setPrepCard(buildDefaults(data.student));
          // Init schedule state from student data
          if (hasSchedule(data.student.availability)) {
            const { sessionDays, sessionDurationHrs, sessionTime, sessionTimezone, sessionTimes } = parseSchedule(
              data.student.availability,
              data.student.sessionsPerWeek,
            );
            setSchedDays(sessionDays);
            setSchedDuration(sessionDurationHrs);
            setSchedTimes(sessionTimes);
            setSchedTimezone(sessionTimezone || 'America/New_York');
            if (data.student.startDate) setSchedStartDate(data.student.startDate);
            // Also auto-populate prep card session fields if not already saved
            const hasSaved = !!localStorage.getItem(`ssc_prepcard_${data.student.contactId}`);
            if (!hasSaved) {
              const firstTime = sessionTime || '';
              const endTime = firstTime ? addMinutesToTime(firstTime, Math.round(sessionDurationHrs * 60)) : '';
              const postTime = endTime ? addMinutesToTime(endTime, 10) : '';
              setPrepCard(prev => ({
                ...prev,
                ...(sessionDays[0] ? { session1Day: sessionDays[0] } : {}),
                ...(sessionDays[1] ? { session2Day: sessionDays[1] } : {}),
                ...(firstTime ? { session1Time: firstTime, session2Time: sessionTimes[sessionDays[1]] || firstTime } : {}),
                ...(endTime  ? { sessionEndTime: endTime }  : {}),
                ...(postTime ? { postCallTime:   postTime }  : {}),
              }));
            }
          }

          // Load from localStorage first (persists manual edits)
          const saved = localStorage.getItem(`ssc_prepcard_${data.student.contactId}`);
          if (saved) {
            try { setPrepCard(prev => ({ ...prev, ...JSON.parse(saved) })); } catch {}
            setHasSavedData(true);
          }

          // Then fetch Airtable data for fields not already saved locally
          setAirtableLoading(true);
          fetch(`/api/ssc-airtable-student?name=${encodeURIComponent(data.student.studentName)}`)
            .then(r => r.ok ? r.json() : null)
            .then((at: { tutorSatScore: string; satTestDate: string; preferredDays: string[]; preferredTime: string; sessionFrequency: string; parentBestTime: string; studentTimezone: string } | null) => {
              if (!at) return;
              const saved2 = localStorage.getItem(`ssc_prepcard_${data.student.contactId}`);
              const savedObj = saved2 ? (() => { try { return JSON.parse(saved2); } catch { return {}; } })() : {};

              setPrepCard(prev => {
                const next = { ...prev };
                // Only auto-fill if the user hasn't manually saved a value
                if (!savedObj.tutorScore && at.tutorSatScore)   next.tutorScore = at.tutorSatScore;
                if (!savedObj.testDate   && at.satTestDate) {
                  // Format YYYY-MM-DD → "Dec 5, 2026"
                  const d = new Date(at.satTestDate + 'T12:00:00');
                  next.testDate = `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
                }
                if (!savedObj.weeklyCheckinParent && at.parentBestTime) next.weeklyCheckinParent = at.parentBestTime;
                return next;
              });
              setAirtableBadge('Airtable synced');
              setTimeout(() => setAirtableBadge(''), 3000);
            })
            .catch(() => {})
            .finally(() => setAirtableLoading(false));
        }
      })
      .finally(() => setLoading(false));
  }, [authed, params.id]);

  function addToast(msg: string, ok: boolean) {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }

  async function changeStage(newStageId: string) {
    if (!student || newStageId === student.stageId) return;
    setStageSaving(true);
    try {
      const res = await fetch('/api/ssc-update-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId: student.opportunityId, stageId: newStageId }),
      });
      if (!res.ok) throw new Error();
      setStudent(prev => prev ? { ...prev, stageId: newStageId } : prev);
      addToast('Stage updated in GHL', true);
    } catch {
      addToast('Failed to update stage', false);
    } finally {
      setStageSaving(false);
    }
  }

  async function saveSchedule() {
    if (!student || !schedDays.length) return;
    setScheduleSaving(true);
    try {
      const res = await fetch('/api/ssc-update-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId:          student.contactId,
          sessionDays:        schedDays,
          sessionDurationHrs: schedDuration,
          sessionTimes:       schedTimes,
          sessionTimezone:    schedTimezone,
          startDate:          schedStartDate || undefined,
          studentName:        student.studentName,
          tutorName:          student.tutorAssigned,
        }),
      });
      if (!res.ok) throw new Error();
      const newAvailability = encodeSchedule(schedDays, schedDuration, schedTimes, schedTimezone);
      setStudent(prev => prev ? {
        ...prev,
        availability:    newAvailability,
        sessionsPerWeek: schedDays.length.toString(),
        startDate:       schedStartDate || prev.startDate,
      } : prev);
      setScheduleOpen(false);
      addToast('Schedule saved to GHL', true);
    } catch {
      addToast('Failed to save schedule', false);
    } finally {
      setScheduleSaving(false);
    }
  }

  async function saveProgress() {
    if (!student) return;
    const sessions = parseInt(editSessions);
    const hours    = parseFloat(editHours);
    if (isNaN(sessions) || isNaN(hours)) return;
    setProgressSaving(true);
    try {
      const res = await fetch('/api/ssc-update-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId:         student.contactId,
          sessionsCompleted: sessions,
          hoursCompleted:    hours,
          hoursPurchased:    student.hoursPurchased,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStudent(prev => prev ? {
        ...prev,
        sessionsCompleted: sessions,
        hoursCompleted:    hours,
        hoursRemaining:    data.hoursRemaining ?? Math.max(0, prev.hoursPurchased - hours),
      } : prev);
      setSessionsSavedToGHL(true);
      setProgressOpen(false);
      addToast('Progress saved to GHL', true);
    } catch {
      addToast('Failed to save progress', false);
    } finally {
      setProgressSaving(false);
    }
  }

  function toggleSchedDay(day: DayAbbrev) {
    setSchedDays(prev => {
      if (prev.includes(day)) {
        setSchedTimes(t => { const n = { ...t }; delete n[day]; return n; });
        return prev.filter(d => d !== day);
      }
      return [...prev, day];
    });
  }

  function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (password === 'StudyCore25') {
      localStorage.setItem('sc_auth', 'true');
      setAuthed(true);
    } else {
      setAuthError('Incorrect password');
    }
  }

  const callType: CallType = CALL_TYPES.find(c => c.id === activeCallType) ?? CALL_TYPES[0];

  function switchCallType(id: CallTypeId) {
    setActiveCallType(id);
    setSopOpen(false);
  }

  function goToScript(callTypeId: string) {
    switchCallType(callTypeId as CallTypeId);
    setTimeout(() => {
      callTabsRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }

  function updateField(key: string, value: string) {
    setPrepCard(prev => {
      const next = { ...prev, [key]: value };
      if (student?.contactId) {
        try {
          localStorage.setItem(`ssc_prepcard_${student.contactId}`, JSON.stringify(next));
          setHasSavedData(true);
        } catch {}
      }
      return next;
    });
  }

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading student...</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-sm mb-3">Student not found.</p>
          <a href="/ssc" className="text-[#1e2090] text-sm hover:underline">← Back to students</a>
        </div>
      </div>
    );
  }

  // ── Computed values ──────────────────────────────────────────────────────────
  const TZ_ABBR: Record<string, string> = {
    'America/New_York': 'ET', 'America/Chicago': 'CT', 'America/Denver': 'MT',
    'America/Los_Angeles': 'PT', 'America/Phoenix': 'MST', 'America/Anchorage': 'AKT', 'Pacific/Honolulu': 'HT',
  };

  const scoreGap      = student.currentScore && student.targetScore
    ? parseInt(student.targetScore) - parseInt(student.currentScore)
    : null;
  const hasProgress   = student.hoursPurchased > 0;
  const totalSessions = calcTotalSessions(student);

  // Auto-calc sessions completed from start date + schedule (used for backfill; beats GHL value when available)
  const autoCalcSessions: number | null = (() => {
    const startD = schedStartDate || student.startDate;
    const days   = schedDays.length ? schedDays : (hasSchedule(student.availability) ? parseSchedule(student.availability, student.sessionsPerWeek).sessionDays : []);
    if (!startD || !days.length) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return generateSessionDates(startD, days, 500).filter(d => d <= today).length;
  })();
  const effectiveSessionsCompleted = sessionsSavedToGHL
    ? student.sessionsCompleted
    : (autoCalcSessions ?? student.sessionsCompleted);

  // Progress bar: use sessions if available, else hours
  const pctSessions   = totalSessions > 0
    ? Math.min(100, Math.round((effectiveSessionsCompleted / totalSessions) * 100))
    : 0;
  const pct           = totalSessions > 0 ? pctSessions
    : hasProgress ? Math.min(100, Math.round((student.hoursCompleted / student.hoursPurchased) * 100))
    : 0;

  const isLow         = student.hoursRemaining > 0 && student.hoursRemaining <= 5;
  const showDots      = totalSessions > 0 && totalSessions <= 30;

  // Milestone positions on progress bar
  const s1Pct = totalSessions > 0 ? Math.round((1 / totalSessions) * 100) : 0;
  const s3Pct = totalSessions > 0 ? Math.round((3 / totalSessions) * 100) : 0;

  // Schedule section
  const scheduleSet = hasSchedule(student.availability);
  const reminders   = scheduleSet
    ? calcCheckInReminders(student)
    : [];

  // Session calendar (next 10 projected)
  const projectedSessions = scheduleSet && student.startDate
    ? generateSessionDates(student.startDate, schedDays.length ? schedDays : parseSchedule(student.availability, student.sessionsPerWeek).sessionDays, 10)
    : [];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Toasts */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`rounded-lg px-4 py-3 text-sm shadow-lg text-white ${t.ok ? 'bg-green-600' : 'bg-red-600'}`}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="bg-[#1e2090] text-white px-6 pt-4 pb-5">
        <div className="flex items-center gap-3 mb-2">
          <a href="/ssc" className="text-blue-200 hover:text-white text-sm transition">← All Students</a>
        </div>

        {/* Name row + stage selector */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{student.studentName}</h1>
            <div className="flex items-center gap-3 mt-1 text-blue-200 text-sm flex-wrap">
              {student.parentName && <span>Parent: {student.parentName}</span>}
              {student.tutorAssigned && <span className="opacity-60">·</span>}
              {student.tutorAssigned && <span>Tutor: {student.tutorAssigned}</span>}
              {scheduleSet && (() => {
                const { sessionDays, sessionTimezone, sessionTimes } = parseSchedule(student.availability, student.sessionsPerWeek);
                const tzLabel = sessionTimezone ? (TZ_ABBR[sessionTimezone] ?? '') : '';
                const dayTimeStr = sessionDays.map(d => {
                  const t = sessionTimes[d];
                  return t ? `${d} ${t}` : d;
                }).join(', ');
                return (
                  <>
                    <span className="opacity-60">·</span>
                    <span>{sessionDays.length}x/wk · {dayTimeStr}{tzLabel ? ` ${tzLabel}` : ''}</span>
                  </>
                );
              })()}
              {student.currentScore && student.targetScore && (
                <>
                  <span className="opacity-60">·</span>
                  <span>
                    {student.currentScore}
                    <span className="text-blue-400 mx-1">→</span>
                    {student.targetScore}
                    {scoreGap !== null && scoreGap > 0 && (
                      <span className="text-blue-400 ml-1 text-xs">(+{scoreGap})</span>
                    )}
                  </span>
                </>
              )}
              {student.hasGuarantee === 'Yes' && (
                <span className="bg-yellow-400 text-yellow-900 text-xs px-2 py-0.5 rounded-full font-medium">Guarantee</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {stageSaving && <span className="text-blue-300 text-xs animate-pulse">Saving...</span>}
            <select
              value={student.stageId}
              onChange={e => changeStage(e.target.value)}
              disabled={stageSaving}
              className="bg-[#2730a0] text-white text-xs rounded-lg px-2 py-1.5 border border-blue-400 focus:outline-none cursor-pointer disabled:opacity-50 appearance-none pr-6"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%2393c5fd\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
            >
              {SELECTABLE_STAGES.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Program progress */}
        {hasProgress && (
          <div className="mt-5 pb-1">
            {/* Top row: label + percentage */}
            <div className="flex items-baseline justify-between text-xs mb-3">
              <span className="text-blue-200 font-medium flex items-center gap-2 flex-wrap">
                Program Progress
                <span className="text-white font-bold">{Math.round(student.hoursCompleted)}/{student.hoursPurchased}h</span>
                {effectiveSessionsCompleted > 0 && totalSessions > 0 && (
                  <span className="text-blue-300 font-normal">· {effectiveSessionsCompleted}/{totalSessions} sessions{!sessionsSavedToGHL && autoCalcSessions !== null ? ' (calc)' : ''}</span>
                )}
                <button
                  onClick={() => {
                    setEditSessions(effectiveSessionsCompleted.toString());
                    setEditHours(student.hoursCompleted.toString());
                    setProgressOpen(o => !o);
                  }}
                  className="text-blue-300 hover:text-white text-[10px] font-semibold underline underline-offset-2 transition"
                >
                  {progressOpen ? 'Cancel' : 'Edit'}
                </button>
              </span>
              <span className={`font-bold tabular-nums ${isLow ? 'text-red-300' : 'text-blue-200'}`}>{pct}%</span>
            </div>

            {/* Inline progress editor */}
            {progressOpen && (
              <div className="mb-3 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] text-blue-300 font-semibold uppercase tracking-wide">Sessions</label>
                  <input
                    type="number"
                    min={0}
                    value={editSessions}
                    onChange={e => setEditSessions(e.target.value)}
                    className="w-16 bg-[#1a1a7a] border border-blue-400 rounded-lg px-2 py-1 text-white text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-300"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] text-blue-300 font-semibold uppercase tracking-wide">Hours used</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={editHours}
                    onChange={e => setEditHours(e.target.value)}
                    className="w-20 bg-[#1a1a7a] border border-blue-400 rounded-lg px-2 py-1 text-white text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-300"
                  />
                </div>
                <button
                  onClick={saveProgress}
                  disabled={progressSaving}
                  className="bg-white text-[#1e2090] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition disabled:opacity-50"
                >
                  {progressSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}

            {/* Milestone label row — sits above bar, no overlap */}
            {(s1Pct > 0 || s3Pct > 0) && (
              <div className="relative h-4 mb-1">
                {s1Pct > 0 && s1Pct < 98 && (
                  <span
                    className="absolute bottom-0 text-[10px] font-bold text-white/60 -translate-x-1/2"
                    style={{ left: `${s1Pct}%` }}
                  >S1</span>
                )}
                {s3Pct > 0 && s3Pct < 98 && s3Pct !== s1Pct && (
                  <span
                    className="absolute bottom-0 text-[10px] font-bold text-white/60 -translate-x-1/2"
                    style={{ left: `${s3Pct}%` }}
                  >S3</span>
                )}
              </div>
            )}

            {/* Progress bar — markers are inside so no overflow */}
            <div className="relative h-2 bg-[#1a1a7a] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isLow ? 'bg-red-400' : pct >= 75 ? 'bg-orange-400' : 'bg-emerald-400'}`}
                style={{ width: `${pct}%` }}
              />
              {s1Pct > 0 && s1Pct < 98 && (
                <div className="absolute top-0 bottom-0 w-px bg-white/50" style={{ left: `${s1Pct}%` }} />
              )}
              {s3Pct > 0 && s3Pct < 98 && s3Pct !== s1Pct && (
                <div className="absolute top-0 bottom-0 w-px bg-white/50" style={{ left: `${s3Pct}%` }} />
              )}
            </div>

            {/* Session dots */}
            {showDots && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {Array.from({ length: totalSessions }, (_, i) => {
                  const done = i < effectiveSessionsCompleted;
                  return (
                    <div
                      key={i}
                      title={`Session ${i + 1}${done ? ' — completed' : ''}`}
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        done
                          ? 'bg-emerald-400 text-white'
                          : 'bg-[#1a1a7a] border border-blue-500/60 text-blue-300'
                      }`}
                    >
                      {done ? '✓' : i + 1}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Program Panel ── */}
      <div className="bg-white border-b border-gray-100">

        {/* Schedule — slim bar when collapsed */}
        <div>
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-base shrink-0">📅</span>
              {!scheduleSet && !scheduleOpen && (
                <span className="text-sm text-amber-600 font-medium">No schedule set — add after onboarding call</span>
              )}
              {scheduleSet && !scheduleOpen && (() => {
                const { sessionDays, sessionDurationHrs, sessionTimezone, sessionTimes } = parseSchedule(student.availability, student.sessionsPerWeek);
                const tzLabel = sessionTimezone ? (TZ_ABBR[sessionTimezone] ?? sessionTimezone) : '';
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {sessionDays.map(d => {
                      const t = sessionTimes[d];
                      return (
                        <span key={d} className="bg-[#e8e9f8] text-[#1e2090] text-xs font-semibold px-2.5 py-0.5 rounded-full">
                          {d}{t ? ` · ${t}` : ''}
                        </span>
                      );
                    })}
                    <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2.5 py-0.5 rounded-full">{sessionDurationHrs}h{tzLabel ? ` · ${tzLabel}` : ''}</span>
                  </div>
                );
              })()}
              {scheduleOpen && <span className="text-sm font-semibold text-gray-800">Edit Schedule</span>}
            </div>
            <button
              onClick={() => setScheduleOpen(o => !o)}
              className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                scheduleOpen
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : scheduleSet
                  ? 'text-[#1e2090] hover:bg-[#e8e9f8]'
                  : 'bg-[#1e2090] text-white hover:bg-[#171a7a]'
              }`}
            >
              {scheduleOpen ? '✕ Close' : scheduleSet ? 'Edit' : '+ Set Schedule'}
            </button>
          </div>

          {scheduleOpen && (
            <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-5">
              {/* Days */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2.5">Session days</p>
                <div className="flex gap-2 flex-wrap">
                  {ALL_DAYS.map(day => (
                    <button
                      key={day}
                      onClick={() => toggleSchedDay(day)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
                        schedDays.includes(day)
                          ? 'bg-[#1e2090] text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2.5">Duration</p>
                <div className="flex gap-2">
                  {[1, 1.5, 2].map(d => (
                    <button
                      key={d}
                      onClick={() => setSchedDuration(d)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
                        schedDuration === d
                          ? 'bg-[#1e2090] text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {d}h
                    </button>
                  ))}
                </div>
              </div>

              {/* Per-day time pickers */}
              {schedDays.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2.5">Session times</p>
                  <div className="space-y-2">
                    {schedDays.map(day => (
                      <div key={day} className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-[#1e2090] bg-[#e8e9f8] px-2.5 py-1 rounded-full w-12 text-center shrink-0">{day}</span>
                        <select
                          value={schedTimes[day] ?? ''}
                          onChange={e => setSchedTimes(prev => ({ ...prev, [day]: e.target.value }))}
                          className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1e2090]"
                        >
                          <option value="">No time set</option>
                          {Array.from({ length: 33 }, (_, i) => {
                            const totalMins = 360 + i * 30;
                            const h24 = Math.floor(totalMins / 60);
                            const m = totalMins % 60;
                            const h12 = h24 % 12 || 12;
                            const ampm = h24 < 12 ? 'AM' : 'PM';
                            const label = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
                            return <option key={i} value={label}>{label}</option>;
                          })}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timezone */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2.5">Timezone</p>
                <select
                  value={schedTimezone}
                  onChange={e => setSchedTimezone(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1e2090]"
                >
                  <option value="America/New_York">Eastern (ET)</option>
                  <option value="America/Chicago">Central (CT)</option>
                  <option value="America/Denver">Mountain (MT)</option>
                  <option value="America/Los_Angeles">Pacific (PT)</option>
                  <option value="America/Phoenix">Arizona (MST)</option>
                  <option value="America/Anchorage">Alaska (AKT)</option>
                  <option value="Pacific/Honolulu">Hawaii (HT)</option>
                </select>
              </div>

              {/* Start date */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2.5">Start date</p>
                <input
                  type="date"
                  value={schedStartDate}
                  onChange={e => setSchedStartDate(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1e2090]"
                />
                {schedStartDate && schedDays.length > 0 && (() => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const allDates = generateSessionDates(schedStartDate, schedDays, 500);
                  const count = allDates.filter(d => d <= today).length;
                  return count > 0 ? (
                    <p className="mt-1.5 text-xs text-[#1e2090] font-medium">{count} session{count !== 1 ? 's' : ''} completed since start date</p>
                  ) : null;
                })()}
              </div>

              <button
                onClick={saveSchedule}
                disabled={scheduleSaving || schedDays.length === 0}
                className="bg-[#1e2090] text-white rounded-xl px-5 py-2 text-sm font-semibold hover:bg-[#171a7a] transition disabled:opacity-40 shadow-sm"
              >
                {scheduleSaving ? 'Saving…' : 'Save Schedule & Notify Scheduling'}
              </button>
            </div>
          )}
        </div>

        {/* Check-in Reminders Card */}
        {scheduleSet && reminders.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Check-in Reminders</span>
            </div>
            <div className="divide-y divide-gray-50">
              {reminders.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between gap-3 px-5 py-3 ${reminderBg(r.status)}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span>{reminderIcon(r.status)}</span>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-gray-800">{r.type}</span>
                      <span className={`ml-2 text-xs ${r.status === 'overdue' ? 'text-red-600 font-medium' : r.status === 'done' ? 'text-gray-400' : 'text-gray-500'}`}>
                        {reminderLabel(r)}
                      </span>
                    </div>
                  </div>
                  {r.status !== 'done' && (
                    <button
                      onClick={() => goToScript(r.callTypeId)}
                      className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-[#e8e9f8] text-[#1e2090] hover:bg-[#1e2090] hover:text-white transition font-semibold"
                    >
                      Go to script →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projected Sessions Card */}
        {scheduleSet && projectedSessions.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => setCalendarOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">🗓️</span>
                <span className="text-sm font-semibold text-gray-900">Projected Sessions</span>
              </div>
              <span className="text-gray-400 text-xs font-medium">{calendarOpen ? 'Hide ▲' : 'Show ▼'}</span>
            </button>
            {calendarOpen && (
              <div className="px-5 pb-4 border-t border-gray-50">
                <ul className="mt-3 grid grid-cols-2 gap-1.5">
                  {projectedSessions.map((date, i) => {
                    const sessionNum = i + 1;
                    const isDone     = i < effectiveSessionsCompleted;
                    const isNext     = i === effectiveSessionsCompleted;
                    const dayNames   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                    const dayLabel   = dayNames[date.getDay()];
                    const dateLabel  = `${MONTH_ABBR[date.getMonth()]} ${date.getDate()}`;
                    return (
                      <li
                        key={i}
                        className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2 ${
                          isNext ? 'bg-blue-50 border border-blue-200 font-semibold text-[#1e2090]'
                            : isDone ? 'text-gray-300'
                            : 'text-gray-600'
                        }`}
                      >
                        <span className={`w-5 font-bold text-center shrink-0 ${isDone ? 'text-emerald-500' : ''}`}>
                          {isDone ? '✓' : `S${sessionNum}`}
                        </span>
                        <span>{dayLabel} {dateLabel}</span>
                        {isNext && <span className="text-blue-500 ml-auto text-[10px] font-bold">NEXT</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="bg-white border-b border-gray-100 px-6 py-2 flex gap-1" ref={callTabsRef}>
        <a href="/match-queue" className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition">Operations</a>
        <a href="/tqc"         className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition">TQC</a>
        <a href="/check-ins"   className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition">Check-ins</a>
        <a href="/ssc"         className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#1e2090] text-white">SSC</a>
      </div>

      {/* Call type tabs */}
      <div className="bg-white border-b border-gray-100 px-5 py-2.5 flex gap-1.5 overflow-x-auto">
        {CALL_TYPES.map(ct => (
          <button
            key={ct.id}
            onClick={() => switchCallType(ct.id)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition whitespace-nowrap ${
              activeCallType === ct.id
                ? 'bg-[#1e2090] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {ct.title}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Prep Card */}
        <div className="w-2/5 border-r border-gray-100 bg-white overflow-y-auto flex flex-col">

          {/* Call header */}
          <div className="px-5 pt-5 pb-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">{callType.title}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{callType.duration}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {airtableLoading && <span className="text-[10px] text-gray-400 font-medium animate-pulse">Syncing from Airtable…</span>}
                  {!airtableLoading && airtableBadge && <span className="text-[10px] text-emerald-600 font-semibold">✓ {airtableBadge}</span>}
                  {!airtableLoading && !airtableBadge && hasSavedData && <span className="text-[10px] text-blue-500 font-medium">● Saved</span>}
                </div>
              </div>
              <span className="text-2xl">
                {callType.id === 'onboarding' ? '👋' :
                 callType.id === 'post-session-1' ? '✅' :
                 callType.id === 'weekly-student' || callType.id === 'weekly-parent' ? '📞' :
                 callType.id === 'phase-checkin' ? '📊' :
                 callType.id === 'sat-day' ? '🎯' :
                 callType.id === 'flag-response' ? '🚩' :
                 callType.id === 'refund-save' ? '💬' : '📋'}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Auto-filled section */}
            {callType.prepCardFields.filter(f => f.autoFillKey).length > 0 && (
              <div className="px-5 pt-4 pb-2">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">From GHL</span>
                </div>
                <div className="space-y-0">
                  {callType.prepCardFields
                    .filter(f => f.autoFillKey)
                    .map(field => (
                      <div key={field.key} className="group flex items-baseline gap-3 py-2.5 border-b border-gray-50">
                        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-24 shrink-0 pt-0.5 leading-tight">
                          {field.label}
                        </label>
                        <input
                          type="text"
                          value={prepCard[field.key] ?? ''}
                          onChange={e => updateField(field.key, e.target.value)}
                          placeholder={field.placeholder ?? '—'}
                          className="flex-1 text-sm font-medium text-gray-800 bg-transparent border-b border-transparent group-hover:border-gray-200 focus:border-[#1e2090] outline-none transition pb-0.5 min-w-0"
                        />
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Fill-in section */}
            {(callType.prepCardFields.filter(f => !f.autoFillKey).length > 0 || callType.hasSessionSchedule) && (
              <div className="px-5 pt-4 pb-2">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                  <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Fill in before the call</span>
                </div>
                <div className="space-y-0">
                  {/* Dynamic session rows — one per scheduled day */}
                  {callType.hasSessionSchedule && (() => {
                    const days = schedDays.length > 0 ? schedDays : [''];
                    return days.map((day, i) => {
                      const sessionNum = i + 1;
                      const dayKey  = `session${sessionNum}Day`;
                      const timeKey = `session${sessionNum}Time`;
                      const dayVal  = prepCard[dayKey] ?? (day || '');
                      const timeVal = prepCard[timeKey] ?? (day ? (schedTimes[day as DayAbbrev] ?? '') : '');
                      return (
                        <div key={dayKey} className="py-2.5 border-b border-gray-50">
                          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                            Session {sessionNum}{!dayVal && <span className="ml-1.5 text-orange-400">●</span>}
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={dayVal}
                              onChange={e => updateField(dayKey, e.target.value)}
                              placeholder="Day"
                              className={`w-24 text-sm font-medium border-b pb-1 outline-none transition bg-transparent ${dayVal ? 'text-gray-800 border-gray-200 focus:border-[#1e2090]' : 'text-gray-400 border-orange-200 focus:border-orange-400 placeholder:text-orange-300'}`}
                            />
                            <input
                              type="text"
                              value={timeVal}
                              onChange={e => updateField(timeKey, e.target.value)}
                              placeholder="Time"
                              className={`flex-1 text-sm font-medium border-b pb-1 outline-none transition bg-transparent ${timeVal ? 'text-gray-800 border-gray-200 focus:border-[#1e2090]' : 'text-gray-400 border-orange-200 focus:border-orange-400 placeholder:text-orange-300'}`}
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                  {callType.prepCardFields
                    .filter(f => !f.autoFillKey)
                    .map(field => (
                      <div key={field.key} className="py-2.5 border-b border-gray-50">
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                          {field.label}
                          {!prepCard[field.key] && <span className="ml-1.5 text-orange-400">●</span>}
                        </label>
                        {field.wide ? (
                          <textarea
                            value={prepCard[field.key] ?? ''}
                            onChange={e => updateField(field.key, e.target.value)}
                            placeholder={field.placeholder ?? ''}
                            rows={2}
                            className="w-full text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1e2090] resize-none"
                          />
                        ) : (
                          <input
                            type="text"
                            value={prepCard[field.key] ?? ''}
                            onChange={e => updateField(field.key, e.target.value)}
                            placeholder={field.placeholder ?? ''}
                            className={`w-full text-sm font-medium border-b pb-1 outline-none transition bg-transparent ${
                              prepCard[field.key]
                                ? 'text-gray-800 border-gray-200 focus:border-[#1e2090]'
                                : 'text-gray-400 border-orange-200 focus:border-orange-400 placeholder:text-orange-300'
                            }`}
                          />
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Log call CTA */}
          <div className="px-5 py-4 border-t border-gray-100">
            <a
              href={callType.tallyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-[#1e2090] hover:bg-[#171a7a] text-white rounded-xl py-3 text-sm font-bold transition shadow-sm"
            >
              📋 Log this call →
            </a>
            <p className="text-[10px] text-gray-400 text-center mt-2 font-medium uppercase tracking-wide">Opens Tally · fill out right after the call</p>
          </div>
        </div>

        {/* Right: Script */}
        <div className="w-3/5 overflow-y-auto bg-white">
          <div className="px-6 py-3.5 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur z-10">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-bold text-gray-900 text-sm">Live Script</h2>
              <div className="flex items-center gap-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-blue-300" />Filled</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-orange-300" />Missing</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-indigo-300" />Screen</span>
              </div>
            </div>
          </div>

          <div className="px-6 py-4">
            <ScriptRenderer template={callType.script} values={prepCard} />
          </div>

          {/* SOP accordion */}
          <div className="mx-6 mb-6 border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setSopOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              <span>SOP Quick Reference</span>
              <span className="text-gray-400">{sopOpen ? '▲' : '▼'}</span>
            </button>
            {sopOpen && (
              <div className="px-4 pb-4 border-t border-gray-100">
                <ul className="mt-3 space-y-1.5">
                  {callType.sopPoints.map((point, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="text-[#1e2090] mt-0.5 shrink-0">•</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
