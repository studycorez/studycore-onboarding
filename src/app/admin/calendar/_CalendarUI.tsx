'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { Draggable } from '@fullcalendar/interaction';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import type { EventClickArg } from '@fullcalendar/core';
import Modal from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/Badge';
import { ChevronLeft, ChevronRight, Loader2, CalendarClock, ExternalLink } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import Link from 'next/link';

// ── Color palette ─────────────────────────────────────────────────────────────
const PALETTE = [
  '#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444',
  '#06b6d4','#ec4899','#84cc16','#f97316','#6366f1','#14b8a6','#a855f7',
];
function studentColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function hexFade(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface TutorOption { id: string; name: string; }
interface StudentOption { id: string; name: string; tutor_name?: string; }

interface BookingState {
  open: boolean;
  studentId: string;
  studentName: string;
  tutorId: string;
  dateTimeLocal: string;
  duration: string;
  createZoom: boolean;
}

const RESCHEDULE_REASONS = ['Client Request','Tutor Request','Technical Issue','Emergency','Other'];
const DURATIONS = ['30','60','90','120'];

function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Event builder ─────────────────────────────────────────────────────────────
function sessionToEvent(s: any) {
  const color = studentColor(s.student_id);
  const cancelled  = s.status === 'cancelled';
  const completed  = s.status === 'completed';
  const rescheduled = (s.reschedule_count ?? 0) > 0;
  const end = new Date(new Date(s.scheduled_at).getTime() + s.duration_minutes * 60000).toISOString();

  return {
    id: s.id,
    title: s.student?.name ?? 'Unknown',
    start: s.scheduled_at,
    end,
    backgroundColor: cancelled ? '#d1d5db' : completed ? hexFade(color, 0.55) : color,
    borderColor: rescheduled ? '#f59e0b' : cancelled ? '#9ca3af' : color,
    borderWidth: rescheduled ? 2 : 1,
    textColor: cancelled ? '#6b7280' : '#fff',
    resourceId: s.tutor_id,
    extendedProps: {
      session: s,
      studentId: s.student_id,
      studentName: s.student?.name ?? '',
      tutorName: s.tutor?.name ?? '',
      status: s.status,
      durationMin: s.duration_minutes,
      rescheduleCount: s.reschedule_count ?? 0,
      cancellationReason: s.cancellation_reason,
      zoomJoinUrl: s.zoom_join_url,
    },
  };
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CalendarUI() {
  const calendarRef = useRef<FullCalendar>(null);
  const sidebarRef  = useRef<HTMLDivElement>(null);

  // Data
  const [tutors,  setTutors]  = useState<TutorOption[]>([]);
  const [students,setStudents]= useState<StudentOption[]>([]);
  const [rawSessions, setRawSessions] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // UI state
  const [calView,      setCalView]      = useState<'week'|'month'>('week');
  const [tutorMode,    setTutorMode]    = useState<'single'|'all'>('single');
  const [selectedTutor,setSelectedTutor]= useState('');
  const [rangeLabel,   setRangeLabel]   = useState('');
  const [loadingEvents,setLoadingEvents]= useState(false);
  const [sidebarOpen,  setSidebarOpen]  = useState(true);

  // Booking modal
  const blankBooking: BookingState = { open:false,studentId:'',studentName:'',tutorId:'',dateTimeLocal:'',duration:'',createZoom:true };
  const [booking,         setBooking]         = useState<BookingState>(blankBooking);
  const [bookingError,    setBookingError]    = useState('');
  const [bookingSubmitting,setBookingSubmitting]= useState(false);

  // Detail modal
  const [detailSession,   setDetailSession]   = useState<any>(null);
  const [rescheduleOpen,  setRescheduleOpen]  = useState(false);
  const [rescheduleForm,  setRescheduleForm]  = useState({ newTime:'', reason:'Client Request', notes:'' });
  const [rescheduling,    setRescheduling]    = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');

  // ── Load initial data ───────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/calendar/tutors').then(r => r.json()),
      fetch('/api/calendar/students').then(r => r.json()),
    ]).then(([tutorData, studentData]) => {
      const t = tutorData ?? [];
      setTutors(t);
      if (t.length) setSelectedTutor(t[0].id);
      setStudents(studentData ?? []);
    }).catch(console.error);
  }, []);

  // ── Reload sessions for current range ──────────────────────────────────────
  const reloadSessions = useCallback(async (start?: string, end?: string) => {
    const s = start ?? dateRange.start;
    const e = end   ?? dateRange.end;
    if (!s || !e) return;
    setLoadingEvents(true);
    const res = await fetch(`/api/calendar/sessions?start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}`);
    const data = await res.json();
    setRawSessions(Array.isArray(data) ? data : []);
    setLoadingEvents(false);
  }, [dateRange]);

  // ── Draggable init ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sidebarRef.current || students.length === 0) return;
    const draggable = new Draggable(sidebarRef.current, {
      itemSelector: '.fc-chip',
      eventData(el: HTMLElement) {
        return {
          title: el.dataset.name ?? '',
          extendedProps: { studentId: el.dataset.id, studentName: el.dataset.name },
          create: false,
        };
      },
    });
    return () => draggable.destroy();
  }, [students]);

  // ── Derived FC view ────────────────────────────────────────────────────────
  const fcView = useMemo(() => {
    if (calView === 'month') return 'dayGridMonth';
    return tutorMode === 'all' ? 'resourceTimeGridWeek' : 'timeGridWeek';
  }, [calView, tutorMode]);

  useEffect(() => {
    calendarRef.current?.getApi().changeView(fcView);
  }, [fcView]);

  // ── Filtered events ────────────────────────────────────────────────────────
  const events = useMemo(() => {
    const filtered = tutorMode === 'single' && selectedTutor
      ? rawSessions.filter(s => s.tutor_id === selectedTutor)
      : rawSessions;
    return filtered.map(sessionToEvent);
  }, [rawSessions, tutorMode, selectedTutor]);

  const resources = useMemo(() =>
    tutors.map(t => ({ id: t.id, title: t.name })),
  [tutors]);

  // ── Calendar callbacks ─────────────────────────────────────────────────────
  const onDatesSet = useCallback(async (info: any) => {
    setRangeLabel(info.view.title);
    const start = info.startStr;
    const end   = info.endStr;
    setDateRange({ start, end });
    setLoadingEvents(true);
    const res = await fetch(`/api/calendar/sessions?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    const data = await res.json();
    setRawSessions(Array.isArray(data) ? data : []);
    setLoadingEvents(false);
  }, []);

  const handleDrop = useCallback((info: any) => {
    const el = info.draggedEl as HTMLElement;
    const studentId   = el.dataset.id   ?? '';
    const studentName = el.dataset.name ?? '';
    if (!studentId) return;
    const tutorId = info.resource?.id ?? (tutorMode === 'single' ? selectedTutor : '');
    setBooking({
      open: true,
      studentId,
      studentName,
      tutorId,
      dateTimeLocal: toDateTimeLocal(info.date as Date),
      duration: '',
      createZoom: true,
    });
    setBookingError('');
  }, [tutorMode, selectedTutor]);

  const handleEventClick = useCallback((info: EventClickArg) => {
    info.jsEvent.preventDefault();
    setDetailSession(info.event.extendedProps.session);
    setRescheduleOpen(false);
    setRescheduleError('');
    setRescheduleForm({ newTime: '', reason: 'Client Request', notes: '' });
  }, []);

  // ── Booking submit ─────────────────────────────────────────────────────────
  async function submitBooking() {
    if (!booking.duration) { setBookingError('Please select a duration.'); return; }
    if (!booking.tutorId)  { setBookingError('Please select a tutor.'); return; }

    const scheduledAt  = new Date(booking.dateTimeLocal).toISOString();
    const durationMin  = parseInt(booking.duration);

    // Client-side conflict check
    const conflict = rawSessions.some(s => {
      if (s.tutor_id !== booking.tutorId) return false;
      if (s.status === 'cancelled') return false;
      const sStart = new Date(s.scheduled_at).getTime();
      const sEnd   = sStart + s.duration_minutes * 60000;
      const bStart = new Date(scheduledAt).getTime();
      const bEnd   = bStart + durationMin * 60000;
      return bStart < sEnd && bEnd > sStart;
    });
    if (conflict) { setBookingError('Tutor is already booked at this time.'); return; }

    setBookingSubmitting(true);
    setBookingError('');
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutor_id:         booking.tutorId,
          student_id:       booking.studentId,
          scheduled_at:     scheduledAt,
          duration_minutes: durationMin,
          create_zoom:      booking.createZoom,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setBookingError(data.error ?? 'Failed to create session'); return; }
      setBooking(blankBooking);
      await reloadSessions();
    } finally {
      setBookingSubmitting(false);
    }
  }

  // ── Reschedule submit ──────────────────────────────────────────────────────
  async function submitReschedule() {
    if (!rescheduleForm.newTime || !detailSession) return;
    setRescheduling(true);
    setRescheduleError('');
    try {
      const res = await fetch(`/api/sessions/${detailSession.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newScheduledAt: new Date(rescheduleForm.newTime).toISOString(),
          reason: rescheduleForm.reason,
          notes: rescheduleForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setRescheduleError(data.error ?? 'Reschedule failed'); return; }
      setDetailSession(null);
      await reloadSessions();
    } finally {
      setRescheduling(false);
    }
  }

  // ── Custom event content ───────────────────────────────────────────────────
  function renderEventContent(arg: any) {
    const ep = arg.event.extendedProps;
    const cancelled = ep.status === 'cancelled';
    return (
      <div style={{ padding:'2px 4px', overflow:'hidden', lineHeight:1.3 }}>
        <div style={{
          fontSize:11, fontWeight:600, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis',
          textDecoration: cancelled ? 'line-through' : 'none',
        }}>
          {ep.studentName}
        </div>
        {tutorMode === 'all' && (
          <div style={{ fontSize:10, opacity:.85, overflow:'hidden', whiteSpace:'nowrap' }}>{ep.tutorName}</div>
        )}
        <div style={{ fontSize:10, opacity:.75 }}>{ep.durationMin}m</div>
      </div>
    );
  }

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const nav = (action: 'prev'|'next'|'today') => calendarRef.current?.getApi()[action]();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-4 min-h-0">
      {/* ── Student sidebar ─────────────────────────────────────────────── */}
      <div className={`shrink-0 transition-all ${sidebarOpen ? 'w-48' : 'w-8'}`}>
        <div className="card h-full flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100">
            {sidebarOpen && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Students</p>}
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className="text-gray-400 hover:text-gray-600 ml-auto"
              title={sidebarOpen ? 'Collapse' : 'Expand'}
            >
              <ChevronLeft className={`w-4 h-4 transition-transform ${sidebarOpen ? '' : 'rotate-180'}`} />
            </button>
          </div>
          {sidebarOpen && (
            <>
              <p className="px-3 py-2 text-xs text-gray-400">Drag onto calendar to book</p>
              <div ref={sidebarRef} className="flex-1 overflow-y-auto px-2 pb-2 space-y-1.5">
                {students.length === 0 && (
                  <p className="text-xs text-gray-400 px-1 pt-2">Loading students…</p>
                )}
                {students.map(s => (
                  <div
                    key={s.id}
                    className="fc-chip cursor-grab active:cursor-grabbing select-none rounded-lg px-3 py-2 text-white text-xs font-medium shadow-sm hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: studentColor(s.id) }}
                    data-id={s.id}
                    data-name={s.name}
                  >
                    <div className="truncate font-semibold">{s.name}</div>
                    {s.tutor_name && (
                      <div className="truncate opacity-80 text-[10px]">{s.tutor_name}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Calendar area ───────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {/* Toolbar */}
        <div className="card px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Navigation */}
            <div className="flex items-center gap-1">
              <button onClick={() => nav('prev')} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => nav('today')} className="px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-gray-100 text-gray-600">
                Today
              </button>
              <button onClick={() => nav('next')} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Current range label */}
            <span className="text-sm font-semibold text-gray-900 mr-auto">{rangeLabel}</span>

            {loadingEvents && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}

            {/* View toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              {(['week','month'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setCalView(v)}
                  className={`px-3 py-1.5 font-medium capitalize ${calView === v ? 'bg-navy-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {v}
                </button>
              ))}
            </div>

            {/* Mode toggle */}
            {calView === 'week' && (
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                <button
                  onClick={() => setTutorMode('single')}
                  className={`px-3 py-1.5 font-medium whitespace-nowrap ${tutorMode === 'single' ? 'bg-navy-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  By Tutor
                </button>
                <button
                  onClick={() => setTutorMode('all')}
                  className={`px-3 py-1.5 font-medium whitespace-nowrap ${tutorMode === 'all' ? 'bg-navy-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  All Tutors
                </button>
              </div>
            )}

            {/* Tutor select */}
            {calView === 'week' && tutorMode === 'single' && (
              <select
                value={selectedTutor}
                onChange={e => setSelectedTutor(e.target.value)}
                className="input w-auto text-sm"
              >
                {tutors.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Calendar */}
        <div className="card overflow-hidden flex-1">
          <style>{`
            .fc { font-family: inherit; }
            .fc-event { cursor: pointer; border-radius: 4px !important; }
            .fc-timegrid-slot { height: 28px !important; }
            .fc-col-header-cell { background: #f9fafb; font-size: 13px; }
            .fc-resource-col-header { background: #eef0ff; }
            .fc-scrollgrid { border-color: #f3f4f6 !important; }
            .fc-scrollgrid td, .fc-scrollgrid th { border-color: #f3f4f6 !important; }
            .fc-daygrid-event { border-radius: 4px !important; }
            .fc-now-indicator-line { border-color: #1e2090 !important; }
          `}</style>
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, resourceTimeGridPlugin]}
            initialView={fcView}
            schedulerLicenseKey="CC-Attribution-NonCommercial-NoDerivatives"
            resources={resources}
            events={events}
            slotMinTime="06:00:00"
            slotMaxTime="24:00:00"
            slotDuration="00:30:00"
            allDaySlot={false}
            droppable={true}
            drop={handleDrop}
            eventClick={handleEventClick}
            datesSet={onDatesSet}
            headerToolbar={false}
            height="auto"
            nowIndicator={true}
            eventContent={renderEventContent}
            resourceAreaWidth="120px"
          />
        </div>
      </div>

      {/* ── Booking Modal ────────────────────────────────────────────────── */}
      <Modal open={booking.open} onClose={() => { setBooking(blankBooking); setBookingError(''); }} title="Book Session" size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">Student</label>
            <input className="input bg-gray-50" value={booking.studentName} readOnly />
          </div>

          <div>
            <label className="label">Tutor *</label>
            <select
              className="input"
              value={booking.tutorId}
              onChange={e => { setBooking(b => ({ ...b, tutorId: e.target.value })); setBookingError(''); }}
              required
            >
              <option value="">Select tutor…</option>
              {tutors.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Date & Time *</label>
            <input
              type="datetime-local"
              className="input"
              value={booking.dateTimeLocal}
              onChange={e => { setBooking(b => ({ ...b, dateTimeLocal: e.target.value })); setBookingError(''); }}
            />
          </div>

          <div>
            <label className="label">Duration *</label>
            <select
              className="input"
              value={booking.duration}
              onChange={e => { setBooking(b => ({ ...b, duration: e.target.value })); setBookingError(''); }}
              required
            >
              <option value="">Select duration…</option>
              {DURATIONS.map(d => <option key={d} value={d}>{d} minutes</option>)}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="create-zoom"
              checked={booking.createZoom}
              onChange={e => setBooking(b => ({ ...b, createZoom: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300"
            />
            <label htmlFor="create-zoom" className="text-sm text-gray-700">Auto-create Zoom meeting</label>
          </div>

          {bookingError && (
            <p className={`text-sm font-medium ${bookingError.includes('already booked') ? 'text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2' : 'text-red-500'}`}>
              {bookingError}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={() => { setBooking(blankBooking); setBookingError(''); }} className="btn-secondary flex-1 justify-center">
              Cancel
            </button>
            <button onClick={submitBooking} disabled={bookingSubmitting} className="btn-primary flex-1 justify-center">
              {bookingSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {bookingSubmitting ? 'Booking…' : 'Book Session'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Session Detail Modal ─────────────────────────────────────────── */}
      <Modal
        open={!!detailSession}
        onClose={() => { setDetailSession(null); setRescheduleOpen(false); }}
        title="Session Details"
        size="lg"
      >
        {detailSession && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-500">Student</p>
                <Link href={`/students/${detailSession.student_id}`} className="font-semibold text-navy-700 hover:underline">
                  {detailSession.student?.name ?? detailSession.student_id}
                </Link>
              </div>
              <div>
                <p className="text-gray-500">Tutor</p>
                <Link href={`/tutors/${detailSession.tutor_id}`} className="font-semibold text-navy-700 hover:underline">
                  {detailSession.tutor?.name ?? detailSession.tutor_id}
                </Link>
              </div>
              <div>
                <p className="text-gray-500">Date & Time</p>
                <p className="font-semibold">{formatDateTime(detailSession.scheduled_at)}</p>
                {detailSession.rescheduled_from && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    Rescheduled from {formatDateTime(detailSession.rescheduled_from)}
                  </p>
                )}
              </div>
              <div>
                <p className="text-gray-500">Duration</p>
                <p className="font-semibold">{detailSession.duration_minutes} min</p>
              </div>
              <div>
                <p className="text-gray-500">Status</p>
                <StatusBadge status={detailSession.status} />
              </div>
              <div>
                <p className="text-gray-500">Payment</p>
                <StatusBadge status={detailSession.payment_status} />
              </div>
              {detailSession.cancellation_reason && (
                <div className="col-span-2">
                  <p className="text-gray-500">Cancellation Reason</p>
                  <p className="font-medium capitalize">{detailSession.cancellation_reason.replace(/_/g,' ')}</p>
                </div>
              )}
            </div>

            {detailSession.zoom_join_url && (
              <a href={detailSession.zoom_join_url} target="_blank" rel="noopener" className="btn-primary inline-flex items-center gap-2 text-sm">
                <ExternalLink className="w-4 h-4" /> Join Zoom
              </a>
            )}

            {/* Reschedule section */}
            {detailSession.status === 'scheduled' && (
              <>
                {!rescheduleOpen ? (
                  <button
                    onClick={() => setRescheduleOpen(true)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100"
                  >
                    <CalendarClock className="w-4 h-4" /> Reschedule
                  </button>
                ) : (
                  <div className="border border-amber-200 rounded-xl p-4 bg-amber-50 space-y-3">
                    <p className="text-sm font-semibold text-amber-900">Reschedule Session</p>
                    <div>
                      <label className="label">New Date & Time *</label>
                      <input
                        type="datetime-local"
                        value={rescheduleForm.newTime}
                        onChange={e => setRescheduleForm(f => ({ ...f, newTime: e.target.value }))}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Reason *</label>
                      <select
                        value={rescheduleForm.reason}
                        onChange={e => setRescheduleForm(f => ({ ...f, reason: e.target.value }))}
                        className="input"
                      >
                        {RESCHEDULE_REASONS.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Notes (optional)</label>
                      <textarea
                        value={rescheduleForm.notes}
                        onChange={e => setRescheduleForm(f => ({ ...f, notes: e.target.value }))}
                        className="input" rows={2}
                      />
                    </div>
                    {rescheduleError && <p className="text-sm text-red-600">{rescheduleError}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => { setRescheduleOpen(false); setRescheduleError(''); }} className="btn-secondary text-sm">Cancel</button>
                      <button onClick={submitReschedule} disabled={!rescheduleForm.newTime || rescheduling} className="btn-primary text-sm flex items-center gap-1.5">
                        {rescheduling && <Loader2 className="w-3 h-3 animate-spin" />}
                        {rescheduling ? 'Rescheduling…' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
