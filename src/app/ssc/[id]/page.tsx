'use client';

import { useEffect, useRef, useState } from 'react';
import { CALL_TYPES, type CallTypeId, type CallType } from '@/lib/call-scripts';
import OnboardingPrepCard from '@/components/OnboardingPrepCard';
import { calcTotalSessions } from '@/lib/ghl-support';
import type { SscCheckin } from '@/lib/airtable';
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
  opportunityId:      string;
  contactId:          string;
  studentName:        string;
  parentName:         string;
  contactName:        string;
  contactFirstName:   string;
  stageId:            string;
  currentScore:       string;
  targetScore:        string;
  tutorAssigned:      string;
  weeklyCheckinTime:  string;
  availability:       string;
  hasGuarantee:       string;
  sessionsCompleted:  number;
  sessionsPerWeek:    string;
  hoursCompleted:     number;
  hoursRemaining:     number;
  hoursPurchased:     number;
  startDate:          string;
  airtableStudentId:  number;
  studentPhone:       string;
  parentPhone:        string;
  studentEmail:       string;
  parentEmail:        string;
  parent2Name:        string;
  parent2Email:       string;
  parent2Phone:       string;
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
    sessionsPerWeek:      student.sessionsPerWeek || '2',
    hoursPurchased:       student.hoursPurchased > 0 ? student.hoursPurchased.toString() : '',
  };
}

function preprocessTemplate(template: string, values: Record<string, string>): string {
  // [[if key=value]]...[[endif]] — show block only when values[key] matches
  let out = template.replace(
    /\[\[if (\w+)=([^\]]+)\]\]([\s\S]*?)\[\[endif\]\]/g,
    (_, key, val, block) => {
      const actual = (values[key] ?? '').trim();
      if (!actual) return ''; // no value set — hide until field is filled
      return actual === val.trim() ? block : '';
    }
  );
  // [[ifempty key]]...[[endif]] — show block only when values[key] is blank
  out = out.replace(
    /\[\[ifempty (\w+)\]\]([\s\S]*?)\[\[endif\]\]/g,
    (_, key, block) => ((values[key] ?? '').trim() ? '' : block)
  );
  return out;
}

function ScriptRenderer({ template, values }: { template: string; values: Record<string, string> }) {
  const lines = preprocessTemplate(template, values).split('\n');
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

/** Convert "4:00 PM", "4pm", "16:00" → "16:00" for <input type="time"> */
function parseTimeToHHMM(raw: string): string {
  if (!raw) return '';
  const match12 = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (match12) {
    let h = parseInt(match12[1]);
    const m = parseInt(match12[2] ?? '0');
    const isPm = match12[3].toLowerCase() === 'pm';
    if (isPm && h !== 12) h += 12;
    if (!isPm && h === 12) h = 0;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
  }
  const match24 = raw.match(/(\d{1,2}):(\d{2})/);
  if (match24) return `${match24[1].padStart(2,'0')}:${match24[2]}`;
  return '';
}

// GHL calendar IDs (from /api/ghl-calendars)
const CHECKIN_CALENDARS: Record<string, string> = {
  'Post-Session 1': 'S1oyQzx5qzDJhJ0vB8mD',   // SSC StudyCore Check-In
  'Post-Session 3': 'VLhGmowh6RSHytlRMgXN',   // 3 Session Check In Call
  'Weekly Sync':    'S1oyQzx5qzDJhJ0vB8mD',   // SSC StudyCore Check-In
  'Phase Check-in': 'S1oyQzx5qzDJhJ0vB8mD',   // SSC StudyCore Check-In
  'Onboarding':     'd56zqGolVLjbRTvl1Gyt',   // Onboarding Call
};
const DEFAULT_CHECKIN_CALENDAR = 'S1oyQzx5qzDJhJ0vB8mD'; // SSC StudyCore Check-In

/** Return the correct GHL calendar ID for a given check-in type */
function guessCalendarForType(calendars: { id: string; name: string }[], type: string): string {
  const match = Object.entries(CHECKIN_CALENDARS).find(([t]) =>
    type.toLowerCase().includes(t.toLowerCase())
  );
  const targetId = match?.[1] ?? DEFAULT_CHECKIN_CALENDAR;
  // Verify the ID exists in the fetched list; fall back to first if not
  return calendars.find(c => c.id === targetId)?.id ?? calendars[0]?.id ?? targetId;
}

/** Format a local date+time string into ISO with timezone offset */
function toIsoWithOffset(dateStr: string, timeStr: string, tz: string): string {
  // Build a local Date from "YYYY-MM-DD" + "HH:MM" and format to ISO-like string with offset
  if (!dateStr || !timeStr) return '';
  try {
    const dtStr = `${dateStr}T${timeStr}:00`;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZoneName: 'shortOffset',
    });
    // Use Date to get epoch for the given local time in the timezone
    const parts = formatter.formatToParts(new Date(`${dtStr}`));
    void parts; // suppress unused warning
    // Simpler: pass naive local time and let the server adjust
    return new Date(`${dtStr}`).toISOString();
  } catch {
    return new Date(`${dateStr}T${timeStr}:00`).toISOString();
  }
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

// ─── Session row (expandable) ─────────────────────────────────────────────────

function SessionRow({
  s,
  statusBadge,
  onTrackIcon,
  hasNotesSsc,
  hasFathom,
  fmtDate,
}: {
  s: any;
  statusBadge: string;
  onTrackIcon: string;
  hasNotesSsc: boolean;
  hasFathom: boolean;
  fmtDate: (d: string) => string;
}) {
  const [topicsOpen, setTopicsOpen]   = useState(false);
  const [struggleOpen, setStruggleOpen] = useState(false);

  const engVal = s.engagementRptd || s.engagement || '';

  return (
    <div className="px-5 py-3.5">
      {/* Row header */}
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-xs font-bold text-gray-700 shrink-0">{fmtDate(s.date)}</span>
          {s.sessionStatus && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusBadge}`}>{s.sessionStatus}</span>
          )}
          {s.duration > 0 && (
            <span className="text-xs text-gray-400 shrink-0">{s.duration}h</span>
          )}
          {engVal && (
            <span className="text-xs text-gray-600 shrink-0">· {engVal}</span>
          )}
          {s.tutorId && (
            <span className="text-[10px] text-gray-400 shrink-0">Tutor #{s.tutorId}</span>
          )}
          {onTrackIcon && (
            <span className="text-xs shrink-0" title={`On track: ${s.onTrack}`}>{onTrackIcon}</span>
          )}
        </div>
        {hasFathom && (
          <a
            href={s.fathomLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#1e2090] hover:underline shrink-0"
          >
            Fathom ↗
          </a>
        )}
      </div>

      {/* Topics (collapsed by default) */}
      {s.topics && (
        <div className="mb-1">
          <button
            onClick={() => setTopicsOpen(o => !o)}
            className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-600 transition"
          >
            Topics {topicsOpen ? '▲' : '▼'}
          </button>
          {topicsOpen && <p className="text-xs text-gray-600 mt-1 leading-relaxed">{s.topics}</p>}
        </div>
      )}

      {/* Homework assigned */}
      {s.hwAssigned && (
        <p className="text-xs text-gray-500 mb-1">HW: {s.hwAssigned}</p>
      )}

      {/* Notes for SSC (highlighted) */}
      {hasNotesSsc && (
        <p className="text-xs text-blue-800 bg-yellow-50 border border-yellow-200 rounded-lg px-2 py-1 mb-1">
          📌 {s.notesSsc}
        </p>
      )}

      {/* Student struggle (collapsed by default) */}
      {s.studentStruggle && (
        <div>
          <button
            onClick={() => setStruggleOpen(o => !o)}
            className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide hover:text-amber-700 transition"
          >
            Struggle {struggleOpen ? '▲' : '▼'}
          </button>
          {struggleOpen && <p className="text-xs text-amber-700 mt-1 leading-relaxed">{s.studentStruggle}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SscContactPage({ params }: { params: { id: string } }) {
  const [authed, setAuthed]               = useState(false);
  const [password, setPassword]           = useState('');
  const [authError, setAuthError]         = useState('');
  const [student, setStudent]             = useState<SscStudent | null>(null);
  const [loading, setLoading]             = useState(true);
  const [activeCallType, setActiveCallType] = useState<CallTypeId>('onboarding');
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [prepCard, setPrepCard]           = useState<Record<string, string>>({});
  const [sopOpen, setSopOpen]             = useState(false);
  const [stageSaving, setStageSaving]     = useState(false);
  const [toasts, setToasts]               = useState<{ id: number; msg: string; ok: boolean }[]>([]);

  const [airtableLoading, setAirtableLoading] = useState(false);
  const [airtableBadge, setAirtableBadge]     = useState<string>('');
  const [hasSavedData, setHasSavedData]       = useState(false);
  const [checkins, setCheckins]               = useState<SscCheckin[]>([]);
  const [checkinsOpen, setCheckinsOpen]       = useState(false);

  // Calendar booking state
  const [ghlCalendars, setGhlCalendars]         = useState<{ id: string; name: string }[]>([]);
  const [bookingIdx, setBookingIdx]             = useState<number>(-1);   // which reminder row is open
  const [bookDate, setBookDate]                 = useState('');
  const [bookTime, setBookTime]                 = useState('');
  const [bookDuration, setBookDuration]         = useState(30);
  const [bookCalendarId, setBookCalendarId]     = useState('');
  const [bookingSaving, setBookingSaving]       = useState(false);

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
  const [editHoursPurchased, setEditHoursPurchased] = useState('');
  const [progressSaving, setProgressSaving]     = useState(false);
  const [sessionsSavedToGHL, setSessionsSavedToGHL] = useState(false);

  // SSC journey state
  const [sessions, setSessions]               = useState<any[]>([]);
  const [totalHoursUsed, setTotalHoursUsed]   = useState<number>(0);
  const [sessionsOpen, setSessionsOpen]       = useState(false);
  const [sscNotes, setSscNotes]               = useState('');
  const [notesSaving, setNotesSaving]         = useState(false);
  const [onboardChecklist, setOnboardChecklist] = useState<Record<string, boolean>>({});
  const [parentUpdateDone, setParentUpdateDone] = useState<string>('');
  const [showPrepCard, setShowPrepCard]         = useState(false);
  const [airtableProfile, setAirtableProfile]   = useState<import('@/lib/airtable').SscAirtableData | null>(null);

  // Log check-in panel state
  const [logOpen, setLogOpen]               = useState(false);
  const [logStatus, setLogStatus]           = useState<'Green' | 'Yellow' | 'Red'>('Green');
  const [logNotes, setLogNotes]             = useState('');
  const [logConcerns, setLogConcerns]       = useState('');
  const [logComposite, setLogComposite]     = useState('');
  const [logMath, setLogMath]               = useState('');
  const [logRW, setLogRW]                   = useState('');
  const [logFirstRating, setLogFirstRating] = useState('');
  const [logFathom, setLogFathom]           = useState('');
  const [logFounder, setLogFounder]         = useState(false);
  const [logWeeklyTime, setLogWeeklyTime]   = useState('');
  const [logSaving, setLogSaving]           = useState(false);

  // Admin broadcast state
  const [isAdmin, setIsAdmin]               = useState(false);
  const [broadcastOpen, setBroadcastOpen]   = useState(false);
  const [broadcastMsg, setBroadcastMsg]     = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult]   = useState<{ sent: number; failed: number; total: number } | null>(null);

  // Book to Calendar state
  const [calBookOpen,    setCalBookOpen]    = useState(false);
  const [calBooking,     setCalBooking]     = useState(false);
  const [calBookResult,  setCalBookResult]  = useState<{ ok: boolean; message: string } | null>(null);
  const [calForm, setCalForm] = useState({
    studentCheckinDay:  '',
    studentCheckinTime: '',
    studentCheckinTz:   'America/New_York',
    parentCheckinDay:   '',
    parentCheckinTime:  '',
    parentCheckinTz:    'America/New_York',
    postSession1Date:   '',
    postSession1Time:   '',
    postSession1Tz:     'America/New_York',
    postSession3Date:   '',
    postSession3Time:   '',
    postSession3Tz:     'America/New_York',
  });

  // Open tutor flags
  const [openFlags, setOpenFlags]           = useState<import('@/lib/airtable').OpenFlag[]>([]);

  const callTabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (localStorage.getItem('sc_auth') === 'true') setAuthed(true);
      if (localStorage.getItem('sc_admin') === 'true') setIsAdmin(true);
    }
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

          // Load SSC notes, parent update, and onboarding checklist from localStorage
          const savedNotes = localStorage.getItem(`ssc_notes_${data.student.contactId}`) ?? '';
          setSscNotes(savedNotes);
          const savedParentUpdate = localStorage.getItem(`ssc_parent_update_${data.student.contactId}`) ?? '';
          setParentUpdateDone(savedParentUpdate);
          const savedChecklist = localStorage.getItem(`ssc_checklist_${data.student.contactId}`);
          if (savedChecklist) { try { setOnboardChecklist(JSON.parse(savedChecklist)); } catch {} }

          // Then fetch Airtable data for fields not already saved locally
          setAirtableLoading(true);
          const atUrl = `/api/ssc-airtable-student?name=${encodeURIComponent(data.student.studentName)}&parentName=${encodeURIComponent(data.student.contactName || data.student.parentName)}&contactFirstName=${encodeURIComponent(data.student.contactFirstName)}`;
          fetch(atUrl)
            .then(r => r.ok ? r.json() : null)
            .then((at: import('@/lib/airtable').SscAirtableData | null) => {
              if (!at) return;
              setAirtableProfile(at);
              const saved2 = localStorage.getItem(`ssc_prepcard_${data.student.contactId}`);
              const savedObj = saved2 ? (() => { try { return JSON.parse(saved2); } catch { return {}; } })() : {};

              setPrepCard(prev => {
                const next = { ...prev };
                // Only auto-fill if the user hasn't manually saved a value
                if (!savedObj.tutorScore && at.tutorSatScore)   next.tutorScore = at.tutorSatScore;
                // Prefer Airtable session frequency (human-readable label like "2x/week")
                if (at.sessionFrequency) {
                  // Normalize to a number string for {{sessionsPerWeek}} template variable
                  const freqMatch = at.sessionFrequency.match(/^(\d+)/);
                  if (freqMatch && !savedObj.sessionsPerWeek) next.sessionsPerWeek = freqMatch[1];
                }
                if (at.tutorName && !savedObj.tutorName) next.tutorName = at.tutorName;
                if (!savedObj.testDate   && at.satTestDate) {
                  // Format YYYY-MM-DD → "Dec 5, 2026"
                  const d = new Date(at.satTestDate + 'T12:00:00');
                  next.testDate = `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
                }
                if (!savedObj.weeklyCheckinParent && at.parentBestTime) next.weeklyCheckinParent = at.parentBestTime;
                return next;
              });

              // If Airtable has a corrected student name, update display immediately
              const nameCorrection = at.studentName && at.studentName !== data.student.studentName ? at.studentName : null;
              if (nameCorrection) {
                setStudent(prev => prev ? { ...prev, studentName: nameCorrection } : prev);
              }

              // If Airtable has hours purchased but GHL doesn't, sync both to GHL automatically
              if (at.hoursPurchased > 0 && data.student.hoursPurchased === 0) {
                setStudent(prev => prev ? { ...prev, hoursPurchased: at.hoursPurchased } : prev);
                fetch('/api/ssc-update-progress', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contactId:         data.student.contactId,
                    sessionsCompleted: data.student.sessionsCompleted,
                    hoursCompleted:    data.student.hoursCompleted,
                    hoursPurchased:    at.hoursPurchased,
                    ...(nameCorrection ? { studentName: nameCorrection } : {}),
                  }),
                })
                  .then(r => r.ok ? addToast(`Synced ${at.hoursPurchased}h from Airtable → GHL`, true) : addToast('Airtable sync failed', false))
                  .catch(() => addToast('Airtable sync failed', false));
              } else if (nameCorrection) {
                // Hours already synced but name still needs writing to GHL
                fetch('/api/ssc-update-progress', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contactId:         data.student.contactId,
                    sessionsCompleted: data.student.sessionsCompleted,
                    hoursCompleted:    data.student.hoursCompleted,
                    hoursPurchased:    data.student.hoursPurchased,
                    studentName:       nameCorrection,
                  }),
                }).catch(() => {});
              }

              // Fetch check-in history
              if (at.airtableRecordId) {
                fetch(`/api/ssc-checkins?recordId=${encodeURIComponent(at.airtableRecordId)}`)
                  .then(r => r.ok ? r.json() : null)
                  .then(d => { if (d?.checkins) setCheckins(d.checkins); })
                  .catch(() => {});
              }

              // Fetch open tutor flags for this student
              fetch(`/api/ssc-student-flags?studentName=${encodeURIComponent(data.student.studentName)}`)
                .then(r => r.ok ? r.json() : null)
                .then(d => { if (d?.flags) setOpenFlags(d.flags); })
                .catch(() => {});

              // Fetch sessions from Airtable using Seq number join key
              const sessionSeq = at.studentSeq || data.student.airtableStudentId;
              if (sessionSeq) {
                fetch(`/api/ssc-sessions?seq=${sessionSeq}`)
                  .then(r => r.ok ? r.json() : null)
                  .then(d => {
                    if (d?.sessions) setSessions(d.sessions);
                    if (typeof d?.totalHoursUsed === 'number') setTotalHoursUsed(d.totalHoursUsed);
                  })
                  .catch(() => {});
              }

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
    const sessions  = parseInt(editSessions);
    const hours     = parseFloat(editHours);
    const purchased = parseFloat(editHoursPurchased) || student.hoursPurchased;
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
          hoursPurchased:    purchased,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStudent(prev => prev ? {
        ...prev,
        sessionsCompleted: sessions,
        hoursCompleted:    hours,
        hoursPurchased:    purchased,
        hoursRemaining:    data.hoursRemaining ?? Math.max(0, purchased - hours),
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
    setActiveScenario(null);
  }

  function goToScript(callTypeId: string) {
    switchCallType(callTypeId as CallTypeId);
    setTimeout(() => {
      callTabsRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }

  function openBooking(idx: number, reminder: CheckInReminder) {
    if (bookingIdx === idx) { setBookingIdx(-1); return; }

    // Pre-fill date from reminder due date (YYYY-MM-DD)
    const d = reminder.dueDate;
    const dateStr = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
    setBookDate(dateStr);

    // Pre-fill time: use weeklyCheckinTime if available, else default 10:00
    const parsedTime = student?.weeklyCheckinTime ? parseTimeToHHMM(student.weeklyCheckinTime) : '';
    setBookTime(parsedTime || '10:00');
    setBookDuration(30);

    // Load and auto-select calendar
    if (!ghlCalendars.length) {
      fetch('/api/ghl-calendars')
        .then(r => r.ok ? r.json() : { calendars: [] })
        .then(d => {
          const cals = d.calendars ?? [];
          setGhlCalendars(cals);
          setBookCalendarId(guessCalendarForType(cals, reminder.type));
        })
        .catch(() => {});
    } else {
      setBookCalendarId(guessCalendarForType(ghlCalendars, reminder.type));
    }

    setBookingIdx(idx);
  }

  async function confirmBooking(reminder: CheckInReminder) {
    if (!student || !bookDate || !bookTime || !bookCalendarId) return;
    setBookingSaving(true);
    try {
      const tz = schedTimezone || 'America/New_York';
      const startIso = toIsoWithOffset(bookDate, bookTime, tz);
      const endDate  = new Date(`${bookDate}T${bookTime}:00`);
      endDate.setMinutes(endDate.getMinutes() + bookDuration);
      const endHH = endDate.getHours().toString().padStart(2,'0');
      const endMM = endDate.getMinutes().toString().padStart(2,'0');
      const endIso = toIsoWithOffset(bookDate, `${endHH}:${endMM}`, tz);

      const res = await fetch('/api/ssc-book-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calendarId: bookCalendarId,
          contactId:  student.contactId,
          startTime:  startIso,
          endTime:    endIso,
          title:      `${reminder.type} Check-in — ${student.studentName}`,
        }),
      });
      if (!res.ok) throw new Error();
      addToast(`Booked: ${reminder.type}`, true);
      setBookingIdx(-1);
    } catch {
      addToast('Booking failed', false);
    } finally {
      setBookingSaving(false);
    }
  }

  const CHECKIN_TYPE_MAP: Record<string, string> = {
    'onboarding':     'Onboarding Call',
    'post-session-1': 'Post-Session 1',
    'weekly-student': 'Weekly Student Check-in',
    'weekly-parent':  'Weekly Parent Check-in',
    'phase-checkin':  'Practice Test / Phase Check-in',
    'sat-day':        'SAT Day Check-in',
    'flag-response':  'Flag Response',
    'refund-save':    'Refund Save',
    'renewal':        'Renewal Call',
    'parent-update':  'Parent Update',
  };

  async function logCheckin() {
    if (!student || !airtableProfile) return;
    setLogSaving(true);
    try {
      const checkInType = CHECKIN_TYPE_MAP[activeCallType] ?? activeCallType;
      const res = await fetch('/api/ssc-log-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName:        student.studentName,
          airtableRecordId:   airtableProfile.airtableRecordId,
          studentSeq:         airtableProfile.studentSeq,
          checkInType,
          overallStatus:      logStatus,
          summaryNotes:       logNotes,
          concerns:           logConcerns,
          founderAttention:   logFounder,
          fathomLink:         logFathom || undefined,
          firstSessionRating: logFirstRating || undefined,
          practiceTestScore:  logComposite || undefined,
          mathScore:          logMath || undefined,
          rwScore:            logRW || undefined,
          weeklyCheckinTime:  logWeeklyTime || undefined,
          contactId:          student.contactId,
        }),
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      // Optimistically prepend new check-in to local state
      const today = new Date().toISOString().slice(0, 10);
      setCheckins(prev => [
        {
          id:                result.checkinId ?? `local-${Date.now()}`,
          checkInDate:       today,
          checkInType,
          overallStatus:     logStatus,
          summaryNotes:      logNotes,
          concerns:          logConcerns,
          submittedBy:       'SSC',
          founderAttention:  logFounder,
          fathomLink:        logFathom,
          firstSessionRating: logFirstRating,
          officialSatScore:  logComposite,
          hitTarget:         '',
        },
        ...prev,
      ]);
      // Reset form
      setLogOpen(false);
      setLogNotes('');
      setLogConcerns('');
      setLogComposite('');
      setLogMath('');
      setLogRW('');
      setLogFirstRating('');
      setLogFathom('');
      setLogFounder(false);
      setLogWeeklyTime('');
      setLogStatus('Green');
      addToast(`Check-in logged: ${checkInType}`, true);
    } catch {
      addToast('Failed to log check-in', false);
    } finally {
      setLogSaving(false);
    }
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
    // When the student's full name is edited, update the header and write to GHL
    if (key === 'studentName' && student && student.contactId && value.trim()) {
      const s = student;
      setStudent(prev => prev ? { ...prev, studentName: value.trim() } : prev);
      fetch('/api/ssc-update-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId:         s.contactId,
          sessionsCompleted: s.sessionsCompleted,
          hoursCompleted:    s.hoursCompleted,
          hoursPurchased:    s.hoursPurchased,
          studentName:       value.trim(),
        }),
      }).catch(() => {});
    }
  }

  async function saveNote() {
    if (!student) return;
    localStorage.setItem(`ssc_notes_${student.contactId}`, sscNotes);
    setNotesSaving(true);
    try {
      await fetch('/api/ssc-save-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: student.contactId, note: `[SSC Notes] ${sscNotes}` }),
      });
      addToast('Notes saved', true);
    } catch { addToast('Note save failed', false); }
    finally { setNotesSaving(false); }
  }

  function toggleChecklist(key: string) {
    if (!student) return;
    setOnboardChecklist(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(`ssc_checklist_${student.contactId}`, JSON.stringify(next));
      return next;
    });
  }

  function markParentUpdate() {
    if (!student) return;
    const today = new Date().toISOString().slice(0, 10);
    setParentUpdateDone(today);
    localStorage.setItem(`ssc_parent_update_${student.contactId}`, today);
    addToast('Parent update logged', true);
  }

  function parseCheckinText(text: string): { day: string; time24: string } | null {
    if (!text) return null;
    // Match patterns like "Sundays at 5:00 PM" or "Sunday at 17:00"
    const m = text.match(/(\w+)\s+at\s+(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
    if (!m) return null;
    let day = m[1].replace(/s$/i, ''); // remove trailing 's' (Sundays → Sunday)
    const hr = parseInt(m[2]);
    const min = m[3] ? parseInt(m[3]) : 0;
    const meridiem = m[4]?.toUpperCase();
    let hours24 = hr;
    if (meridiem === 'PM' && hr < 12) hours24 = hr + 12;
    if (meridiem === 'AM' && hr === 12) hours24 = 0;
    const time24 = `${String(hours24).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
    return { day, time24 };
  }

  // Pre-fill calendar booking form from prep card
  useEffect(() => {
    const p1 = parseCheckinText(prepCard.weeklyCheckinStudent ?? '');
    const p2 = parseCheckinText(prepCard.weeklyCheckinParent ?? '');
    setCalForm(prev => ({
      ...prev,
      ...(p1 ? { studentCheckinDay: p1.day, studentCheckinTime: p1.time24 } : {}),
      ...(p2 ? { parentCheckinDay: p2.day, parentCheckinTime: p2.time24 } : {}),
    }));
  }, [prepCard.weeklyCheckinStudent, prepCard.weeklyCheckinParent]);

  async function bookCalendar() {
    if (!student || calBooking) return;
    setCalBooking(true);
    setCalBookResult(null);
    try {
      const res = await fetch('/api/ssc-book-checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId:   student.contactId,
          studentName: student.studentName,
          parentName:  student.parentName,
          parentEmail: airtableProfile?.parentEmail || student.parentEmail,
          ...calForm,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const parts: string[] = [];
        if (data.results.studentCheckinsBooked) parts.push(`${data.results.studentCheckinsBooked} student check-ins`);
        if (data.results.parentCheckinsBooked) parts.push(`${data.results.parentCheckinsBooked} parent check-ins`);
        if (data.results.postSession1 === 'booked') parts.push('post-session 1');
        if (data.results.postSession3 === 'booked') parts.push('post-session 3');
        const warn = data.results.parentContactWarning ? ` ⚠ ${data.results.parentContactWarning}` : '';
        setCalBookResult({ ok: true, message: `Booked: ${parts.join(', ')}${warn}` });
      } else {
        setCalBookResult({ ok: false, message: data.error ?? 'Failed to book' });
      }
    } catch (e: unknown) {
      setCalBookResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setCalBooking(false);
    }
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
  const baseReminders = scheduleSet ? calcCheckInReminders(student) : [];

  // Override reminder "done" status based on actual Airtable check-in records
  const completedTypes = new Set(checkins.map(c => c.checkInType));
  const reminders = baseReminders.map(r => {
    if (r.status === 'done') return r;
    if (r.type === 'Post-Session 1' && completedTypes.has('Post-Session 1')) return { ...r, status: 'done' as const };
    if (r.type === 'Post-Session 3' && completedTypes.has('Post-Session 3')) return { ...r, status: 'done' as const };
    return r;
  });

  // Session calendar (next 10 projected)
  const projectedSessions = scheduleSet && student.startDate
    ? generateSessionDates(student.startDate, schedDays.length ? schedDays : parseSchedule(student.availability, student.sessionsPerWeek).sessionDays, 10)
    : [];

  // ── SSC Journey computed values ───────────────────────────────────────────
  const isLowHours = student.hoursRemaining > 0 && student.hoursRemaining <= 5;
  const isVeryLowHours = student.hoursRemaining > 0 && student.hoursRemaining <= 2;

  const STAGE_LABELS: Record<string, string> = {
    '79095236-7c28-4684-b7ce-29d03e2d1c86': 'New Enrollment',
    'eb217c7e-1f20-4a6d-aeec-f5123fe625db': 'Form Completed',
    'f145c10b-bd9f-4794-ab8b-1d3cdc6c3707': 'Diagnostic Done',
    'e3af64f6-0af3-487f-aa5c-f8b05f3a84a3': 'Onboarding Call Done',
    '34126179-af56-4feb-969d-aec6dd9b6547': 'Session 1 Done',
    '22ddfa4c-a618-467f-b894-980d2d2ef4af': 'Session 3 Done',
    '99803c34-071c-476c-a513-e3789816bf85': 'Active',
    '3294f8d5-ff1c-4368-b0a0-17c3bf0cccc5': 'Phase 1 Done',
    '0f27807f-987a-44a4-9e3e-6399c4f73ff4': 'Phase 2 Done',
    'd3e839e1-1128-4308-9d51-93b8f2b7dd0d': 'Phase 3 Done',
    'd4454fd6-e20f-476d-896b-d4ad2c55c021': 'Phase 4 Done',
    '54e8aab9-ddd4-40d9-ab0a-95a7fb753c23': 'Low Hours',
    'b3731eaf-3b6f-4db2-9369-d0665f7f6e03': 'SAT Day Done',
    'eefacac9-3cbd-46ba-a711-ac24bc00a16c': 'Results Done',
  };
  void STAGE_LABELS; // used as reference data

  interface NextAction {
    urgency: 'critical' | 'high' | 'normal';
    action: string;
    detail: string;
    callTypeId?: string;
  }

  function getNextAction(stageId: string, hoursRemaining: number): NextAction {
    if (hoursRemaining > 0 && hoursRemaining <= 5) {
      return { urgency: 'critical', action: 'Renewal Conversation', detail: `${Math.round(hoursRemaining)}h remaining — reach out before sessions run out`, callTypeId: 'renewal' };
    }
    const map: Record<string, NextAction> = {
      '79095236-7c28-4684-b7ce-29d03e2d1c86': { urgency: 'high', action: 'Send Onboarding Form', detail: 'Student just enrolled — send the onboarding form link to the parent today' },
      'eb217c7e-1f20-4a6d-aeec-f5123fe625db': { urgency: 'high', action: 'Schedule Diagnostic', detail: 'Form received — book the diagnostic session and confirm tutor assignment' },
      'f145c10b-bd9f-4794-ab8b-1d3cdc6c3707': { urgency: 'high', action: 'Book Onboarding Call', detail: 'Diagnostic complete — schedule and run the onboarding call within 48h', callTypeId: 'onboarding' },
      'e3af64f6-0af3-487f-aa5c-f8b05f3a84a3': { urgency: 'normal', action: 'Confirm First Session', detail: 'Onboarding done — confirm first session date/time with student and tutor' },
      '34126179-af56-4feb-969d-aec6dd9b6547': { urgency: 'high', action: 'Run Post-Session 1 Check-in', detail: 'First session happened — check in within 24h to capture first impressions', callTypeId: 'post-session-1' },
      '22ddfa4c-a618-467f-b894-980d2d2ef4af': { urgency: 'normal', action: 'Run Post-Session 3 Check-in', detail: 'Three sessions done — run momentum check and confirm weekly cadence', callTypeId: 'weekly-student' },
      '99803c34-071c-476c-a513-e3789816bf85': { urgency: 'normal', action: 'Weekly Check-ins On Schedule', detail: 'Student is active — maintain weekly student + parent check-in cadence', callTypeId: 'weekly-student' },
      '3294f8d5-ff1c-4368-b0a0-17c3bf0cccc5': { urgency: 'high', action: 'Phase 1 Check-in Call', detail: 'Phase 1 complete — review practice test score, trajectory, and next phase plan', callTypeId: 'phase-checkin' },
      '0f27807f-987a-44a4-9e3e-6399c4f73ff4': { urgency: 'high', action: 'Phase 2 Check-in Call', detail: 'Phase 2 complete — score progression review and mid-program alignment', callTypeId: 'phase-checkin' },
      'd3e839e1-1128-4308-9d51-93b8f2b7dd0d': { urgency: 'high', action: 'Phase 3 Check-in Call', detail: 'Phase 3 complete — assess test readiness and final phase planning', callTypeId: 'phase-checkin' },
      'd4454fd6-e20f-476d-896b-d4ad2c55c021': { urgency: 'high', action: 'Phase 4 Check-in Call', detail: 'Phase 4 complete — final score review, next steps, renewal or completion', callTypeId: 'phase-checkin' },
      '54e8aab9-ddd4-40d9-ab0a-95a7fb753c23': { urgency: 'critical', action: 'Renewal Conversation', detail: 'Student is Low Hours — initiate renewal conversation immediately', callTypeId: 'renewal' },
      'b3731eaf-3b6f-4db2-9369-d0665f7f6e03': { urgency: 'high', action: 'Post-SAT Day Check-in', detail: 'SAT just happened — check in today to get a sense of how it went', callTypeId: 'sat-day' },
      'eefacac9-3cbd-46ba-a711-ac24bc00a16c': { urgency: 'high', action: 'SAT Results Check-in', detail: 'Results received — review score, celebrate or create a retake plan', callTypeId: 'sat-day' },
    };
    return map[stageId] ?? { urgency: 'normal', action: 'Maintain Weekly Cadence', detail: 'Continue regular check-ins and monitor session attendance' };
  }

  const nextAction = getNextAction(student.stageId, student.hoursRemaining);

  // Score history from check-ins
  const scoreHistory = checkins
    .filter(c => c.officialSatScore)
    .map(c => ({ date: c.checkInDate, score: c.officialSatScore, type: c.checkInType }));

  // Onboarding stage check
  const isOnboarding = ['79095236-7c28-4684-b7ce-29d03e2d1c86', 'eb217c7e-1f20-4a6d-aeec-f5123fe625db', 'f145c10b-bd9f-4794-ab8b-1d3cdc6c3707', 'e3af64f6-0af3-487f-aa5c-f8b05f3a84a3'].includes(student.stageId);

  const ONBOARD_CHECKLIST = [
    { key: 'welcome_sent',       label: 'Welcome message sent to parent' },
    { key: 'form_sent',          label: 'Onboarding form link sent' },
    { key: 'diagnostic_booked',  label: 'Diagnostic scheduled' },
    { key: 'tutor_assigned',     label: 'Tutor assigned' },
    { key: 'first_session_set',  label: 'First session confirmed' },
    { key: 'onboarding_call',    label: 'Onboarding call completed' },
    { key: 'checkin_time_set',   label: 'Weekly check-in time locked in' },
  ];

  const parentUpdateDaysAgo = parentUpdateDone
    ? Math.round((Date.now() - new Date(parentUpdateDone).getTime()) / 86400000)
    : null;
  const parentUpdateOverdue = parentUpdateDaysAgo === null || parentUpdateDaysAgo > 7;

  // Last check-in (checkins sorted descending)
  const lastCheckinDate = checkins.length > 0 ? checkins[0].checkInDate : null;
  const lastCheckinDaysAgo = lastCheckinDate
    ? Math.round((Date.now() - new Date(lastCheckinDate + 'T12:00:00').getTime()) / 86400000)
    : null;
  const lastCheckinOverdue = lastCheckinDaysAgo === null || lastCheckinDaysAgo > 7;

  // SAT test date from Airtable
  const satTestDateDisplay = (() => {
    const raw = airtableProfile?.satTestDate;
    if (!raw) return '';
    const d = new Date(raw + 'T12:00:00');
    return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  })();

  async function sendBroadcast() {
    if (!broadcastMsg.trim()) return;
    setBroadcastSending(true);
    setBroadcastResult(null);
    try {
      const res = await fetch('/api/broadcast-tutors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: broadcastMsg }),
      });
      const data = await res.json();
      if (res.ok) {
        setBroadcastResult(data);
      } else {
        addToast(data.error ?? 'Broadcast failed', false);
        setBroadcastOpen(false);
      }
    } catch {
      addToast('Broadcast failed', false);
      setBroadcastOpen(false);
    } finally {
      setBroadcastSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Broadcast modal */}
      {broadcastOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="px-6 pt-5 pb-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Broadcast to Tutors</h2>
              <p className="text-xs text-gray-500 mt-0.5">Sends an SMS to all active tutors tagged in GHL.</p>
            </div>
            <div className="px-6 py-4 space-y-3">
              <textarea
                value={broadcastMsg}
                onChange={e => setBroadcastMsg(e.target.value)}
                rows={9}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1e2090] resize-none font-mono"
                disabled={broadcastSending || !!broadcastResult}
              />
              {broadcastResult && (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm">
                  <p className="font-semibold text-green-800">Broadcast sent!</p>
                  <p className="text-green-700 text-xs mt-0.5">
                    {broadcastResult.sent} sent · {broadcastResult.failed} failed · {broadcastResult.total} tutors with phone numbers
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 pb-5 flex items-center justify-end gap-3">
              <button
                onClick={() => { setBroadcastOpen(false); setBroadcastResult(null); }}
                className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition"
              >
                {broadcastResult ? 'Close' : 'Cancel'}
              </button>
              {!broadcastResult && (
                <button
                  onClick={sendBroadcast}
                  disabled={broadcastSending || !broadcastMsg.trim()}
                  className="bg-[#1e2090] hover:bg-[#171a7a] disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition"
                >
                  {broadcastSending ? 'Sending...' : `Send to all tutors`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
              {student.parentName && <span>Parent: {student.parentName}{student.parent2Name ? ` & ${student.parent2Name}` : ''}</span>}
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
              {lastCheckinDaysAgo !== null && (
                <>
                  <span className="opacity-60">·</span>
                  <span className={`text-xs font-medium ${lastCheckinOverdue ? 'text-red-300' : 'text-green-300'}`}>
                    Last check-in: {lastCheckinDaysAgo === 0 ? 'today' : `${lastCheckinDaysAgo}d ago`}
                  </span>
                </>
              )}
              {lastCheckinDate === null && checkins.length === 0 && student.stageId !== '79095236-7c28-4684-b7ce-29d03e2d1c86' && (
                <>
                  <span className="opacity-60">·</span>
                  <span className="text-xs text-orange-300 font-medium">No check-ins logged</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isAdmin && (
              <button
                onClick={() => {
                  const availability = student.availability || 'Not set';
                  const hours = student.hoursPurchased > 0 ? `${student.hoursPurchased}h` : 'TBD';
                  const scores = student.currentScore && student.targetScore
                    ? `${student.currentScore} → ${student.targetScore} (SAT)`
                    : student.targetScore
                    ? `Target: ${student.targetScore} (SAT)`
                    : 'Scores: TBD';
                  setBroadcastMsg(
                    `Hi [Tutor Name], we have a new student who needs an SAT tutor. Here are the details:\n\nStudent: ${student.studentName}\nAvailability: ${availability}\nProgram: ${hours} total\n${scores}\n\nReply YES if you're able to take them on and we'll follow up with more details.`
                  );
                  setBroadcastResult(null);
                  setBroadcastOpen(true);
                }}
                className="bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-lg border border-white/20 transition"
              >
                Broadcast to Tutors
              </button>
            )}
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
        <div className="mt-5 pb-1">
          {/* Top row: label + percentage (always visible) */}
          <div className="flex items-baseline justify-between text-xs mb-3">
            <span className="text-blue-200 font-medium flex items-center gap-2 flex-wrap">
              Program Progress
              {hasProgress && (
                <span className="text-white font-bold">{Math.round(student.hoursCompleted)}/{student.hoursPurchased}h</span>
              )}
              {effectiveSessionsCompleted > 0 && totalSessions > 0 && (
                <span className="text-blue-300 font-normal">· {effectiveSessionsCompleted}/{totalSessions} sessions{!sessionsSavedToGHL && autoCalcSessions !== null ? ' (calc)' : ''}</span>
              )}
              <button
                onClick={() => {
                  setEditSessions(effectiveSessionsCompleted.toString());
                  setEditHours(student.hoursCompleted.toString());
                  setEditHoursPurchased(student.hoursPurchased > 0 ? student.hoursPurchased.toString() : '');
                  setProgressOpen(o => !o);
                }}
                className="text-blue-300 hover:text-white text-[10px] font-semibold underline underline-offset-2 transition"
              >
                {progressOpen ? 'Cancel' : 'Edit'}
              </button>
            </span>
            {hasProgress && (
              <span className={`font-bold tabular-nums ${isLow ? 'text-red-300' : 'text-blue-200'}`}>{pct}%</span>
            )}
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
                <label className="text-[10px] text-blue-300 font-semibold uppercase tracking-wide">Hrs purchased</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={editHoursPurchased}
                  onChange={e => setEditHoursPurchased(e.target.value)}
                  placeholder={student.hoursPurchased > 0 ? student.hoursPurchased.toString() : '0'}
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
                  className="w-16 bg-[#1a1a7a] border border-blue-400 rounded-lg px-2 py-1 text-white text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-300"
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

          {!hasProgress && !progressOpen && (
            <p className="text-[10px] text-blue-400 mb-3">No hours in GHL yet — use Edit to set sessions and hours used.</p>
          )}

          {hasProgress && (<>
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
          </>)}
        </div>
      </div>

      {/* ── Program Panel ── */}
      <div className="bg-white border-b border-gray-100">

        {/* Low Hours Banner */}
        {isLowHours && (
          <div className={`mx-0 rounded-none border-x-0 border-t-0 border-b px-5 py-4 flex items-center justify-between gap-4 ${isVeryLowHours ? 'bg-red-50 border-red-300' : 'bg-orange-50 border-orange-200'}`}>
            <div>
              <p className={`text-sm font-bold ${isVeryLowHours ? 'text-red-700' : 'text-orange-700'}`}>
                ⚠️ {Math.round(student.hoursRemaining)}h remaining — Renewal needed
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Initiate the renewal conversation before sessions run out</p>
            </div>
            <button
              onClick={() => goToScript('renewal')}
              className="shrink-0 text-xs px-3 py-2 rounded-xl bg-orange-600 text-white font-semibold hover:bg-orange-700 transition"
            >
              Renewal Script →
            </button>
          </div>
        )}

        {/* Next Action Card */}
        <div className={`mx-5 mt-4 mb-2 rounded-2xl border px-5 py-4 ${
          nextAction.urgency === 'critical' ? 'bg-red-50 border-red-200' :
          nextAction.urgency === 'high'     ? 'bg-amber-50 border-amber-200' :
                                              'bg-blue-50 border-blue-100'
        }`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Next Action</p>
              <p className={`text-sm font-bold ${
                nextAction.urgency === 'critical' ? 'text-red-700' :
                nextAction.urgency === 'high'     ? 'text-amber-700' : 'text-[#1e2090]'
              }`}>{nextAction.action}</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-snug">{nextAction.detail}</p>
            </div>
            {nextAction.callTypeId && (
              <button
                onClick={() => goToScript(nextAction.callTypeId!)}
                className="shrink-0 text-xs px-3 py-2 rounded-xl bg-[#1e2090] text-white font-semibold hover:bg-[#171a7a] transition"
              >
                Go to script →
              </button>
            )}
          </div>
        </div>

        {/* Contact Info Card */}
        {(() => {
          // Resolve phone/email: GHL first, fall back to Airtable Handoff table
          const resolvedStudentPhone = student.studentPhone || airtableProfile?.studentPhone || '';
          const resolvedParentPhone  = student.parentPhone  || airtableProfile?.parentPhone  || '';
          const resolvedStudentEmail = student.studentEmail || airtableProfile?.studentEmail || '';
          const resolvedParentEmail  = student.parentEmail  || airtableProfile?.parentEmail  || '';
          const tutorDisplay         = student.tutorAssigned || airtableProfile?.tutorName || '';
          const hasAnyContact = resolvedStudentPhone || resolvedParentPhone || resolvedStudentEmail || resolvedParentEmail;
          return (
            <div className="mx-5 my-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Student Profile</span>
              </div>
              <div className="px-5 py-3 grid grid-cols-2 gap-x-6 gap-y-2.5">
                {/* Tutor */}
                {tutorDisplay && (
                  <div className="col-span-2">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Assigned Tutor</p>
                    <p className="text-sm font-semibold text-gray-800">{tutorDisplay}</p>
                  </div>
                )}
                {/* Package & Guarantee */}
                {student.hoursPurchased > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Package</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {student.hoursPurchased}h
                      {student.hasGuarantee && student.hasGuarantee.toLowerCase().includes('yes') && (
                        <span className="ml-1.5 text-[10px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded-full">Guarantee</span>
                      )}
                    </p>
                  </div>
                )}
                {/* Session frequency */}
                {(student.sessionsPerWeek || airtableProfile?.sessionFrequency) && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Frequency</p>
                    <p className="text-sm text-gray-700">{airtableProfile?.sessionFrequency || `${student.sessionsPerWeek}x/wk`}</p>
                  </div>
                )}
                {/* SAT Test Date */}
                {satTestDateDisplay && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">SAT Test Date</p>
                    <p className="text-sm font-semibold text-gray-800">{satTestDateDisplay}</p>
                  </div>
                )}
                {/* Scores */}
                {(airtableProfile?.priorSatScore || student.currentScore) && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Scores</p>
                    <p className="text-sm text-gray-700">
                      {airtableProfile?.priorSatScore || student.currentScore}
                      {(airtableProfile?.targetScore || student.targetScore) && (
                        <span className="text-gray-400"> → {airtableProfile?.targetScore || student.targetScore}</span>
                      )}
                    </p>
                  </div>
                )}
                {/* Phones */}
                {resolvedStudentPhone && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Student Phone</p>
                    <a href={`tel:${resolvedStudentPhone}`} className="text-sm font-semibold text-[#1e2090] hover:underline">{resolvedStudentPhone}</a>
                  </div>
                )}
                {resolvedParentPhone && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Parent Phone</p>
                    <a href={`tel:${resolvedParentPhone}`} className="text-sm font-semibold text-[#1e2090] hover:underline">{resolvedParentPhone}</a>
                  </div>
                )}
                {resolvedStudentEmail && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Student Email</p>
                    <a href={`mailto:${resolvedStudentEmail}`} className="text-sm text-gray-700 hover:underline truncate block">{resolvedStudentEmail}</a>
                  </div>
                )}
                {resolvedParentEmail && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Parent Email</p>
                    <a href={`mailto:${resolvedParentEmail}`} className="text-sm text-gray-700 hover:underline truncate block">{resolvedParentEmail}</a>
                  </div>
                )}
                {/* Parent 2 */}
                {student.parent2Name && (
                  <div className="col-span-2 border-t border-gray-100 pt-2 mt-0.5">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Second Parent</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Name</p>
                        <p className="text-sm font-semibold text-gray-800">{student.parent2Name}</p>
                      </div>
                      {student.parent2Phone && (
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Phone</p>
                          <a href={`tel:${student.parent2Phone}`} className="text-sm font-semibold text-[#1e2090] hover:underline">{student.parent2Phone}</a>
                        </div>
                      )}
                      {student.parent2Email && (
                        <div className="col-span-2">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Email</p>
                          <a href={`mailto:${student.parent2Email}`} className="text-sm text-gray-700 hover:underline truncate block">{student.parent2Email}</a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* Parent best time */}
                {airtableProfile?.parentBestTime && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Parent Best Time</p>
                    <p className="text-sm text-gray-700">{airtableProfile.parentBestTime}</p>
                  </div>
                )}
                {/* Weekly check-in time */}
                {student.weeklyCheckinTime && (
                  <div className={resolvedParentPhone ? '' : 'col-span-2'}>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Weekly Check-in Time</p>
                    <p className="text-sm text-gray-700">{student.weeklyCheckinTime}</p>
                  </div>
                )}
                {/* Fallback if nothing to show */}
                {!hasAnyContact && !tutorDisplay && !satTestDateDisplay && (
                  <p className="col-span-2 text-xs text-gray-400 italic py-1">No contact info on file yet — syncs from Airtable after enrollment form</p>
                )}
              </div>
            </div>
          );
        })()}

        {/* Parent & Student Context Card */}
        {airtableProfile && (airtableProfile.parentConcerns || airtableProfile.whyStudyCore || airtableProfile.anythingElseAboutStudent || airtableProfile.whatDidntWorkBefore || airtableProfile.studentDoubts || airtableProfile.targetSchools) && (
          <div className="mx-5 my-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Parent & Student Context</span>
            </div>
            <div className="px-5 py-3 space-y-3">
              {airtableProfile.parentConcerns && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Parent Concerns</p>
                  <p className="text-xs text-gray-700 leading-relaxed bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{airtableProfile.parentConcerns}</p>
                </div>
              )}
              {airtableProfile.whyStudyCore && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Why StudyCore</p>
                  <p className="text-xs text-gray-700 leading-relaxed">{airtableProfile.whyStudyCore}</p>
                </div>
              )}
              {airtableProfile.anythingElseAboutStudent && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">About the Student</p>
                  <p className="text-xs text-gray-700 leading-relaxed">{airtableProfile.anythingElseAboutStudent}</p>
                </div>
              )}
              {airtableProfile.whatDidntWorkBefore && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">What Didn't Work Before</p>
                  <p className="text-xs text-gray-700 leading-relaxed">{airtableProfile.whatDidntWorkBefore}</p>
                </div>
              )}
              {airtableProfile.studentDoubts && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Student Doubts / Concerns</p>
                  <p className="text-xs text-gray-700 leading-relaxed">{airtableProfile.studentDoubts}</p>
                </div>
              )}
              {airtableProfile.targetSchools && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Target Schools</p>
                  <p className="text-xs text-gray-700">{airtableProfile.targetSchools}</p>
                </div>
              )}
              {(airtableProfile.parentWhosDriving || airtableProfile.whosDriving) && (
                <div className="flex gap-4">
                  {airtableProfile.parentWhosDriving && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Who's Driving</p>
                      <p className="text-xs text-gray-700">{airtableProfile.parentWhosDriving}</p>
                    </div>
                  )}
                  {airtableProfile.checkinContactMethod && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Preferred Check-in</p>
                      <p className="text-xs text-gray-700">{airtableProfile.checkinContactMethod}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Open Tutor Flags Card */}
        {openFlags.length > 0 && (
          <div className="mx-5 my-2 bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-red-50 flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">Open Tutor Flags</span>
              <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{openFlags.length}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {openFlags.map(flag => (
                <div key={flag.id} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      flag.flagLevel?.toLowerCase().includes('red')    ? 'bg-red-100 text-red-700' :
                      flag.flagLevel?.toLowerCase().includes('yellow') ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {flag.flagLevel || 'Flag'}
                    </span>
                    <span className="text-[10px] text-gray-400">{flag.sessionDate}</span>
                  </div>
                  {flag.tutorName && <p className="text-[10px] text-gray-500 font-medium mb-0.5">Tutor: {flag.tutorName}</p>}
                  {flag.notes && <p className="text-xs text-gray-700 leading-relaxed">{flag.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Onboarding Prep Card Button */}
        {isOnboarding && (
          <div className="mx-5 my-3">
            <button
              onClick={() => setShowPrepCard(true)}
              className="w-full bg-[#1e2090] text-white rounded-2xl px-5 py-3.5 font-semibold text-sm hover:bg-[#161870] transition flex items-center justify-center gap-2"
            >
              <span>📋</span>
              <span>Open Onboarding Prep Card</span>
            </button>
          </div>
        )}

        {/* Onboarding Checklist Card */}
        {isOnboarding && (
          <div className="mx-5 my-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Onboarding Checklist</span>
              <span className="text-xs text-gray-400">{ONBOARD_CHECKLIST.filter(i => onboardChecklist[i.key]).length}/{ONBOARD_CHECKLIST.length}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {ONBOARD_CHECKLIST.map(item => (
                <label key={item.key} className="flex items-center gap-3 px-5 py-2.5 cursor-pointer hover:bg-gray-50 transition">
                  <input
                    type="checkbox"
                    checked={!!onboardChecklist[item.key]}
                    onChange={() => toggleChecklist(item.key)}
                    className="w-4 h-4 rounded accent-[#1e2090]"
                  />
                  <span className={`text-sm ${onboardChecklist[item.key] ? 'line-through text-gray-300' : 'text-gray-700'}`}>
                    {item.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

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
                <div key={i}>
                  {/* Reminder row */}
                  <div className={`flex items-center justify-between gap-3 px-5 py-3 ${reminderBg(r.status)}`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span>{reminderIcon(r.status)}</span>
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-gray-800">{r.type}</span>
                        <span className={`ml-2 text-xs ${r.status === 'overdue' ? 'text-red-600 font-medium' : r.status === 'done' ? 'text-gray-400' : 'text-gray-500'}`}>
                          {reminderLabel(r)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Log form link — always visible */}
                      <a
                        href="https://tally.so/r/BzvYE1"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2.5 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:border-[#1e2090] hover:text-[#1e2090] transition font-medium"
                      >
                        Log ↗
                      </a>
                      {/* Script link */}
                      {r.status !== 'done' && (
                        <button
                          onClick={() => goToScript(r.callTypeId)}
                          className="text-xs px-2.5 py-1.5 rounded-full bg-[#e8e9f8] text-[#1e2090] hover:bg-[#1e2090] hover:text-white transition font-semibold"
                        >
                          Script →
                        </button>
                      )}
                      {/* Book button */}
                      <button
                        onClick={() => openBooking(i, r)}
                        className={`text-xs px-2.5 py-1.5 rounded-full font-semibold transition ${
                          bookingIdx === i
                            ? 'bg-[#1e2090] text-white'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200'
                        }`}
                      >
                        {bookingIdx === i ? 'Cancel' : '📅 Book'}
                      </button>
                    </div>
                  </div>

                  {/* Inline booking panel */}
                  {bookingIdx === i && (
                    <div className="bg-blue-50 border-t border-blue-100 px-5 py-4">
                      <p className="text-xs font-semibold text-[#1e2090] mb-3">
                        Book: {r.type} — {student.studentName}
                      </p>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="text-xs text-gray-500 font-medium block mb-1">Date</label>
                          <input
                            type="date"
                            value={bookDate}
                            onChange={e => setBookDate(e.target.value)}
                            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1e2090]"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 font-medium block mb-1">Time</label>
                          <input
                            type="time"
                            value={bookTime}
                            onChange={e => setBookTime(e.target.value)}
                            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1e2090]"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 font-medium block mb-1">Duration</label>
                          <select
                            value={bookDuration}
                            onChange={e => setBookDuration(parseInt(e.target.value))}
                            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1e2090]"
                          >
                            <option value={15}>15 min</option>
                            <option value={30}>30 min</option>
                            <option value={45}>45 min</option>
                            <option value={60}>60 min</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 font-medium block mb-1">Calendar</label>
                          {ghlCalendars.length === 0 ? (
                            <p className="text-xs text-gray-400 italic py-1.5">Loading…</p>
                          ) : (
                            <select
                              value={bookCalendarId}
                              onChange={e => setBookCalendarId(e.target.value)}
                              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1e2090]"
                            >
                              {ghlCalendars.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => confirmBooking(r)}
                        disabled={bookingSaving || !bookDate || !bookTime || !bookCalendarId}
                        className="text-xs px-4 py-2 rounded-xl bg-[#1e2090] text-white font-semibold hover:bg-[#171a7a] transition disabled:opacity-40"
                      >
                        {bookingSaving ? 'Booking…' : 'Confirm Booking'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Parent Update Tracker */}
        <div className={`mx-5 my-2 bg-white rounded-2xl shadow-sm border overflow-hidden ${parentUpdateOverdue ? 'border-amber-200' : 'border-gray-100'}`}>
          <div className="px-5 py-3 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Weekly Parent Update</span>
              {parentUpdateDone ? (
                <p className={`text-xs mt-0.5 ${parentUpdateOverdue ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                  {parentUpdateOverdue ? `Overdue — last sent ${parentUpdateDaysAgo}d ago` : `Sent ${parentUpdateDaysAgo}d ago ✓`}
                </p>
              ) : (
                <p className="text-xs text-amber-600 font-medium mt-0.5">Not yet sent this week</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => goToScript('parent-update')}
                className="text-xs px-2.5 py-1.5 rounded-full bg-[#e8e9f8] text-[#1e2090] hover:bg-[#1e2090] hover:text-white transition font-semibold"
              >
                Script →
              </button>
              <button
                onClick={markParentUpdate}
                className="text-xs px-2.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-600 hover:text-white transition font-semibold"
              >
                ✓ Done
              </button>
            </div>
          </div>
        </div>

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

        {/* Hours Tracking Card */}
        {student.hoursPurchased > 0 && (totalHoursUsed > 0 || sessions.length > 0) && (() => {
          const heldCount = sessions.filter((s: any) => s.sessionStatus === 'Held').length;
          const hoursUsed = totalHoursUsed;
          const hoursRemaining = Math.max(0, student.hoursPurchased - hoursUsed);
          const pctUsed = Math.min(100, Math.round((hoursUsed / student.hoursPurchased) * 100));
          const isLowRem = hoursRemaining <= 5;
          return (
            <div className="mx-5 my-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Hours Tracking</span>
              </div>
              <div className="px-5 py-4">
                <div className="flex items-baseline justify-between mb-2">
                  <span className={`text-sm font-bold ${isLowRem ? 'text-red-600' : 'text-gray-900'}`}>
                    {hoursUsed.toFixed(1)}h used of {student.hoursPurchased}h purchased
                  </span>
                  <span className={`text-sm font-bold ${isLowRem ? 'text-red-600' : 'text-gray-500'}`}>
                    {hoursRemaining.toFixed(1)}h remaining
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all ${isLowRem ? 'bg-red-400' : pctUsed >= 75 ? 'bg-orange-400' : 'bg-emerald-400'}`}
                    style={{ width: `${pctUsed}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400">Based on {heldCount} logged session{heldCount !== 1 ? 's' : ''}</p>
                {isLowRem && (
                  <p className="text-xs font-semibold text-red-600 mt-1">⚠️ Low hours — initiate renewal conversation</p>
                )}
              </div>
            </div>
          );
        })()}

        {/* Session Feed Card */}
        {sessions.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mx-0">
            <button
              onClick={() => setSessionsOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">📝</span>
                <span className="text-sm font-semibold text-gray-900">Session History</span>
                <span className="text-xs text-gray-400">({sessions.length})</span>
              </div>
              <span className="text-gray-400 text-xs">{sessionsOpen ? 'Hide ▲' : 'Show ▼'}</span>
            </button>
            {sessionsOpen && (
              <div className="border-t border-gray-50 divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
                {sessions.map((s: any, i: number) => {
                  const statusBadge =
                    s.sessionStatus === 'Held'         ? 'bg-emerald-100 text-emerald-700' :
                    s.sessionStatus === 'Rescheduled'  ? 'bg-yellow-100 text-yellow-700' :
                    s.sessionStatus === 'No-Show'      ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-500';

                  const onTrackIcon =
                    s.onTrack === 'Yes' || s.onTrack === 'On Track'   ? '🟢' :
                    s.onTrack === 'No'  || s.onTrack === 'Off Track'  ? '🔴' :
                    s.onTrack ? '🟡' : '';

                  const hasNotesSsc = s.notesSsc && s.notesSsc !== 'N/A' && s.notesSsc !== 'None' && s.notesSsc.trim() !== '';
                  const hasFathom   = s.fathomLink && s.fathomLink !== 'N/A' && s.fathomLink.trim() !== '';

                  const fmtSessionDate = (dateStr: string) => {
                    if (!dateStr) return '';
                    const d = new Date(dateStr + 'T12:00:00');
                    return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
                  };

                  return (
                    <SessionRow key={s.id ?? i} s={s} statusBadge={statusBadge} onTrackIcon={onTrackIcon} hasNotesSsc={hasNotesSsc} hasFathom={hasFathom} fmtDate={fmtSessionDate} />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Score History Card */}
        {scoreHistory.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Score History</span>
            </div>
            <div className="px-5 py-3 flex flex-wrap gap-3">
              {scoreHistory.map((s, i) => (
                <div key={i} className="flex flex-col items-center bg-gray-50 rounded-xl px-4 py-2 min-w-[80px]">
                  <span className="text-lg font-bold text-[#1e2090]">{s.score}</span>
                  <span className="text-[10px] text-gray-400">{s.date}</span>
                  <span className="text-[10px] text-gray-500">{s.type}</span>
                </div>
              ))}
              {student.targetScore && (
                <div className="flex flex-col items-center bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 min-w-[80px]">
                  <span className="text-lg font-bold text-blue-600">{student.targetScore}</span>
                  <span className="text-[10px] text-blue-400">Target</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Check-In History Card */}
        {checkins.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => setCheckinsOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">📋</span>
                <span className="text-sm font-semibold text-gray-900">Check-In History</span>
                <span className="text-xs text-gray-400 font-medium">({checkins.length})</span>
              </div>
              <span className="text-gray-400 text-xs font-medium">{checkinsOpen ? 'Hide ▲' : 'Show ▼'}</span>
            </button>
            {checkinsOpen && (
              <div className="border-t border-gray-50 divide-y divide-gray-50">
                {checkins.map(c => {
                  const statusColor = c.overallStatus.toLowerCase().includes('red') ? 'text-red-600'
                    : c.overallStatus.toLowerCase().includes('yellow') ? 'text-yellow-600'
                    : 'text-emerald-600';
                  const statusIcon = c.overallStatus.toLowerCase().includes('red') ? '🔴'
                    : c.overallStatus.toLowerCase().includes('yellow') ? '🟡'
                    : '🟢';
                  return (
                    <div key={c.id} className="px-5 py-3.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-700">{c.checkInType}</span>
                          {c.overallStatus && (
                            <span className={`text-xs font-medium ${statusColor}`}>{statusIcon} {c.overallStatus}</span>
                          )}
                          {c.founderAttention && (
                            <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-0.5 font-semibold">⚠️ Founder</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {c.fathomLink && (
                            <a href={c.fathomLink} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-[#1e2090] hover:underline">Fathom ↗</a>
                          )}
                          <span className="text-xs text-gray-400">{c.checkInDate}</span>
                        </div>
                      </div>
                      {c.submittedBy && <p className="text-xs text-gray-400 mb-1">By {c.submittedBy}</p>}
                      {c.summaryNotes && <p className="text-xs text-gray-600 leading-relaxed">{c.summaryNotes}</p>}
                      {c.concerns && (
                        <p className="text-xs text-red-600 mt-1">⚠ {c.concerns}</p>
                      )}
                      {c.firstSessionRating && (
                        <p className="text-xs text-gray-500 mt-1">Session rating: {c.firstSessionRating}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* SSC Notes Card */}
      <div className="bg-white border-b border-gray-100">
        <div className="mx-5 my-3 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">SSC Notes</span>
            <button
              onClick={saveNote}
              disabled={notesSaving}
              className="text-xs px-3 py-1 rounded-full bg-[#1e2090] text-white font-semibold hover:bg-[#171a7a] transition disabled:opacity-40"
            >
              {notesSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
          <div className="px-5 py-3">
            <textarea
              value={sscNotes}
              onChange={e => setSscNotes(e.target.value)}
              placeholder="Running notes on this student — parent dynamics, concerns, personality, things to remember…"
              rows={4}
              className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1e2090] resize-none"
            />
          </div>
        </div>
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

          {/* Log call — inline panel */}
          <div className="px-5 py-4 border-t border-gray-100">
            {!logOpen ? (
              <button
                onClick={() => setLogOpen(true)}
                className="flex items-center justify-center gap-2 w-full bg-[#1e2090] hover:bg-[#171a7a] text-white rounded-xl py-3 text-sm font-bold transition shadow-sm"
              >
                📋 Log this call
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Log Check-in</span>
                  <button onClick={() => setLogOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">✕ Cancel</button>
                </div>

                {/* Status toggle */}
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Overall Status</p>
                  <div className="flex gap-2">
                    {(['Green', 'Yellow', 'Red'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setLogStatus(s)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition border ${
                          logStatus === s
                            ? s === 'Green' ? 'bg-green-500 text-white border-green-500'
                            : s === 'Yellow' ? 'bg-yellow-400 text-white border-yellow-400'
                            : 'bg-red-500 text-white border-red-500'
                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {s === 'Green' ? '🟢' : s === 'Yellow' ? '🟡' : '🔴'} {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Score fields — phase check-in and SAT day */}
                {(activeCallType === 'phase-checkin' || activeCallType === 'sat-day') && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Composite</p>
                      <input
                        type="number"
                        value={logComposite}
                        onChange={e => setLogComposite(e.target.value)}
                        placeholder="1400"
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#1e2090]"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Math</p>
                      <input
                        type="number"
                        value={logMath}
                        onChange={e => setLogMath(e.target.value)}
                        placeholder="720"
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#1e2090]"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">R&W</p>
                      <input
                        type="number"
                        value={logRW}
                        onChange={e => setLogRW(e.target.value)}
                        placeholder="680"
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#1e2090]"
                      />
                    </div>
                  </div>
                )}

                {/* First session rating — post-session-1 */}
                {activeCallType === 'post-session-1' && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">First Session Rating</p>
                    <select
                      value={logFirstRating}
                      onChange={e => setLogFirstRating(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#1e2090] bg-white"
                    >
                      <option value="">Select rating…</option>
                      {['5 — Loved it', '4 — Good', '3 — Okay', '2 — Some concerns', '1 — Poor'].map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Weekly check-in time — onboarding call */}
                {activeCallType === 'onboarding' && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Agreed Weekly Check-in Time</p>
                    <input
                      type="text"
                      value={logWeeklyTime}
                      onChange={e => setLogWeeklyTime(e.target.value)}
                      placeholder="e.g. Sundays at 5:00 PM"
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#1e2090]"
                    />
                  </div>
                )}

                {/* Summary notes */}
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Summary Notes</p>
                  <textarea
                    value={logNotes}
                    onChange={e => setLogNotes(e.target.value)}
                    rows={2}
                    placeholder="Brief summary of the call…"
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#1e2090] resize-none"
                  />
                </div>

                {/* Concerns */}
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Concerns / Red Flags</p>
                  <textarea
                    value={logConcerns}
                    onChange={e => setLogConcerns(e.target.value)}
                    rows={2}
                    placeholder="Any concerns or red flags…"
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#1e2090] resize-none"
                  />
                </div>

                {/* Fathom link */}
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Fathom Link (optional)</p>
                  <input
                    type="url"
                    value={logFathom}
                    onChange={e => setLogFathom(e.target.value)}
                    placeholder="https://fathom.video/…"
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#1e2090]"
                  />
                </div>

                {/* Founder attention */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={logFounder}
                    onChange={e => setLogFounder(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-xs text-gray-600 font-medium">Requires founder attention</span>
                </label>

                {/* Submit */}
                <button
                  onClick={logCheckin}
                  disabled={logSaving}
                  className="w-full bg-[#1e2090] hover:bg-[#171a7a] disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold transition"
                >
                  {logSaving ? 'Logging…' : 'Submit Check-in'}
                </button>

                <p className="text-[10px] text-gray-400 text-center">
                  Logs to Airtable + Slack · or{' '}
                  <a href={callType.tallyUrl} target="_blank" rel="noopener noreferrer" className="underline">use Tally form</a>
                </p>
              </div>
            )}
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

          {/* Scenario toggle buttons */}
          {callType.scenarios && callType.scenarios.length > 0 && (
            <div className="px-6 pb-4">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Situations</div>
              <div className="flex flex-wrap gap-1.5">
                {callType.scenarios.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setActiveScenario(activeScenario === s.id ? null : s.id)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                      activeScenario === s.id
                        ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-amber-400 hover:text-amber-600'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active scenario script panel */}
          {activeScenario && callType.scenarios && (() => {
            const scenario = callType.scenarios.find(s => s.id === activeScenario);
            if (!scenario) return null;
            return (
              <div className="mx-6 mb-4 border border-amber-300 rounded-xl bg-amber-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-amber-100 border-b border-amber-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">{scenario.label}</span>
                    <span className="text-[10px] text-amber-600 bg-amber-200 px-2 py-0.5 rounded-full">Situation Script</span>
                  </div>
                  <button
                    onClick={() => setActiveScenario(null)}
                    className="text-amber-500 hover:text-amber-700 text-sm leading-none"
                  >
                    ✕
                  </button>
                </div>
                <div className="px-4 py-3">
                  <ScriptRenderer template={scenario.script} values={prepCard} />
                </div>
              </div>
            );
          })()}

          <div className="px-6 py-4">
            <ScriptRenderer template={callType.script} values={prepCard} />
          </div>

          {/* Book to Calendar */}
          <div className="mx-6 mb-4">
            <button
              onClick={() => { setCalBookOpen(o => !o); setCalBookResult(null); }}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition"
            >
              <div className="flex items-center gap-2">
                <span>📅</span>
                <span>Book Check-ins to Calendar</span>
              </div>
              <span className="text-gray-400 text-xs">{calBookOpen ? '▲' : '▼'}</span>
            </button>

            {calBookOpen && (
              <div className="mt-2 border border-gray-200 rounded-xl bg-white p-4 space-y-4">
                {(() => {
                  const TZ_OPTIONS = [
                    { label: 'Eastern (ET)',  value: 'America/New_York' },
                    { label: 'Central (CT)', value: 'America/Chicago' },
                    { label: 'Mountain (MT)',value: 'America/Denver' },
                    { label: 'Pacific (PT)', value: 'America/Los_Angeles' },
                    { label: 'Arizona (AZ)', value: 'America/Phoenix' },
                    { label: 'Hawaii (HT)',  value: 'Pacific/Honolulu' },
                  ];
                  const DAY_OPTIONS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

                  const TzSelect = ({ field }: { field: 'studentCheckinTz' | 'parentCheckinTz' | 'postSession1Tz' | 'postSession3Tz' }) => (
                    <select
                      value={calForm[field]}
                      onChange={e => setCalForm(p => ({ ...p, [field]: e.target.value }))}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 bg-white"
                    >
                      {TZ_OPTIONS.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                    </select>
                  );

                  const DaySelect = ({ field }: { field: 'studentCheckinDay' | 'parentCheckinDay' }) => (
                    <select
                      value={calForm[field]}
                      onChange={e => setCalForm(p => ({ ...p, [field]: e.target.value }))}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 bg-white"
                    >
                      <option value="">Day…</option>
                      {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  );

                  return (
                    <>
                      {/* Weekly student check-in */}
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Weekly Student Check-In (recurring × 12 weeks)</div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <DaySelect field="studentCheckinDay" />
                          <input
                            type="time"
                            value={calForm.studentCheckinTime}
                            onChange={e => setCalForm(p => ({ ...p, studentCheckinTime: e.target.value }))}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700"
                          />
                          <TzSelect field="studentCheckinTz" />
                        </div>
                      </div>

                      {/* Weekly parent check-in */}
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Weekly Parent Check-In (recurring × 12 weeks)</div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <DaySelect field="parentCheckinDay" />
                          <input
                            type="time"
                            value={calForm.parentCheckinTime}
                            onChange={e => setCalForm(p => ({ ...p, parentCheckinTime: e.target.value }))}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700"
                          />
                          <TzSelect field="parentCheckinTz" />
                        </div>
                      </div>

                      {/* Post-session 1 */}
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Post-Session 1 Check-In (single)</div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <input
                            type="date"
                            value={calForm.postSession1Date}
                            onChange={e => setCalForm(p => ({ ...p, postSession1Date: e.target.value }))}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700"
                          />
                          <input
                            type="time"
                            value={calForm.postSession1Time}
                            onChange={e => setCalForm(p => ({ ...p, postSession1Time: e.target.value }))}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700"
                          />
                          <TzSelect field="postSession1Tz" />
                        </div>
                      </div>

                      {/* Post-session 3 */}
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Post-Session 3 Check-In (single)</div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <input
                            type="date"
                            value={calForm.postSession3Date}
                            onChange={e => setCalForm(p => ({ ...p, postSession3Date: e.target.value }))}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700"
                          />
                          <input
                            type="time"
                            value={calForm.postSession3Time}
                            onChange={e => setCalForm(p => ({ ...p, postSession3Time: e.target.value }))}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700"
                          />
                          <TzSelect field="postSession3Tz" />
                        </div>
                      </div>

                      {/* Result message */}
                      {calBookResult && (
                        <div className={`text-xs px-3 py-2 rounded-lg ${calBookResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          {calBookResult.message}
                        </div>
                      )}

                      {/* Submit */}
                      <button
                        onClick={bookCalendar}
                        disabled={calBooking}
                        className="w-full py-2.5 rounded-xl bg-[#1e2090] text-white text-sm font-semibold hover:bg-[#151870] disabled:opacity-60 transition"
                      >
                        {calBooking ? 'Booking…' : 'Book All to GHL Calendar'}
                      </button>
                    </>
                  );
                })()}
              </div>
            )}
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

      {showPrepCard && student && (
        <OnboardingPrepCard
          student={student}
          airtableData={airtableProfile ?? undefined}
          onClose={() => setShowPrepCard(false)}
        />
      )}
    </div>
  );
}
