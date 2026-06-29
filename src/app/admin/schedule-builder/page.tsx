'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/layout/AdminLayout';
import { Loader2, ChevronLeft, ChevronRight, SkipForward, UserX, Plus, X, AlertTriangle, Check, Pencil, RefreshCw } from 'lucide-react';
import { format } from 'date-fns-tz';

// ── Types ────────────────────────────────────────────────────────────────────

interface QueueTutor {
  tutor_id: string;
  name: string;
  email: string;
  timezone: string | null;
  contract_count: number;
  schedule_count: number;
  status: 'unprocessed' | 'processed';
}

interface Contract {
  id: string;
  student_id: string;
  student_name: string;
  hourly_rate: number;
  status: string;
  signed_at: string;
}

interface Schedule {
  id: string;
  student_id: string;
  student_name: string;
  day_of_week: number;
  time_local: string;
  timezone: string;
  duration_minutes: number;
  recurring_started_on: string | null;
  notes: string | null;
  reported_at: string;
}

interface TutorDetail {
  tutor: { id: string; name: string; email: string; timezone: string | null; hourly_rate: number | null; active: boolean };
  contracts: Contract[];
  schedules: Schedule[];
}

interface ConflictItem {
  session_id: string;
  scheduled_at: string;
  duration_minutes: number;
  student_id: string;
  student_name: string;
  kind: 'aligned' | 'misaligned';
}

interface MaterializeResult {
  created: number;
  skipped_dupes: number;
  deleted_stale: number;
  conflicts: ConflictItem[];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TIMEZONES = [
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Denver',      label: 'Mountain (Denver)' },
  { value: 'America/Phoenix',     label: 'Arizona (Phoenix, no DST)' },
  { value: 'America/Chicago',     label: 'Central (Chicago)' },
  { value: 'America/New_York',    label: 'Eastern (New York)' },
  { value: 'America/Anchorage',   label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii (Honolulu)' },
];

const DURATIONS = [15, 30, 45, 60, 75, 90, 120];

const TODAY_ISO = new Date().toISOString().slice(0, 10);

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ScheduleBuilderPage() {
  return (
    <Suspense fallback={<AdminLayout><div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div></AdminLayout>}>
      <ScheduleBuilderInner />
    </Suspense>
  );
}

function ScheduleBuilderInner() {
  const searchParams = useSearchParams();
  const initialTutorId = searchParams.get('tutorId');

  const [queue, setQueue] = useState<QueueTutor[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tutorData, setTutorData] = useState<TutorDetail | null>(null);
  const [tutorLoading, setTutorLoading] = useState(false);
  const [markingInactive, setMarkingInactive] = useState(false);

  // Schedule entry form state
  const [openFormStudentId, setOpenFormStudentId] = useState<string | null>(null);
  const [formTimesByDay, setFormTimesByDay] = useState<Record<number, string>>({});
  const [formTimezone, setFormTimezone] = useState('');
  const [formDuration, setFormDuration] = useState(60);
  const [formStartDate, setFormStartDate] = useState(TODAY_ISO);
  const [formNotes, setFormNotes] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Persisted timezone across form sessions
  const [lastUsedTimezone, setLastUsedTimezone] = useState('');

  // Delete schedule state
  const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(null);

  // Add student combobox state
  const [allStudents, setAllStudents] = useState<{ id: string; name: string }[]>([]);
  const [allStudentsError, setAllStudentsError] = useState(false);
  const [addStudentQuery, setAddStudentQuery] = useState('');
  const [addStudentSelected, setAddStudentSelected] = useState<{ id: string; name: string } | null>(null);
  const [addStudentDropdownOpen, setAddStudentDropdownOpen] = useState(false);
  const [addStudentSaving, setAddStudentSaving] = useState(false);
  const [addStudentMsg, setAddStudentMsg] = useState('');
  const [addStudentError, setAddStudentError] = useState('');

  // Materialize + conflicts state
  const [materializing, setMaterializing] = useState(false);
  const [materializeResult, setMaterializeResult] = useState<MaterializeResult | null>(null);
  const [resolvedConflictIds, setResolvedConflictIds] = useState<Set<string>>(new Set());
  const [editingConflictId, setEditingConflictId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ scheduled_at: '', duration_minutes: 60 });
  const [editSaving, setEditSaving] = useState(false);
  const [editDisabledReason, setEditDisabledReason] = useState<string | null>(null);
  const [replacingConflictId, setReplacingConflictId] = useState<string | null>(null);

  // Load queue + all students on mount
  useEffect(() => {
    fetch('/api/admin/schedule-builder/queue')
      .then(r => r.json())
      .then(data => {
        const q = Array.isArray(data) ? data : [];
        setQueue(q);
        // Jump to specific tutor if ?tutorId= param present
        if (initialTutorId) {
          const idx = q.findIndex((t: QueueTutor) => t.tutor_id === initialTutorId);
          if (idx >= 0) setCurrentIndex(idx);
        }
      })
      .finally(() => setQueueLoading(false));
    fetch('/api/admin/schedule-builder/all-students')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { setAllStudents(Array.isArray(data) ? data : []); setAllStudentsError(false); })
      .catch(() => setAllStudentsError(true));
  }, []);

  // Load tutor detail when index changes
  const loadTutor = useCallback(async (tutorId: string) => {
    setTutorLoading(true);
    setTutorData(null);
    setOpenFormStudentId(null);
    try {
      const res = await fetch(`/api/admin/schedule-builder/tutors/${tutorId}`);
      if (res.ok) {
        const data = await res.json();
        setTutorData(data);
      }
    } finally {
      setTutorLoading(false);
    }
  }, []);

  useEffect(() => {
    if (queue.length > 0 && currentIndex < queue.length) {
      loadTutor(queue[currentIndex].tutor_id);
    }
  }, [queue, currentIndex, loadTutor]);

  // Set default timezone when tutor loads
  useEffect(() => {
    if (tutorData?.tutor.timezone && !lastUsedTimezone) {
      setLastUsedTimezone(tutorData.tutor.timezone);
    }
  }, [tutorData, lastUsedTimezone]);

  // ── Form helpers ───────────────────────────────────────────────────────

  function openScheduleForm(studentId: string) {
    setOpenFormStudentId(studentId);
    setFormTimesByDay({});
    setFormTimezone(lastUsedTimezone || tutorData?.tutor.timezone || 'America/New_York');
    setFormDuration(60);
    setFormStartDate(TODAY_ISO);
    setFormNotes('');
    setFormError('');
  }

  function closeScheduleForm() {
    setOpenFormStudentId(null);
    setFormError('');
  }

  function toggleDay(day: number) {
    setFormTimesByDay(prev => {
      const next = { ...prev };
      if (day in next) {
        delete next[day];
      } else {
        // Auto-fill from most recently edited time
        const existingTimes = Object.values(prev).filter(Boolean);
        next[day] = existingTimes.length > 0 ? existingTimes[existingTimes.length - 1] : '';
      }
      return next;
    });
  }

  function setDayTime(day: number, time: string) {
    setFormTimesByDay(prev => ({ ...prev, [day]: time }));
  }

  const selectedDays = Object.keys(formTimesByDay).map(Number).sort((a, b) => a - b);

  async function handleSaveSchedule() {
    if (selectedDays.length === 0) { setFormError('Select at least one day'); return; }
    const emptyTimeDays = selectedDays.filter(d => !formTimesByDay[d]);
    if (emptyTimeDays.length > 0) {
      setFormError(`Set a time for: ${emptyTimeDays.map(d => DAY_NAMES[d]).join(', ')}`);
      return;
    }
    if (!formStartDate) { setFormError('Start date is required'); return; }
    if (!openFormStudentId || !tutorData) return;

    setFormSaving(true);
    setFormError('');

    // Persist timezone choice
    setLastUsedTimezone(formTimezone);

    try {
      for (const day of selectedDays) {
        const res = await fetch('/api/admin/schedule-builder/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tutor_id: tutorData.tutor.id,
            student_id: openFormStudentId,
            day_of_week: day,
            time_local: formTimesByDay[day],
            timezone: formTimezone,
            duration_minutes: formDuration,
            recurring_started_on: formStartDate,
            notes: formNotes.trim() || null,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          setFormError(d?.error ?? `Failed to save ${DAY_NAMES[day]}`);
          setFormSaving(false);
          return;
        }
      }
      // Success — close form and refresh
      closeScheduleForm();
      await loadTutor(tutorData.tutor.id);
    } catch (err: any) {
      setFormError(err.message ?? 'Network error');
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDeleteSchedule(scheduleId: string) {
    if (!window.confirm('Remove this schedule?')) return;
    if (!tutorData) return;
    setDeletingScheduleId(scheduleId);
    try {
      await fetch(`/api/admin/schedule-builder/schedules/${scheduleId}`, { method: 'DELETE' });
      await loadTutor(tutorData.tutor.id);
    } finally {
      setDeletingScheduleId(null);
    }
  }

  // ── Add student ─────────────────────────────────────────────────────────

  // Filter students not already in contracts, matching query
  const addStudentMatches = addStudentQuery.length >= 2
    ? allStudents
        .filter(s => {
          const alreadyAssigned = tutorData?.contracts.some(c => c.student_id === s.id);
          return !alreadyAssigned && s.name.toLowerCase().includes(addStudentQuery.toLowerCase());
        })
        .slice(0, 10)
    : [];

  function handleAddStudentInputChange(value: string) {
    setAddStudentQuery(value);
    setAddStudentDropdownOpen(value.length >= 2);
    // Deselect if input text diverges from selected name
    if (addStudentSelected && value !== addStudentSelected.name) {
      setAddStudentSelected(null);
    }
    setAddStudentMsg('');
    setAddStudentError('');
  }

  function handleSelectStudent(s: { id: string; name: string }) {
    setAddStudentSelected(s);
    setAddStudentQuery(s.name);
    setAddStudentDropdownOpen(false);
  }

  async function handleAssignStudent() {
    if (!addStudentSelected || !tutorData) return;
    setAddStudentSaving(true);
    setAddStudentError('');
    setAddStudentMsg('');
    try {
      const res = await fetch('/api/admin/schedule-builder/add-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutor_id: tutorData.tutor.id, student_id: addStudentSelected.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddStudentError(data.error ?? 'Failed to assign student');
        return;
      }
      setAddStudentMsg(`Added ${addStudentSelected.name} to tutor's contracts`);
      setAddStudentQuery('');
      setAddStudentSelected(null);
      await loadTutor(tutorData.tutor.id);
    } catch {
      setAddStudentError('Network error');
    } finally {
      setAddStudentSaving(false);
    }
  }

  // ── Materialize + conflicts ─────────────────────────────────────────────

  async function handleSaveAndNext() {
    if (!tutorData) return;
    setMaterializing(true);
    setMaterializeResult(null);
    setResolvedConflictIds(new Set());
    setEditingConflictId(null);
    try {
      const res = await fetch('/api/admin/schedule-builder/materialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutor_id: tutorData.tutor.id, weeks_forward: 4 }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? 'Materialize failed');
        return;
      }
      setMaterializeResult(data);
      // Flag if schedules exist but nothing materialized
      if (data.created === 0 && data.skipped_dupes === 0 && data.deleted_stale === 0 && tutorData.schedules.length > 0) {
        fetch('/api/admin/schedule-builder/flags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tutor_id: tutorData.tutor.id,
            flag_type: 'materialize_no_op',
            flag_data: { schedule_count: tutorData.schedules.length },
          }),
        }).catch(() => {});
      }
    } finally {
      setMaterializing(false);
    }
  }

  function markConflictResolved(sessionId: string) {
    setResolvedConflictIds(prev => new Set(prev).add(sessionId));
  }

  async function handleKeepExisting(conflict: ConflictItem) {
    if (!tutorData) return;
    fetch('/api/admin/schedule-builder/flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tutor_id: tutorData.tutor.id,
        flag_type: 'conflict_kept',
        flag_data: {
          session_id: conflict.session_id,
          student_id: conflict.student_id,
          scheduled_at: conflict.scheduled_at,
          student_name: conflict.student_name,
          kind: conflict.kind,
        },
      }),
    }).catch(() => {});
    markConflictResolved(conflict.session_id);
  }

  async function handleEditConflict(conflict: ConflictItem) {
    setEditingConflictId(conflict.session_id);
    setEditDisabledReason(null);
    setEditSaving(false);
    // Check for history
    try {
      const res = await fetch(`/api/sessions/${conflict.session_id}`);
      if (!res.ok) { setEditDisabledReason('Could not load session'); return; }
      const data = await res.json();
      const reasons: string[] = [];
      if (data.has_zoom) reasons.push('Zoom');
      if (data.has_fathom) reasons.push('Fathom');
      if (data.has_report) reasons.push('report');
      if (data.has_attestation) reasons.push('attestation');
      if (data.hours_finalized) reasons.push('finalized hours');
      if (reasons.length > 0) {
        setEditDisabledReason(`Has attached history (${reasons.join(', ')}). Use "Replace with new" instead.`);
        return;
      }
      // Pre-populate edit form
      const tz = tutorData?.tutor.timezone ?? 'America/New_York';
      const localDt = format(new Date(conflict.scheduled_at), "yyyy-MM-dd'T'HH:mm", { timeZone: tz });
      setEditForm({ scheduled_at: localDt, duration_minutes: conflict.duration_minutes });
    } catch {
      setEditDisabledReason('Could not load session');
    }
  }

  async function handleSaveEdit(conflict: ConflictItem) {
    if (!tutorData) return;
    setEditSaving(true);
    try {
      const tz = tutorData.tutor.timezone ?? 'America/New_York';
      const { fromZonedTime } = await import('date-fns-tz');
      const utc = fromZonedTime(new Date(editForm.scheduled_at), tz);
      const res = await fetch(`/api/sessions/${conflict.session_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_at: utc.toISOString(),
          duration_minutes: editForm.duration_minutes,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        alert(d?.error ?? 'Edit failed');
        return;
      }
      markConflictResolved(conflict.session_id);
      setEditingConflictId(null);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleReplaceConflict(conflict: ConflictItem) {
    if (!tutorData) return;
    if (!window.confirm('This will cancel the existing session and create a new one matching the recurring schedule. Continue?')) return;
    setReplacingConflictId(conflict.session_id);
    try {
      const body: any = { cancel_session_id: conflict.session_id };
      if (conflict.kind === 'aligned') {
        body.new_session = {
          tutor_id: tutorData.tutor.id,
          student_id: conflict.student_id,
          scheduled_at: conflict.scheduled_at,
          duration_minutes: conflict.duration_minutes,
        };
      }
      const res = await fetch('/api/admin/schedule-builder/replace-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        alert(d?.error ?? 'Replace failed');
        return;
      }
      markConflictResolved(conflict.session_id);
    } finally {
      setReplacingConflictId(null);
    }
  }

  async function handleAdvanceAfterConflicts() {
    if (!tutorData) return;
    const unresolved = (materializeResult?.conflicts ?? []).filter(c => !resolvedConflictIds.has(c.session_id));
    if (unresolved.length > 0) {
      if (!window.confirm(`Continue with ${unresolved.length} unresolved conflict${unresolved.length !== 1 ? 's' : ''}?`)) return;
      // Batch-flag unresolved conflicts
      await Promise.all(unresolved.map(conflict =>
        fetch('/api/admin/schedule-builder/flags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tutor_id: tutorData.tutor.id,
            flag_type: 'conflict_unresolved',
            flag_data: {
              session_id: conflict.session_id,
              student_id: conflict.student_id,
              scheduled_at: conflict.scheduled_at,
              student_name: conflict.student_name,
              kind: conflict.kind,
            },
          }),
        }).catch(() => {})
      ));
    }
    setMaterializeResult(null);
    if (currentIndex < queue.length - 1) setCurrentIndex(i => i + 1);
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  function handleSkip() {
    if (currentIndex < queue.length - 1) setCurrentIndex(i => i + 1);
  }

  async function handleMarkInactive() {
    const tutor = queue[currentIndex];
    if (!tutor) return;
    if (!window.confirm(`Mark ${tutor.name} inactive? They'll be hidden from the queue.`)) return;
    setMarkingInactive(true);
    try {
      await fetch(`/api/admin/tutors/${tutor.tutor_id}/mark-inactive`, { method: 'POST' });
      setQueue(prev => prev.filter((_, i) => i !== currentIndex));
      setCurrentIndex(i => Math.min(i, queue.length - 2));
    } finally {
      setMarkingInactive(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (queueLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </AdminLayout>
    );
  }

  if (queue.length === 0) {
    return (
      <AdminLayout>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Schedule Builder</h1>
        <p className="text-gray-500">No active tutors with signed contracts found.</p>
      </AdminLayout>
    );
  }

  const currentTutor = queue[currentIndex];
  const isLast = currentIndex >= queue.length - 1;
  const isFirst = currentIndex === 0;

  // Alphabetical tutor list for jump-to dropdown (maps name → queue index)
  const sortedTutorOptions = queue
    .map((t, i) => ({ ...t, queueIndex: i }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule Builder</h1>
          <div className="flex items-center gap-3 mt-1">
            <select
              value={currentIndex}
              onChange={e => setCurrentIndex(Number(e.target.value))}
              className="input text-sm py-1 pr-8"
              disabled={tutorLoading}
            >
              {sortedTutorOptions.map(t => (
                <option key={t.tutor_id} value={t.queueIndex}>
                  {t.name} · {t.status === 'processed' ? '✓' : '⚠'}
                </option>
              ))}
            </select>
            <span className="text-gray-400 text-xs">
              {currentIndex + 1} of {queue.length}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSkip}
            disabled={isLast || tutorLoading}
            className="btn-secondary text-sm"
          >
            <SkipForward className="w-4 h-4" /> Skip
          </button>
          <button
            onClick={handleMarkInactive}
            disabled={markingInactive || tutorLoading}
            className="btn-secondary text-sm text-red-600 border-red-200 hover:bg-red-50"
          >
            <UserX className="w-4 h-4" />
            {markingInactive ? 'Marking…' : 'Mark Inactive'}
          </button>
        </div>
      </div>

      {/* Tutor Card */}
      {tutorLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : tutorData ? (
        <div className="space-y-6">
          {/* Tutor info banner */}
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{tutorData.tutor.name}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{tutorData.tutor.email}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-700">
                  {tutorData.tutor.timezone ?? 'No timezone set'}
                </p>
                {tutorData.tutor.hourly_rate != null && (
                  <p className="text-xs text-gray-400">${tutorData.tutor.hourly_rate}/hr</p>
                )}
              </div>
            </div>
          </div>

          {/* Contracts section with inline schedule forms */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">
              Students from contracts ({tutorData.contracts.length})
            </h3>
            {tutorData.contracts.length === 0 ? (
              <p className="text-sm text-gray-400">No signed contracts.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {tutorData.contracts.map(c => (
                  <div key={c.id}>
                    {/* Contract row */}
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-sm font-medium text-gray-800">{c.student_name}</span>
                      <button
                        onClick={() => openFormStudentId === c.student_id ? closeScheduleForm() : openScheduleForm(c.student_id)}
                        className="text-xs font-medium text-navy-600 hover:text-navy-800 inline-flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add Schedule
                      </button>
                    </div>

                    {/* Inline schedule entry form */}
                    {openFormStudentId === c.student_id && (
                      <div className="bg-gray-50 rounded-lg p-4 mb-3 border border-gray-200">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                          Add schedule for {c.student_name}
                        </p>

                        {/* Days chips */}
                        <div className="mb-3">
                          <label className="label text-xs">Days</label>
                          <div className="flex gap-1.5">
                            {DAY_NAMES.map((name, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => toggleDay(i)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                  i in formTimesByDay
                                    ? 'bg-navy-900 text-white'
                                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                                }`}
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Per-day time inputs */}
                        {selectedDays.length > 0 && (
                          <div className="mb-3 space-y-1.5">
                            {selectedDays.map(day => (
                              <div key={day} className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-600 w-8">{DAY_NAMES[day]}</span>
                                <input
                                  type="time"
                                  value={formTimesByDay[day] ?? ''}
                                  onChange={e => setDayTime(day, e.target.value)}
                                  className="input text-sm w-32"
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Timezone + Duration row */}
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="label text-xs">Timezone</label>
                            <select
                              value={formTimezone}
                              onChange={e => setFormTimezone(e.target.value)}
                              className="input text-sm"
                            >
                              {TIMEZONES.map(tz => (
                                <option key={tz.value} value={tz.value}>{tz.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="label text-xs">Duration</label>
                            <select
                              value={formDuration}
                              onChange={e => setFormDuration(Number(e.target.value))}
                              className="input text-sm"
                            >
                              {DURATIONS.map(d => (
                                <option key={d} value={d}>{d} min</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Start date + Notes row */}
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="label text-xs">Started recurring on</label>
                            <input
                              type="date"
                              value={formStartDate}
                              onChange={e => setFormStartDate(e.target.value)}
                              className="input text-sm"
                            />
                          </div>
                          <div>
                            <label className="label text-xs">Notes (optional)</label>
                            <input
                              type="text"
                              value={formNotes}
                              onChange={e => setFormNotes(e.target.value)}
                              className="input text-sm"
                              placeholder="e.g. alternating weeks"
                            />
                          </div>
                        </div>

                        {formError && <p className="text-red-600 text-xs mb-2">{formError}</p>}

                        <div className="flex gap-2">
                          <button onClick={closeScheduleForm} className="btn-secondary text-xs px-3 py-1.5">
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveSchedule}
                            disabled={formSaving}
                            className="btn-primary text-xs px-3 py-1.5"
                          >
                            {formSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            {formSaving ? 'Saving…' : `Save Schedule (${selectedDays.length} day${selectedDays.length !== 1 ? 's' : ''})`}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add student not in contracts */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Add student not in contracts</h3>
            {allStudentsError ? (
              <div className="flex items-center gap-2">
                <p className="text-sm text-red-500">Could not load students.</p>
                <button
                  onClick={() => {
                    setAllStudentsError(false);
                    fetch('/api/admin/schedule-builder/all-students')
                      .then(r => r.ok ? r.json() : Promise.reject())
                      .then(data => { setAllStudents(Array.isArray(data) ? data : []); })
                      .catch(() => setAllStudentsError(true));
                  }}
                  className="text-xs font-medium text-navy-600 hover:text-navy-800"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={addStudentQuery}
                      onChange={e => handleAddStudentInputChange(e.target.value)}
                      onFocus={() => { if (addStudentQuery.length >= 2) setAddStudentDropdownOpen(true); }}
                      onBlur={() => setTimeout(() => setAddStudentDropdownOpen(false), 200)}
                      placeholder="Search students by name..."
                      className="input text-sm w-full"
                    />
                    {addStudentDropdownOpen && addStudentMatches.length > 0 && (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {addStudentMatches.map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => handleSelectStudent(s)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {addStudentDropdownOpen && addStudentQuery.length >= 2 && addStudentMatches.length === 0 && (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2">
                        <p className="text-sm text-gray-400">No matching students</p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleAssignStudent}
                    disabled={!addStudentSelected || addStudentSaving}
                    className="btn-primary text-sm px-4 disabled:opacity-50"
                  >
                    {addStudentSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Assign
                  </button>
                </div>
                {addStudentMsg && <p className="text-green-600 text-xs mt-2">{addStudentMsg}</p>}
                {addStudentError && <p className="text-red-600 text-xs mt-2">{addStudentError}</p>}
              </div>
            )}
          </div>

          {/* Schedules entered */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">
              Schedules entered ({tutorData.schedules.length})
            </h3>
            {tutorData.schedules.length === 0 ? (
              <p className="text-sm text-gray-400">No schedules entered yet.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {tutorData.schedules.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-2.5">
                    <span className="text-sm text-gray-800">
                      <span className="font-medium">{DAY_NAMES[s.day_of_week]}</span>{' '}
                      {s.time_local.slice(0, 5)} {s.timezone} · {s.student_name} · {s.duration_minutes}min
                      {s.recurring_started_on && (
                        <span className="text-gray-400"> · since {s.recurring_started_on}</span>
                      )}
                    </span>
                    <button
                      onClick={() => handleDeleteSchedule(s.id)}
                      disabled={deletingScheduleId === s.id}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      title="Remove schedule"
                    >
                      {deletingScheduleId === s.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <X className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Materialize result + conflict banner */}
          {materializeResult && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="card p-4 bg-blue-50 border-blue-200">
                <p className="text-sm font-medium text-blue-900">
                  {materializeResult.created} scheduled · {materializeResult.skipped_dupes} skipped (already exist) · {materializeResult.deleted_stale} previous tool sessions cleared
                </p>
                {materializeResult.conflicts.length === 0 && (
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-blue-600">No conflicts found.</p>
                    <button
                      onClick={() => {
                        setMaterializeResult(null);
                        if (currentIndex < queue.length - 1) setCurrentIndex(i => i + 1);
                      }}
                      className="btn-primary text-xs px-3 py-1.5"
                    >
                      Continue to next tutor <ChevronRight className="w-3 h-3 inline ml-0.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Conflict cards */}
              {materializeResult.conflicts.filter(c => !resolvedConflictIds.has(c.session_id)).length > 0 && (
                <div className="card p-5 border-amber-200 bg-amber-50">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <h3 className="font-semibold text-amber-900">
                      {materializeResult.conflicts.filter(c => !resolvedConflictIds.has(c.session_id)).length} conflict{materializeResult.conflicts.filter(c => !resolvedConflictIds.has(c.session_id)).length !== 1 ? 's' : ''} found
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {materializeResult.conflicts
                      .filter(c => !resolvedConflictIds.has(c.session_id))
                      .map(conflict => {
                        const tz = tutorData?.tutor.timezone ?? 'UTC';
                        let displayTime = conflict.scheduled_at;
                        try {
                          displayTime = format(new Date(conflict.scheduled_at), 'EEE MMM d, h:mm a', { timeZone: tz });
                        } catch { /* fallback to ISO */ }

                        return (
                          <div key={conflict.session_id} className="bg-white rounded-lg border border-amber-200 p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <p className="text-sm font-medium text-gray-900">{conflict.student_name}</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {displayTime} · {conflict.duration_minutes}min
                                </p>
                              </div>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                conflict.kind === 'aligned'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-orange-100 text-orange-700'
                              }`}>
                                {conflict.kind}
                              </span>
                            </div>

                            {/* Edit form (inline) */}
                            {editingConflictId === conflict.session_id && (
                              <div className="mt-3 mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                {editDisabledReason ? (
                                  <p className="text-sm text-red-600">{editDisabledReason}</p>
                                ) : (
                                  <div className="space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="label text-xs">Date & Time ({tz})</label>
                                        <input
                                          type="datetime-local"
                                          value={editForm.scheduled_at}
                                          onChange={e => setEditForm(f => ({ ...f, scheduled_at: e.target.value }))}
                                          className="input text-sm"
                                        />
                                      </div>
                                      <div>
                                        <label className="label text-xs">Duration (min)</label>
                                        <select
                                          value={editForm.duration_minutes}
                                          onChange={e => setEditForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))}
                                          className="input text-sm"
                                        >
                                          {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
                                        </select>
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <button onClick={() => setEditingConflictId(null)} className="btn-secondary text-xs px-3 py-1">Cancel</button>
                                      <button
                                        onClick={() => handleSaveEdit(conflict)}
                                        disabled={editSaving}
                                        className="btn-primary text-xs px-3 py-1"
                                      >
                                        {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => handleKeepExisting(conflict)}
                                className="text-xs font-medium text-gray-600 hover:text-gray-800 px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                              >
                                Keep existing
                              </button>
                              <button
                                onClick={() => handleEditConflict(conflict)}
                                disabled={editingConflictId === conflict.session_id && !!editDisabledReason}
                                className="text-xs font-medium text-navy-600 hover:text-navy-800 px-2 py-1 rounded border border-navy-200 hover:bg-navy-50 disabled:opacity-50"
                                title={editingConflictId === conflict.session_id && editDisabledReason ? editDisabledReason : undefined}
                              >
                                <Pencil className="w-3 h-3 inline mr-0.5" /> Edit
                              </button>
                              <button
                                onClick={() => handleReplaceConflict(conflict)}
                                disabled={replacingConflictId === conflict.session_id}
                                className="text-xs font-medium text-red-600 hover:text-red-800 px-2 py-1 rounded border border-red-200 hover:bg-red-50 disabled:opacity-50"
                              >
                                {replacingConflictId === conflict.session_id
                                  ? <Loader2 className="w-3 h-3 animate-spin inline mr-0.5" />
                                  : <RefreshCw className="w-3 h-3 inline mr-0.5" />}
                                Replace with new
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Advance button */}
                  <div className="mt-4 flex justify-end">
                    <button onClick={handleAdvanceAfterConflicts} className="btn-primary text-sm">
                      {materializeResult.conflicts.filter(c => !resolvedConflictIds.has(c.session_id)).length === 0
                        ? 'Advance'
                        : `Continue with ${materializeResult.conflicts.filter(c => !resolvedConflictIds.has(c.session_id)).length} unresolved →`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentIndex(i => i - 1)}
              disabled={isFirst || tutorLoading}
              className="btn-secondary"
            >
              <ChevronLeft className="w-4 h-4" /> Prev tutor
            </button>
            <button
              onClick={handleSaveAndNext}
              disabled={tutorLoading || materializing}
              className="btn-primary"
            >
              {materializing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Scheduling sessions...</>
                : <>Save & Next <ChevronRight className="w-4 h-4" /></>}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-gray-400 text-sm">Failed to load tutor data.</p>
      )}
    </AdminLayout>
  );
}
