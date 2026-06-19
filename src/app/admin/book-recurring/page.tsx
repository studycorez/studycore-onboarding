'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import {
  format, addDays, startOfWeek, addWeeks, isBefore, isAfter,
} from 'date-fns';
import { DAY_SHORT, formatTimeString } from '@/lib/utils';
import {
  CalendarRange, ChevronLeft, ChevronRight, Zap, CheckCircle,
  Loader2, X, AlertTriangle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface StudentRec {
  id: string; name: string; grade: number | null; target_score: number | null;
  purchased_hours: number | null; used_hours: number | null; status: string;
  timezone: string | null;
}
interface TutorRec { id: string; name: string; subjects: string[]; hourly_rate: number; timezone: string | null; }
interface TutorCardData {
  tutor: TutorRec; overlapSlots: number; activeStudentCount: number; hasSignedContract: boolean;
}
interface StudentAvailSlot { day_of_week: number; start_time: string; end_time: string; }
interface TutorAvailSlot { tutor_id: string; day_of_week: number; start_time: string; end_time: string; }
interface PlacedSession { localId: string; date: string; startTime: string; scheduledAt: string; }
interface TutorBusyBlock { dateStr: string; startMins: number; endMins: number; }
interface BookingResult {
  booked: { id: string; scheduled_at: string }[];
  skipped: { date: string; reason: string }[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TIMEZONES = [
  { label: 'EST', value: 'America/New_York' },
  { label: 'CST', value: 'America/Chicago' },
  { label: 'MST', value: 'America/Denver' },
  { label: 'PST', value: 'America/Los_Angeles' },
  { label: 'GMT', value: 'Europe/London' },
  { label: 'IST', value: 'Asia/Kolkata' },
];

const SLOT_START_HOUR = 7;   // 7 AM
const SLOT_END_HOUR   = 23;  // last slot starts at 22:30, ends at 23:00
const SLOT_COUNT      = (SLOT_END_HOUR - SLOT_START_HOUR) * 2; // 32

// Pre-built list of 30-min time options for per-day pickers
function buildTimeOptions() {
  const opts: { value: string; label: string }[] = [];
  for (let si = 0; si < SLOT_COUNT; si++) {
    const mins = SLOT_START_HOUR * 60 + si * 30;
    const hh   = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm   = String(mins % 60).padStart(2, '0');
    const value = `${hh}:${mm}`;
    const h12   = Math.floor(mins / 60) % 12 || 12;
    const ampm  = mins < 12 * 60 ? 'AM' : 'PM';
    opts.push({ value, label: `${h12}:${mm} ${ampm}` });
  }
  return opts;
}
const TIME_OPTIONS = buildTimeOptions();

// ── Holidays (US approximate) ─────────────────────────────────────────────────
const HOLIDAYS = new Set([
  '2025-01-01','2025-01-20','2025-02-17','2025-05-26','2025-06-19',
  '2025-07-04','2025-09-01','2025-11-27','2025-12-25',
  '2026-01-01','2026-01-19','2026-02-16','2026-05-25','2026-06-19',
  '2026-07-04','2026-09-07','2026-11-26','2026-12-25',
]);

// ── Time helpers ──────────────────────────────────────────────────────────────
function timeStrToMins(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function slotToMins(slot: number) { return SLOT_START_HOUR * 60 + slot * 30; }
function minsToTimeStr(mins: number) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
function slotToTimeStr(slot: number) { return minsToTimeStr(slotToMins(slot)); }

/** Convert UTC ISO → local date string + local startMins in given IANA tz */
function utcToTzInfo(utcIso: string, tz: string): { dateStr: string; startMins: number } {
  const d = new Date(utcIso);
  const dateStr = d.toLocaleDateString('en-CA', { timeZone: tz });                   // YYYY-MM-DD
  const hhmm    = d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }); // HH:MM
  const [h, m]  = hhmm.split(':').map(Number);
  return { dateStr, startMins: h * 60 + m };
}

/** Convert local date+timeStr in given IANA tz → UTC ISO */
function tzToUtcIso(dateStr: string, timeStr: string, tz: string): string {
  const localDt = new Date(`${dateStr}T${timeStr}:00`);
  const tzDt    = new Date(localDt.toLocaleString('en-US', { timeZone: tz }));
  return new Date(localDt.getTime() + (localDt.getTime() - tzDt.getTime())).toISOString();
}

// ── Overlap slot count ────────────────────────────────────────────────────────
function countOverlapSlots(
  studentAvail: StudentAvailSlot[],
  tutorAvail: TutorAvailSlot[],
  tutorId: string,
): number {
  let count = 0;
  const ta = tutorAvail.filter(t => t.tutor_id === tutorId);
  for (const sa of studentAvail) {
    for (const t of ta) {
      if (sa.day_of_week !== t.day_of_week) continue;
      const oStart = Math.max(timeStrToMins(sa.start_time), timeStrToMins(t.start_time));
      const oEnd   = Math.min(timeStrToMins(sa.end_time),   timeStrToMins(t.end_time));
      if (oEnd > oStart) count += Math.floor((oEnd - oStart) / 30);
    }
  }
  return count;
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {(['Student', 'Tutor', 'Schedule', 'Review'] as const).map((label, i) => {
        const s = (i + 1) as 1 | 2 | 3 | 4;
        const done   = step > s;
        const active = step === s;
        return (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
              ${done ? 'bg-green-500 text-white' : active ? 'bg-[#1e2090] text-white' : 'bg-gray-200 text-gray-500'}`}>
              {done ? '✓' : s}
            </div>
            <span className={`text-sm font-medium ${active ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
            {i < 3 && <div className="w-8 h-px bg-gray-200 mx-1" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 2500);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-red-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
      <AlertTriangle className="w-4 h-4" />
      {message}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BookRecurringPage() {
  const supabase = createClient();

  // Step
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1
  const [students, setStudents]         = useState<StudentRec[]>([]);
  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentRec | null>(null);
  const [studentAvail, setStudentAvail] = useState<StudentAvailSlot[]>([]);
  const [selectedTz, setSelectedTz]     = useState('America/New_York');
  const [startDate, setStartDate]       = useState('');
  const [endDate, setEndDate]           = useState('');
  const [duration, setDuration]         = useState<30 | 60 | 90 | 120>(60);

  // Step 2
  const [tutorCards, setTutorCards]       = useState<TutorCardData[]>([]);
  const [tutorCardsLoading, setTutorCardsLoading] = useState(false);
  const [selectedTutor, setSelectedTutor] = useState<TutorRec | null>(null);

  // Step 3
  const [tutorAvail, setTutorAvail]   = useState<TutorAvailSlot[]>([]);
  const [tutorBusy, setTutorBusy]     = useState<TutorBusyBlock[]>([]);
  const [viewWeekStart, setViewWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [placedSessions, setPlacedSessions] = useState<PlacedSession[]>([]);
  const [toast, setToast]             = useState<string | null>(null);
  // Per-day times for auto-fill: maps day_of_week (0=Sun…6=Sat) → 'HH:MM' time string
  const [selectedDays, setSelectedDays] = useState<Record<number, string>>({});

  // Override
  const [overrideAvailability, setOverrideAvailability] = useState(false);

  // Step 4
  const [booking, setBooking]           = useState(false);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [bookingError, setBookingError] = useState('');

  // ── Load active students ───────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('students')
      .select('id,name,grade,target_score,purchased_hours,used_hours,status,timezone')
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => setStudents((data ?? []) as StudentRec[]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── When student selected, load their availability + set timezone ──────────
  useEffect(() => {
    if (!selectedStudent) return;
    setSelectedTz(selectedStudent.timezone ?? 'America/New_York');
    supabase
      .from('student_availability')
      .select('day_of_week,start_time,end_time')
      .eq('student_id', selectedStudent.id)
      .eq('is_active', true)
      .then(({ data }) => setStudentAvail((data ?? []) as StudentAvailSlot[]));
  }, [selectedStudent]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load tutor cards when entering step 2 ─────────────────────────────────
  useEffect(() => {
    if (step !== 2 || !selectedStudent) return;
    setTutorCardsLoading(true);
    Promise.all([
      supabase.from('tutors').select('id,name,subjects,hourly_rate,timezone').is('archived_at', null).order('name'),
      supabase.from('tutor_availability').select('tutor_id,day_of_week,start_time,end_time').eq('is_active', true),
      supabase.from('contracts').select('tutor_id').eq('status', 'signed'),
      supabase.from('contracts').select('tutor_id').eq('student_id', selectedStudent.id).eq('status', 'signed'),
    ]).then(([tutRes, availRes, allContRes, stuContRes]) => {
      const allTutors = (tutRes.data ?? []) as TutorRec[];
      const allTAvail = (availRes.data ?? []) as TutorAvailSlot[];

      const activeCounts: Record<string, number> = {};
      for (const c of allContRes.data ?? []) {
        const tid = (c as any).tutor_id as string;
        activeCounts[tid] = (activeCounts[tid] ?? 0) + 1;
      }
      const signedIds = new Set((stuContRes.data ?? []).map((c: any) => c.tutor_id as string));

      const cards: TutorCardData[] = allTutors.map(t => ({
        tutor: t,
        overlapSlots: countOverlapSlots(studentAvail, allTAvail, t.id),
        activeStudentCount: activeCounts[t.id] ?? 0,
        hasSignedContract: signedIds.has(t.id),
      }));
      cards.sort((a, b) => {
        if (a.hasSignedContract !== b.hasSignedContract) return a.hasSignedContract ? -1 : 1;
        return b.overlapSlots - a.overlapSlots;
      });

      setTutorCards(cards);
      setTutorCardsLoading(false);
    });
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load tutor avail + busy when entering step 3 ──────────────────────────
  useEffect(() => {
    if (step !== 3 || !selectedTutor) return;
    Promise.all([
      supabase
        .from('tutor_availability')
        .select('tutor_id,day_of_week,start_time,end_time')
        .eq('tutor_id', selectedTutor.id)
        .eq('is_active', true),
      supabase
        .from('sessions')
        .select('scheduled_at,duration_minutes')
        .eq('tutor_id', selectedTutor.id)
        .in('status', ['scheduled'])
        .gte('scheduled_at', new Date().toISOString()),
    ]).then(([availRes, sessRes]) => {
      setTutorAvail((availRes.data ?? []) as TutorAvailSlot[]);
      const busy: TutorBusyBlock[] = (sessRes.data ?? []).map((s: any) => {
        const { dateStr, startMins } = utcToTzInfo(s.scheduled_at as string, selectedTz);
        return { dateStr, startMins, endMins: startMins + ((s.duration_minutes as number) ?? 60) };
      });
      setTutorBusy(busy);
    });
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill once tutor availability has loaded (fires after DB fetch resolves)
  useEffect(() => {
    if (step !== 3) return;
    if (tutorAvail.length === 0) return;
    if (Object.keys(selectedDays).length === 0) return;
    if (placedSessions.length > 0) return;
    handleAutoFill();
  }, [tutorAvail]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Slot type ─────────────────────────────────────────────────────────────
  function getSlotType(
    dateStr: string, si: number, dow: number,
  ): 'overlap' | 'student' | 'tutor_busy' | 'placed' | 'empty' {
    const slotStart = slotToMins(si);
    const slotEnd   = slotStart + 30;
    const durSlots  = duration / 30;

    // Placed?
    const isPlaced = placedSessions.some(ps => {
      if (ps.date !== dateStr) return false;
      const psFirst = (timeStrToMins(ps.startTime) - SLOT_START_HOUR * 60) / 30;
      return si >= psFirst && si < psFirst + durSlots;
    });
    if (isPlaced) return 'placed';

    // Tutor busy (existing scheduled session)?
    const busy = tutorBusy.some(b =>
      b.dateStr === dateStr && slotStart < b.endMins && slotEnd > b.startMins,
    );
    if (busy) return 'tutor_busy';

    // Green = tutor available at this slot (studentAvail may be empty in DB;
    // the admin captures the student's schedule via selectedDays in Step 1)
    const tutorOk = tutorAvail.some(ta =>
      ta.day_of_week === dow &&
      slotStart >= timeStrToMins(ta.start_time) &&
      slotEnd   <= timeStrToMins(ta.end_time),
    );

    if (tutorOk) return 'overlap';
    // When override is active, treat all non-busy, non-placed slots as droppable
    if (overrideAvailability) return 'overlap';
    return 'empty';
  }

  // ── Drop handler ──────────────────────────────────────────────────────────
  function handleDrop(dateStr: string, si: number, dow: number) {
    const durSlots = duration / 30;
    for (let k = 0; k < durSlots; k++) {
      if (si + k >= SLOT_COUNT) { setToast('Session would extend past 11 PM'); return; }
      const t = getSlotType(dateStr, si + k, dow);
      if (t === 'tutor_busy' || t === 'placed') { setToast('Conflict — tutor is busy at this time'); return; }
      if (t !== 'overlap')                       { setToast('No availability overlap at this time'); return; }
    }
    const startTime = slotToTimeStr(si);
    const localId   = `${dateStr}-${startTime}`;
    if (placedSessions.some(ps => ps.localId === localId)) { setToast('Already scheduled at this time'); return; }
    setPlacedSessions(prev => [
      ...prev,
      { localId, date: dateStr, startTime, scheduledAt: tzToUtcIso(dateStr, startTime, selectedTz) },
    ]);
  }

  // ── Remove placed session ─────────────────────────────────────────────────
  function removePlaced(localId: string) {
    if (!confirm('Remove this session?')) return;
    setPlacedSessions(prev => prev.filter(ps => ps.localId !== localId));
  }

  // ── Auto-fill ─────────────────────────────────────────────────────────────
  function handleAutoFill() {
    if (!startDate || !endDate) { setToast('Set a date range first'); return; }
    const rangeStart  = new Date(startDate + 'T00:00:00');
    const rangeEnd    = new Date(endDate   + 'T00:00:00');
    const durSlots    = duration / 30;
    const newSessions: PlacedSession[] = [];
    const usedKeys    = new Set(placedSessions.map(ps => ps.localId));
    const hasDayTimes = Object.keys(selectedDays).length > 0;

    let weekCur = startOfWeek(rangeStart, { weekStartsOn: 0 });
    while (!isAfter(weekCur, rangeEnd)) {
      if (hasDayTimes) {
        // Use per-day specified times — place one session per selected day per week
        for (let d = 0; d < 7; d++) {
          const day = addDays(weekCur, d);
          if (isBefore(day, rangeStart) || isAfter(day, rangeEnd)) continue;
          const dow     = day.getDay();
          const timeStr = selectedDays[dow];
          if (!timeStr) continue;
          const dateStr = format(day, 'yyyy-MM-dd');
          const key     = `${dateStr}-${timeStr}`;
          if (usedKeys.has(key)) continue;
          const si = (timeStrToMins(timeStr) - SLOT_START_HOUR * 60) / 30;
          let allOk = true;
          for (let k = 0; k < durSlots; k++) {
            if (getSlotType(dateStr, si + k, dow) !== 'overlap') { allOk = false; break; }
          }
          if (!allOk) continue;
          const s: PlacedSession = { localId: key, date: dateStr, startTime: timeStr, scheduledAt: tzToUtcIso(dateStr, timeStr, selectedTz) };
          newSessions.push(s);
          usedKeys.add(key);
        }
      } else {
        // Fallback: find first available overlap slot anywhere in the week
        let placed = false;
        for (let d = 0; d < 7 && !placed; d++) {
          const day = addDays(weekCur, d);
          if (isBefore(day, rangeStart) || isAfter(day, rangeEnd)) continue;
          const dateStr = format(day, 'yyyy-MM-dd');
          const dow     = day.getDay();
          for (let si = 0; si < SLOT_COUNT - durSlots + 1 && !placed; si++) {
            const startTime = slotToTimeStr(si);
            const key       = `${dateStr}-${startTime}`;
            if (usedKeys.has(key)) continue;
            let allOk = true;
            for (let k = 0; k < durSlots; k++) {
              if (getSlotType(dateStr, si + k, dow) !== 'overlap') { allOk = false; break; }
            }
            if (!allOk) continue;
            const s: PlacedSession = { localId: key, date: dateStr, startTime, scheduledAt: tzToUtcIso(dateStr, startTime, selectedTz) };
            newSessions.push(s);
            usedKeys.add(key);
            placed = true;
          }
        }
      }
      weekCur = addWeeks(weekCur, 1);
    }
    if (newSessions.length === 0) setToast('No open overlap slots found in date range');
    else setPlacedSessions(prev => [...prev, ...newSessions]);
  }

  // ── Save timezone ─────────────────────────────────────────────────────────
  async function saveTz(tz: string) {
    if (!selectedStudent) return;
    await supabase.from('students').update({ timezone: tz }).eq('id', selectedStudent.id);
  }

  function handleTzChange(tz: string) {
    setSelectedTz(tz);
    saveTz(tz);
    // Recompute busy blocks in new tz
    if (selectedTutor && step >= 3) {
      supabase
        .from('sessions')
        .select('scheduled_at,duration_minutes')
        .eq('tutor_id', selectedTutor.id)
        .in('status', ['scheduled'])
        .gte('scheduled_at', new Date().toISOString())
        .then(({ data }) => {
          setTutorBusy(
            (data ?? []).map((s: any) => {
              const { dateStr, startMins } = utcToTzInfo(s.scheduled_at as string, tz);
              return { dateStr, startMins, endMins: startMins + ((s.duration_minutes as number) ?? 60) };
            }),
          );
        });
    }
  }

  // ── Book all ──────────────────────────────────────────────────────────────
  async function handleBookAll() {
    if (!selectedStudent || !selectedTutor || placedSessions.length === 0) return;
    setBooking(true);
    setBookingError('');
    const sorted = [...placedSessions].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    try {
      const res = await fetch('/api/sessions/bulk-recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: selectedStudent.id,
          tutor_id: selectedTutor.id,
          scheduled_ats: sorted.map(ps => ps.scheduledAt),
          duration_minutes: duration,
          override_availability: overrideAvailability,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setBookingError(data.error ?? `Error ${res.status}`); }
      else          { setBookingResult(data as BookingResult); }
    } catch {
      setBookingError('Network error — please try again.');
    } finally {
      setBooking(false);
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  function reset() {
    setStep(1); setSelectedStudent(null); setSelectedTutor(null);
    setStudentAvail([]); setTutorAvail([]); setTutorBusy([]);
    setPlacedSessions([]); setStartDate(''); setEndDate('');
    setDuration(60); setBookingResult(null); setBookingError('');
    setSelectedDays({});
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(studentQuery.toLowerCase()),
  );
  const weekDays      = Array.from({ length: 7 }, (_, i) => addDays(viewWeekStart, i));
  const sortedPlaced  = [...placedSessions].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const totalHours    = (placedSessions.length * duration) / 60;
  const tzLabel       = TIMEZONES.find(t => t.value === selectedTz)?.label ?? 'EST';

  function overlapBadge(n: number) {
    if (n >= 6) return { label: 'Excellent Match', cls: 'bg-green-100 text-green-800 border-green-200' };
    if (n >= 2) return { label: 'Good Match',      cls: 'bg-blue-100 text-blue-800 border-blue-200' };
    return              { label: 'Limited',         cls: 'bg-amber-100 text-amber-800 border-amber-200' };
  }
  function initials(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }
  function slotBg(type: 'overlap' | 'student' | 'tutor_busy' | 'placed' | 'empty') {
    switch (type) {
      case 'overlap':    return 'bg-green-200 border-green-300';
      case 'tutor_busy': return 'bg-gray-300 border-gray-400';
      case 'placed':     return 'bg-[#1e2090] border-[#1e2090]';
      default:           return 'bg-white border-gray-100';
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recurring Sessions</h1>
          <p className="text-gray-500 text-sm mt-1">
            Smart 4-step scheduling — drag sessions onto the calendar or auto-fill.
          </p>
        </div>
        <CalendarRange className="w-8 h-8 text-[#1e2090] opacity-30" />
      </div>

      <StepIndicator step={step} />

      {/* ═══════════════ STEP 1: SELECT STUDENT ═══════════════════════════════ */}
      {step === 1 && (
        <div className="max-w-2xl space-y-4">
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Select Student</h2>
            <input
              value={studentQuery}
              onChange={e => setStudentQuery(e.target.value)}
              placeholder="Search students…"
              className="input mb-3"
            />
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {filteredStudents.map(s => {
                const hrs  = (s.purchased_hours ?? 0) - (s.used_hours ?? 0);
                const sel  = selectedStudent?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStudent(s)}
                    className={`w-full text-left p-4 rounded-xl border transition-colors ${sel ? 'border-[#1e2090] bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">{s.name}</p>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {s.grade ? `Grade ${s.grade}` : '—'}
                          {s.target_score ? ` · Target ${s.target_score}` : ''}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-gray-900">{hrs > 0 ? `${hrs.toFixed(1)} hrs left` : 'No hours'}</p>
                        <p className="text-xs text-gray-400">{s.purchased_hours ?? 0} purchased</p>
                      </div>
                    </div>
                  </button>
                );
              })}
              {filteredStudents.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No students found</p>
              )}
            </div>
          </div>

          {selectedStudent && (
            <div className="card p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Program Settings</h2>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">End Date</label>
                  <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} className="input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="label">Session Duration</label>
                  <select value={duration} onChange={e => setDuration(Number(e.target.value) as 30 | 60 | 90 | 120)} className="input">
                    <option value={30}>30 minutes</option>
                    <option value={60}>60 minutes</option>
                    <option value={90}>90 minutes</option>
                    <option value={120}>120 minutes</option>
                  </select>
                </div>
                <div>
                  <label className="label">Student Timezone</label>
                  <select
                    value={selectedTz}
                    onChange={e => { setSelectedTz(e.target.value); saveTz(e.target.value); }}
                    className="input"
                  >
                    {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Saved to student record</p>
                </div>
              </div>

              {/* ── Override availability ── */}
              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overrideAvailability}
                    onChange={e => setOverrideAvailability(e.target.checked)}
                    className="mt-1"
                  />
                  <div>
                    <span className="font-medium text-amber-900">Override tutor availability</span>
                    <p className="text-xs text-amber-800 mt-0.5">
                      Allows booking outside the tutor&apos;s stated weekly availability.
                      Conflicts (double-booking) still blocked. Tutor will be notified via email.
                    </p>
                  </div>
                </label>
              </div>

              {/* ── Per-day schedule ── */}
              <div className="mb-5">
                <label className="label">Session Days &amp; Start Times</label>
                <p className="text-xs text-gray-400 mb-2">Check each day and set its own start time. Duration applies to all.</p>
                <div className="space-y-2">
                  {DAY_SHORT.map((dayLabel, dow) => {
                    const checked = dow in selectedDays;
                    return (
                      <div key={dow} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id={`sched-${dow}`}
                          checked={checked}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedDays(prev => ({ ...prev, [dow]: '17:00' }));
                            } else {
                              setSelectedDays(prev => { const n = { ...prev }; delete n[dow]; return n; });
                            }
                          }}
                          className="rounded border-gray-300 text-[#1e2090] flex-shrink-0"
                        />
                        <label
                          htmlFor={`sched-${dow}`}
                          className="text-sm font-medium text-gray-700 w-10 cursor-pointer select-none flex-shrink-0"
                        >
                          {dayLabel}
                        </label>
                        {checked ? (
                          <select
                            value={selectedDays[dow]}
                            onChange={e => setSelectedDays(prev => ({ ...prev, [dow]: e.target.value }))}
                            className="input text-sm flex-1"
                          >
                            {TIME_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex-1 h-9 bg-gray-50 rounded-lg border border-dashed border-gray-200" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!startDate || !endDate}
                className="btn-primary"
              >
                Next: Select Tutor →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ STEP 2: SELECT TUTOR ════════════════════════════════ */}
      {step === 2 && (
        <div className="max-w-2xl">
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Select Tutor</h2>
            <p className="text-sm text-gray-500 mb-4">
              {overrideAvailability
                ? <>All active tutors — <span className="text-amber-700 font-medium">availability override active</span></>
                : <>Sorted by availability overlap with <strong>{selectedStudent?.name}</strong>.</>
              }
            </p>

            {tutorCardsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {tutorCards.map(({ tutor, overlapSlots, activeStudentCount, hasSignedContract }) => {
                  const badge = overlapBadge(overlapSlots);
                  const subs  = Array.isArray(tutor.subjects) ? tutor.subjects.join(', ') : (tutor.subjects ?? '');
                  return (
                    <button
                      key={tutor.id}
                      onClick={() => { setSelectedTutor(tutor); setStep(3); }}
                      className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-[#1e2090] hover:bg-blue-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#1e2090] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {initials(tutor.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900">{tutor.name}</p>
                            {hasSignedContract && (
                              <span className="text-xs font-medium bg-green-100 text-green-800 border border-green-200 rounded-full px-2 py-0.5">
                                Signed Contract
                              </span>
                            )}
                            <span className={`text-xs font-medium border rounded-full px-2 py-0.5 ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5 truncate">
                            {subs} · ${tutor.hourly_rate}/hr · {activeStudentCount} active student{activeStudentCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xl font-bold text-[#1e2090]">{overlapSlots}</p>
                          <p className="text-xs text-gray-400">slots/wk</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {tutorCards.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">No tutors found</p>
                )}
              </div>
            )}

            <button onClick={() => setStep(1)} className="btn-secondary mt-4">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════ STEP 3: CALENDAR ════════════════════════════════════ */}
      {step === 3 && (
        <>
          <div className="flex gap-4">
            {/* ── Left sidebar ── */}
            <div className="w-52 flex-shrink-0 space-y-3">
              {/* Draggable session pill */}
              <div className="card p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Drag to Calendar
                </p>
                <div
                  draggable
                  onDragStart={e => e.dataTransfer.setData('text/plain', 'session')}
                  className="bg-[#1e2090] text-white rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing select-none text-center shadow"
                  style={{ minHeight: `${Math.max(36, (duration / 30) * 20)}px` }}
                >
                  <p className="text-sm font-bold">Session</p>
                  <p className="text-xs opacity-70">{duration} min</p>
                </div>
                <button
                  onClick={handleAutoFill}
                  className="w-full mt-3 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:border-[#1e2090] hover:text-[#1e2090] transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" /> Auto-fill
                </button>
              </div>

              {/* Per-day schedule (read-only — set in Step 1) */}
              <div className="card p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Weekly Schedule</p>
                {Object.keys(selectedDays).length === 0 ? (
                  <p className="text-xs text-gray-400">No days selected. Go back to Step 1 to set days &amp; times.</p>
                ) : (
                  <div className="space-y-1">
                    {DAY_SHORT.map((label, dow) => {
                      const timeStr = selectedDays[dow];
                      if (!timeStr) return null;
                      const opt = TIME_OPTIONS.find(o => o.value === timeStr);
                      return (
                        <div key={dow} className="flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-700 w-7">{label}</span>
                          <span className="text-gray-500">{opt?.label ?? timeStr}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="card p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Scheduled</p>
                <p className="text-2xl font-bold text-gray-900">{placedSessions.length}</p>
                <p className="text-xs text-gray-400 mb-1">sessions</p>
                <p className="text-lg font-semibold text-gray-700">{totalHours.toFixed(1)} hrs</p>
              </div>

              {/* Legend */}
              <div className="card p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Legend</p>
                <div className="space-y-1.5">
                  {([
                    { color: 'bg-green-200', label: 'Tutor available' },
                    { color: 'bg-[#1e2090]', label: 'Placed session' },
                    { color: 'bg-gray-300',  label: 'Tutor busy' },
                  ] as const).map(item => (
                    <div key={item.label} className="flex items-center gap-2">
                      <div className={`w-3.5 h-3.5 rounded ${item.color} border border-gray-200 flex-shrink-0`} />
                      <span className="text-xs text-gray-600">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Timezone */}
              <div className="card p-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Display Timezone</label>
                <p className="text-[10px] text-gray-400 mb-2">Calendar times shown in this timezone</p>
                <select value={selectedTz} onChange={e => handleTzChange(e.target.value)} className="input text-sm">
                  {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
            </div>

            {/* ── Calendar ── */}
            <div className="flex-1 card p-3 min-w-0">
              {/* Week nav */}
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => setViewWeekStart(d => addDays(d, -7))} className="p-1.5 rounded hover:bg-gray-100">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-center">
                  <span className="text-sm font-semibold text-gray-700">
                    {format(viewWeekStart, 'MMM d')} – {format(addDays(viewWeekStart, 6), 'MMM d, yyyy')}
                  </span>
                  <div className="flex items-center justify-center gap-2 mt-0.5">
                    <span className="text-[10px] font-medium text-navy-700 bg-navy-50 border border-navy-200 px-1.5 py-0.5 rounded">
                      Viewing: {tzLabel}
                    </span>
                    {selectedStudent && (
                      <span className="text-[10px] text-gray-500 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">
                        Student: {TIMEZONES.find(t => t.value === (selectedStudent.timezone ?? selectedTz))?.label ?? tzLabel}
                      </span>
                    )}
                    {selectedTutor?.timezone && (
                      <span className="text-[10px] text-gray-500 bg-green-50 border border-green-100 px-1.5 py-0.5 rounded">
                        Tutor: {TIMEZONES.find(t => t.value === selectedTutor.timezone)?.label ?? selectedTutor.timezone}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => setViewWeekStart(d => addDays(d, 7))} className="p-1.5 rounded hover:bg-gray-100">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Grid */}
              <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
                <div
                  className="grid"
                  style={{ gridTemplateColumns: '44px repeat(7, 1fr)', minWidth: '480px' }}
                >
                  {/* Header row */}
                  <div className="sticky top-0 z-10 bg-white border-b border-gray-100" />
                  {weekDays.map(day => {
                    const ds      = format(day, 'yyyy-MM-dd');
                    const isToday = ds === format(new Date(), 'yyyy-MM-dd');
                    return (
                      <div
                        key={ds}
                        className={`sticky top-0 z-10 bg-white border-b border-l border-gray-100 text-center py-1.5 ${isToday ? 'bg-blue-50' : ''}`}
                      >
                        <p className="text-xs text-gray-400">{DAY_SHORT[day.getDay()]}</p>
                        <p className={`text-xs font-bold ${isToday ? 'text-[#1e2090]' : 'text-gray-700'}`}>
                          {format(day, 'd')}
                        </p>
                      </div>
                    );
                  })}

                  {/* Slot rows — rendered as flat children of the grid */}
                  {Array.from({ length: SLOT_COUNT }, (_, si) => {
                    const mins      = slotToMins(si);
                    const showLabel = mins % 60 === 0;
                    const timeStr   = slotToTimeStr(si);

                    const rowCells = [
                      /* Time axis */
                      <div
                        key={`t-${si}`}
                        className="border-b border-gray-50 flex items-start justify-end pr-1 pt-px"
                        style={{ height: '22px' }}
                      >
                        {showLabel && (
                          <span className="text-xs text-gray-400 leading-none" style={{ fontSize: '9px' }}>
                            {formatTimeString(timeStr)}
                          </span>
                        )}
                      </div>,
                      /* Day cells */
                      ...weekDays.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const dow     = day.getDay();
                        const type    = getSlotType(dateStr, si, dow);

                        // Is this the first slot of a placed session?
                        const placed = type === 'placed'
                          ? placedSessions.find(ps => {
                              if (ps.date !== dateStr) return false;
                              const psFirst = (timeStrToMins(ps.startTime) - SLOT_START_HOUR * 60) / 30;
                              return si === psFirst;
                            })
                          : undefined;

                        const busyStyle = type === 'tutor_busy'
                          ? {
                              backgroundImage:
                                'repeating-linear-gradient(-45deg,transparent,transparent 3px,rgba(0,0,0,.12) 3px,rgba(0,0,0,.12) 4px)',
                            }
                          : {};

                        return (
                          <div
                            key={`c-${si}-${dateStr}`}
                            className={`border-b border-l relative ${slotBg(type)}${type === 'overlap' ? ' cursor-pointer hover:brightness-90' : ''}`}
                            style={{ height: '22px', ...busyStyle }}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); handleDrop(dateStr, si, dow); }}
                            onClick={() => { if (type === 'overlap') handleDrop(dateStr, si, dow); }}
                          >
                            {placed && (
                              <div
                                className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-0.5"
                                style={{ height: `${(duration / 30) * 22}px` }}
                              >
                                <span className="text-white font-semibold leading-none truncate"
                                  style={{ fontSize: '9px' }}>
                                  {formatTimeString(placed.startTime)}
                                </span>
                                <button
                                  onClick={() => removePlaced(placed.localId)}
                                  className="text-white opacity-70 hover:opacity-100 flex-shrink-0"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      }),
                    ];
                    return rowCells;
                  }).flat()}
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 footer */}
          <div className="flex gap-3 mt-4">
            <button onClick={() => setStep(2)} className="btn-secondary">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={() => setStep(4)}
              disabled={placedSessions.length === 0}
              className="btn-primary"
            >
              Review {placedSessions.length} Session{placedSessions.length !== 1 ? 's' : ''} →
            </button>
          </div>
        </>
      )}

      {/* ═══════════════ STEP 4: REVIEW & CONFIRM ════════════════════════════ */}
      {step === 4 && !bookingResult && (
        <div className="max-w-2xl">
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Review & Confirm</h2>
            <p className="text-sm text-gray-500 mb-5">
              {selectedStudent?.name} with {selectedTutor?.name} · {duration} min sessions · {tzLabel}
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Sessions', value: String(sortedPlaced.length) },
                { label: 'Total hours', value: totalHours.toFixed(1) },
                { label: 'Est. cost', value: selectedTutor?.hourly_rate == null ? 'Rate not set' : `$${(totalHours * selectedTutor.hourly_rate).toFixed(0)}` },
              ].map(stat => (
                <div key={stat.label} className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Weekly pattern summary */}
            {Object.keys(selectedDays).length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Weekly Pattern</p>
                <div className="space-y-1">
                  {DAY_SHORT.map((label, dow) => {
                    const timeStr = selectedDays[dow];
                    if (!timeStr) return null;
                    const opt = TIME_OPTIONS.find(o => o.value === timeStr);
                    const count = sortedPlaced.filter(ps => new Date(ps.date + 'T12:00:00').getDay() === dow).length;
                    return (
                      <div key={dow} className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-gray-800 w-24">{label}s</span>
                        <span className="text-gray-500">at {opt?.label ?? timeStr}</span>
                        <span className="ml-auto text-xs text-gray-400">{count} session{count !== 1 ? 's' : ''}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Session list */}
            <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto -mx-6 px-6 mb-5">
              {sortedPlaced.map(ps => {
                const holiday  = HOLIDAYS.has(ps.date);
                const unusual  = timeStrToMins(ps.startTime) < 8 * 60 || timeStrToMins(ps.startTime) >= 20 * 60;
                const dayDate  = new Date(ps.date + 'T12:00:00');
                const endTime  = minsToTimeStr(timeStrToMins(ps.startTime) + duration);
                const flagged  = holiday || unusual;
                return (
                  <div
                    key={ps.localId}
                    className={`flex items-center justify-between py-3 text-sm ${flagged ? 'bg-amber-50 -mx-6 px-6' : ''}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">
                        {format(dayDate, 'EEE, MMM d, yyyy')}
                      </span>
                      {holiday && (
                        <span className="text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200 rounded-full px-2 py-0.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Holiday
                        </span>
                      )}
                      {unusual && (
                        <span className="text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200 rounded-full px-2 py-0.5">
                          Unusual time
                        </span>
                      )}
                    </div>
                    <span className="text-gray-500 flex-shrink-0">
                      {formatTimeString(ps.startTime)} – {formatTimeString(endTime)}
                    </span>
                  </div>
                );
              })}
            </div>

            {bookingError && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {bookingError}
              </div>
            )}

            {booking && (
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-1.5">Creating sessions…</p>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#1e2090] rounded-full animate-pulse w-1/2" />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(3)} disabled={booking} className="btn-secondary">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button onClick={handleBookAll} disabled={booking} className="btn-primary">
                {booking ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                {booking ? 'Booking…' : `Book All ${sortedPlaced.length} Sessions`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ SUCCESS SCREEN ══════════════════════════════════════ */}
      {step === 4 && bookingResult && (
        <div className="max-w-xl">
          <div className="card p-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Sessions Booked!</h2>
            <p className="text-gray-500 mb-6">
              Confirmation emails sent to student, parent, and tutor.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <p className="text-3xl font-bold text-green-700">{bookingResult.booked.length}</p>
                <p className="text-xs text-green-600 mt-0.5">Booked</p>
              </div>
              <div className={`border rounded-xl p-4 ${bookingResult.skipped.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                <p className={`text-3xl font-bold ${bookingResult.skipped.length > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                  {bookingResult.skipped.length}
                </p>
                <p className={`text-xs mt-0.5 ${bookingResult.skipped.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                  Skipped
                </p>
              </div>
            </div>
            {bookingResult.skipped.length > 0 && (
              <div className="text-left mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Skipped Sessions</p>
                <div className="space-y-1 max-h-32 overflow-y-auto text-sm">
                  {bookingResult.skipped.map((s, i) => (
                    <div key={i} className="flex justify-between text-gray-600">
                      <span>{s.date.slice(0, 10)}</span>
                      <span className="text-amber-600 text-xs">{s.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <a href="/admin/calendar" className="btn-secondary">View Calendar</a>
              <button onClick={reset} className="btn-primary">Book Another</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
