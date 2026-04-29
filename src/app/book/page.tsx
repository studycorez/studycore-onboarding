'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import type { Student, Tutor, TutorAvailability, StudentAvailability } from '@/types';
import { format, addDays, startOfDay, parseISO, isSameDay } from 'date-fns';
import { CheckCircle, ChevronLeft, ChevronRight, Loader2, ExternalLink } from 'lucide-react';
import { DAY_NAMES, DAY_SHORT, formatTimeString, formatDateTime } from '@/lib/utils';
import Link from 'next/link';

type Step = 1 | 2 | 3 | 4 | 5;

interface BookingResult {
  sessionId: string;
  zoomJoinUrl?: string;
  zoomHostUrl?: string;
}

// ── Overlap helpers ───────────────────────────────────────────────────────────

function timeToMins(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minsToTimeStr(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return formatTimeString(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
}

function computeOverlaps(
  studentAvail: StudentAvailability[],
  tutorAvail: TutorAvailability[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const sa of studentAvail) {
    for (const ta of tutorAvail) {
      if (sa.day_of_week !== ta.day_of_week) continue;
      const oStart = Math.max(timeToMins(sa.start_time), timeToMins(ta.start_time));
      const oEnd   = Math.min(timeToMins(sa.end_time),   timeToMins(ta.end_time));
      if (oStart < oEnd) {
        const label = `${DAY_SHORT[sa.day_of_week]} ${minsToTimeStr(oStart)}–${minsToTimeStr(oEnd)}`;
        if (!seen.has(label)) { seen.add(label); result.push(label); }
      }
    }
  }
  return result;
}

export default function BookPage() {
  const supabase = createClient();
  const [step, setStep] = useState<Step>(1);
  const [students, setStudents] = useState<Student[]>([]);
  const [tutors, setTutors]     = useState<Tutor[]>([]);
  // Per-tutor availability (loaded for selected tutor in step 3)
  const [availability, setAvail]= useState<TutorAvailability[]>([]);
  const [bookedSlots, setBooked]= useState<string[]>([]);

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedTutor, setSelectedTutor]     = useState<Tutor | null>(null);
  const [selectedDate, setSelectedDate]       = useState<Date | null>(null);
  const [selectedTime, setSelectedTime]       = useState<string | null>(null);
  const [duration, setDuration]               = useState<30 | 60 | 90 | 120>(60);
  const [selectedTz, setSelectedTz]           = useState('America/New_York');

  const [loading, setLoading]           = useState(false);
  const [booking, setBooking]           = useState(false);
  const [result, setResult]             = useState<BookingResult | null>(null);
  const [hasSignedContract, setHasSignedContract] = useState<boolean | null>(null);

  // Smart matching state (loaded when student selected)
  const [studentAvailability, setStudentAvail]       = useState<StudentAvailability[]>([]);
  const [allTutorAvailability, setAllTutorAvail]     = useState<TutorAvailability[]>([]);
  const [tutorActiveCounts, setTutorActiveCounts]    = useState<Record<string, number>>({});
  const [assignedTutorIds, setAssignedTutorIds]      = useState<Set<string>>(new Set());
  const [matchLoading, setMatchLoading]              = useState(false);

  const [studentQuery, setStudentQuery] = useState('');
  const [viewWeekStart, setViewWeekStart] = useState(startOfDay(new Date()));

  useEffect(() => {
    supabase.from('students').select('*').order('name').then(r => setStudents(r.data ?? []));
    supabase.from('tutors').select('*').order('name').then(r => setTutors(r.data ?? []));
  }, []);

  // Set timezone from student record when student selected
  useEffect(() => {
    if (!selectedStudent) return;
    setSelectedTz((selectedStudent as any).timezone ?? 'America/New_York');
  }, [selectedStudent]);

  // Load matching data whenever student changes
  useEffect(() => {
    if (!selectedStudent) return;
    setMatchLoading(true);
    Promise.all([
      supabase.from('student_availability').select('*').eq('student_id', selectedStudent.id).eq('is_active', true),
      supabase.from('tutor_availability').select('*').eq('is_active', true),
      supabase.from('contracts').select('tutor_id').eq('status', 'signed'),
      supabase.from('contracts').select('tutor_id').eq('student_id', selectedStudent.id).eq('status', 'signed'),
    ]).then(([sa, ta, allContracts, assignedContracts]) => {
      setStudentAvail(sa.data ?? []);
      setAllTutorAvail(ta.data ?? []);
      const counts: Record<string, number> = {};
      for (const c of allContracts.data ?? []) {
        counts[(c as any).tutor_id] = (counts[(c as any).tutor_id] ?? 0) + 1;
      }
      setTutorActiveCounts(counts);
      setAssignedTutorIds(new Set((assignedContracts.data ?? []).map((c: any) => c.tutor_id)));
      setMatchLoading(false);
    });
  }, [selectedStudent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load per-tutor data for step 3 calendar
  useEffect(() => {
    if (!selectedTutor) return;
    supabase.from('tutor_availability').select('*').eq('tutor_id', selectedTutor.id).eq('is_active', true)
      .then(r => setAvail(r.data ?? []));
    supabase.from('sessions').select('scheduled_at, duration_minutes')
      .eq('tutor_id', selectedTutor.id)
      .in('status', ['scheduled'])
      .gte('scheduled_at', new Date().toISOString())
      .then(r => setBooked((r.data ?? []).map((s: any) => s.scheduled_at)));
    if (selectedStudent) {
      setHasSignedContract(null);
      supabase.from('contracts')
        .select('id')
        .eq('tutor_id', selectedTutor.id)
        .eq('student_id', selectedStudent.id)
        .eq('status', 'signed')
        .maybeSingle()
        .then(r => setHasSignedContract(!!r.data));
    }
  }, [selectedTutor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate available slots for the week view
  function getSlotsForDay(date: Date): string[] {
    const dow = date.getDay();
    const slots: string[] = [];
    availability.filter(a => a.day_of_week === dow).forEach(a => {
      const [sh, sm] = a.start_time.split(':').map(Number);
      const [eh, em] = a.end_time.split(':').map(Number);
      let h = sh, m = sm;
      while (h * 60 + m + duration <= eh * 60 + em) {
        const timeStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
        const isBooked = bookedSlots.some(b => {
          const bd = parseISO(b);
          return bd.toISOString().startsWith(date.toISOString().slice(0,10)) && format(bd,'HH:mm') === timeStr;
        });
        if (!isBooked) slots.push(timeStr);
        m += 30;
        if (m >= 60) { h += 1; m -= 60; }
      }
    });
    return slots;
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(viewWeekStart, i));

  async function handleBook() {
    if (!selectedStudent || !selectedTutor || !selectedDate || !selectedTime) return;
    setBooking(true);
    const [h, m] = selectedTime.split(':').map(Number);
    const scheduledAt = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), h, m).toISOString();
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tutor_id: selectedTutor.id, student_id: selectedStudent.id, scheduled_at: scheduledAt, duration_minutes: duration }),
    });
    const data = await res.json();
    if (res.ok) {
      setResult({ sessionId: data.id, zoomJoinUrl: data.zoom_join_url, zoomHostUrl: data.zoom_host_url });
      setStep(5);
    }
    setBooking(false);
  }

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(studentQuery.toLowerCase()) ||
    s.email.toLowerCase().includes(studentQuery.toLowerCase())
  );

  // Sort tutors for Step 2: assigned first, then by overlap count desc
  const sortedTutors = [...tutors].sort((a, b) => {
    const aAssigned = assignedTutorIds.has(a.id) ? 1 : 0;
    const bAssigned = assignedTutorIds.has(b.id) ? 1 : 0;
    if (aAssigned !== bAssigned) return bAssigned - aAssigned;
    const aOverlap = computeOverlaps(studentAvailability, allTutorAvailability.filter(t => t.tutor_id === a.id)).length;
    const bOverlap = computeOverlaps(studentAvailability, allTutorAvailability.filter(t => t.tutor_id === b.id)).length;
    return bOverlap - aOverlap;
  });

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Book a Session</h1>
        <p className="text-gray-500 text-sm mt-1">Create a new tutoring session in a few steps.</p>
      </div>

      {/* Progress Steps */}
      {step < 5 && (
        <div className="flex items-center gap-3 mb-8">
          {(['Student', 'Tutor', 'Date & Time', 'Confirm'] as const).map((label, i) => {
            const s = (i + 1) as Step;
            const active = step === s;
            const done = step > s;
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${done ? 'bg-green-500 text-white' : active ? 'bg-navy-900 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {done ? '✓' : s}
                </div>
                <span className={`text-sm font-medium ${active ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
                {i < 3 && <div className="w-8 h-px bg-gray-200 mx-1" />}
              </div>
            );
          })}
        </div>
      )}

      <div className="card p-6 max-w-3xl">
        {/* Step 1: Select Student */}
        {step === 1 && (
          <div>
            <h2 className="font-semibold text-gray-900 mb-4">Select Student</h2>
            <input
              value={studentQuery}
              onChange={e => setStudentQuery(e.target.value)}
              placeholder="Search students…"
              className="input mb-3"
            />
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredStudents.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedStudent(s); setHasSignedContract(null); setStep(2); }}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-navy-400 hover:bg-navy-50 transition-colors"
                >
                  <p className="font-medium text-gray-900">{s.name}</p>
                  <p className="text-sm text-gray-500">{s.email} {s.grade ? `· Grade ${s.grade}` : ''} {s.target_score ? `· Target: ${s.target_score}` : ''}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Select Tutor (with smart matching) */}
        {step === 2 && (
          <div>
            <h2 className="font-semibold text-gray-900 mb-1">Select Tutor</h2>
            <p className="text-sm text-gray-500 mb-4">Student: <strong>{selectedStudent?.name}</strong></p>

            {/* No availability warning */}
            {!matchLoading && studentAvailability.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 mb-4">
                No availability set for <strong>{selectedStudent?.name}</strong>.{' '}
                <Link href={`/students/${selectedStudent?.id}`} className="underline font-medium">
                  Set availability →
                </Link>{' '}
                Showing all tutors.
              </div>
            )}

            {matchLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {sortedTutors.map(t => {
                  const tutorSlots = allTutorAvailability.filter(ta => ta.tutor_id === t.id);
                  const overlaps   = computeOverlaps(studentAvailability, tutorSlots);
                  const isAssigned = assignedTutorIds.has(t.id);
                  const activeCount = tutorActiveCounts[t.id] ?? 0;
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedTutor(t); setStep(3); }}
                      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-navy-400 hover:bg-navy-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">{t.name}</p>
                          <p className="text-sm text-gray-500">
                            {t.subjects.join(', ')} · ${t.hourly_rate}/hr · {activeCount} active student{activeCount !== 1 ? 's' : ''}
                          </p>
                          {studentAvailability.length > 0 && overlaps.length > 0 && (
                            <p className="text-xs text-blue-600 mt-1">
                              Available: {overlaps.slice(0, 3).join(', ')}{overlaps.length > 3 ? ` +${overlaps.length - 3} more` : ''}
                            </p>
                          )}
                          {studentAvailability.length > 0 && overlaps.length === 0 && (
                            <p className="text-xs text-gray-400 mt-1">No overlapping availability</p>
                          )}
                        </div>
                        {isAssigned && (
                          <span className="flex-shrink-0 text-xs font-semibold bg-green-100 text-green-800 border border-green-200 rounded-full px-2 py-0.5">
                            Already assigned
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <button onClick={() => setStep(1)} className="btn-secondary mt-4"><ChevronLeft className="w-4 h-4" /> Back</button>
          </div>
        )}

        {/* Step 3: Pick Date & Time */}
        {step === 3 && (
          <div>
            <h2 className="font-semibold text-gray-900 mb-1">Pick Date & Time</h2>
            <p className="text-sm text-gray-500 mb-4">
              Tutor: <strong>{selectedTutor?.name}</strong> · Duration:&nbsp;
              {([30, 60, 90, 120] as const).map(d => (
                <button key={d} onClick={() => { setDuration(d); setSelectedTime(null); }}
                  className={`mx-1 px-2 py-0.5 rounded text-xs font-medium border ${duration === d ? 'bg-navy-900 text-white border-navy-900' : 'border-gray-300 text-gray-600 hover:border-navy-400'}`}>
                  {d} min
                </button>
              ))}
            </p>

            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <button onClick={() => setViewWeekStart(d => addDays(d,-7))} className="p-1.5 rounded hover:bg-gray-100"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-medium text-gray-700 flex-1">
                {format(viewWeekStart,'MMM d')} – {format(addDays(viewWeekStart,6),'MMM d, yyyy')}
              </span>
              <select
                value={selectedTz}
                onChange={e => setSelectedTz(e.target.value)}
                className="input text-xs py-1 w-auto"
                title="Timezone"
              >
                {[
                  { label: 'EST', value: 'America/New_York' },
                  { label: 'CST', value: 'America/Chicago' },
                  { label: 'MST', value: 'America/Denver' },
                  { label: 'PST', value: 'America/Los_Angeles' },
                  { label: 'GMT', value: 'Europe/London' },
                  { label: 'IST', value: 'Asia/Kolkata' },
                ].map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
              <button onClick={() => setViewWeekStart(d => addDays(d,7))} className="p-1.5 rounded hover:bg-gray-100"><ChevronRight className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {weekDays.map(day => {
                const slots = getSlotsForDay(day);
                const isPast = day < startOfDay(new Date());
                return (
                  <div key={day.toISOString()} className={`rounded-lg p-2 ${isPast ? 'opacity-40' : ''}`}>
                    <div className={`text-center mb-1.5 ${isSameDay(day, new Date()) ? 'text-navy-700' : ''}`}>
                      <p className="text-xs text-gray-400">{DAY_NAMES[day.getDay()].slice(0,3)}</p>
                      <p className="text-sm font-semibold">{format(day,'d')}</p>
                    </div>
                    <div className="space-y-1">
                      {slots.length === 0 && <p className="text-xs text-gray-300 text-center">—</p>}
                      {slots.map(t => {
                        const selected = selectedDate && isSameDay(selectedDate, day) && selectedTime === t;
                        return (
                          <button
                            key={t}
                            disabled={isPast}
                            onClick={() => { setSelectedDate(day); setSelectedTime(t); }}
                            className={`w-full text-xs py-1 rounded text-center font-medium transition-colors ${selected ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-700 hover:bg-navy-100'}`}
                          >
                            {formatTimeString(t)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setStep(2)} className="btn-secondary"><ChevronLeft className="w-4 h-4" /> Back</button>
              <button disabled={!selectedDate || !selectedTime} onClick={() => setStep(4)} className="btn-primary">
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 4 && selectedDate && selectedTime && (
          <div>
            <h2 className="font-semibold text-gray-900 mb-4">Confirm Booking</h2>
            <div className="bg-navy-50 border border-navy-200 rounded-xl p-5 space-y-3 mb-6">
              <Row label="Student"     value={selectedStudent?.name ?? ''} />
              <Row label="Tutor"       value={selectedTutor?.name ?? ''} />
              <Row label="Date & Time" value={formatDateTime(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), ...selectedTime.split(':').map(Number) as [number, number]).toISOString())} />
              <Row label="Duration"    value={`${duration} minutes`} />
              <Row label="Rate"        value={`$${(selectedTutor!.hourly_rate * duration / 60).toFixed(2)}`} />
            </div>
            <p className="text-sm text-gray-500 mb-5">Booking will automatically create a Zoom meeting and send confirmation emails to the student, parent, and tutor.</p>
            {hasSignedContract === false ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                <strong>Contract required.</strong> A signed contract must exist between{' '}
                <strong>{selectedTutor?.name}</strong> and <strong>{selectedStudent?.name}</strong> before
                booking. Go to the tutor&apos;s profile to send a contract.
              </div>
            ) : null}
            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="btn-secondary"><ChevronLeft className="w-4 h-4" /> Back</button>
              <button
                onClick={handleBook}
                disabled={booking || hasSignedContract === false || hasSignedContract === null}
                className="btn-primary"
              >
                {booking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {booking ? 'Booking…' : hasSignedContract === null ? 'Checking contract…' : 'Confirm & Book'}
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Confirmation */}
        {step === 5 && result && (
          <div className="text-center py-6">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Session Booked!</h2>
            <p className="text-gray-500 mb-6">Confirmation emails have been sent to the student, parent, and tutor.</p>
            {result.zoomJoinUrl && (
              <div className="space-y-2 mb-6">
                <a href={result.zoomJoinUrl} target="_blank" rel="noopener" className="btn-primary inline-flex mx-auto">
                  <ExternalLink className="w-4 h-4" /> Join Link
                </a>
                {result.zoomHostUrl && (
                  <a href={result.zoomHostUrl} target="_blank" rel="noopener" className="btn-secondary inline-flex mx-auto ml-2">
                    <ExternalLink className="w-4 h-4" /> Host Link
                  </a>
                )}
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <button onClick={() => { setStep(1); setSelectedStudent(null); setSelectedTutor(null); setSelectedDate(null); setSelectedTime(null); setResult(null); setStudentAvail([]); setAssignedTutorIds(new Set()); }} className="btn-primary">
                Book Another
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-sm text-navy-600 font-medium">{label}</span>
      <span className="text-sm text-navy-900 font-semibold">{value}</span>
    </div>
  );
}
