'use client';

import { useEffect, useRef, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { format, parseISO } from 'date-fns';
import { CalendarRange, ChevronDown, X } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Person { id: string; name: string; }

interface BookingResult {
  booked: { id: string; scheduled_at: string; zoom_join_url: string | null }[];
  skipped: { date: string; reason: string }[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
const DAYS = [
  { label: 'Sun', value: 0 }, { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 }, { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

// ── Searchable dropdown ───────────────────────────────────────────────────────
function Combobox({
  placeholder, options, selected, onSelect, disabled = false,
}: {
  placeholder: string;
  options: Person[];
  selected: Person | null;
  onSelect: (p: Person | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  const filtered = options.filter(o =>
    o.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={ref} className="relative">
      <div
        className={`input flex items-center justify-between cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => { if (!disabled) { setOpen(o => !o); setQuery(''); } }}
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected?.name ?? placeholder}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {selected && !disabled && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onSelect(null); setQuery(''); }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </div>
      </div>
      {open && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full px-2 py-1.5 text-sm outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-400">No results</p>
            ) : filtered.map(o => (
              <button
                key={o.id}
                type="button"
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${selected?.id === o.id ? 'text-navy-700 font-medium' : 'text-gray-700'}`}
                onClick={() => { onSelect(o); setOpen(false); setQuery(''); }}
              >
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Date generation (client-side, timezone-aware) ─────────────────────────────
function generateScheduledAts(
  startDate: string, endDate: string, daysOfWeek: number[], time: string,
): string[] {
  if (!startDate || !endDate || daysOfWeek.length === 0 || !time) return [];
  const [h, m] = time.split(':').map(Number);
  const result: string[] = [];
  const end = new Date(endDate + 'T23:59:59');
  const cur = new Date(startDate + 'T00:00:00');
  while (cur <= end) {
    if (daysOfWeek.includes(cur.getDay())) {
      const dt = new Date(cur);
      dt.setHours(h, m, 0, 0);
      result.push(dt.toISOString());
    }
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BookRecurringPage() {
  const supabase = createClient();

  // Data
  const [students, setStudents]       = useState<Person[]>([]);
  const [tutors, setTutors]           = useState<Person[]>([]);
  const [tutorsLoading, setTutorsLoading] = useState(false);

  // Selections
  const [student, setStudent]         = useState<Person | null>(null);
  const [tutor, setTutor]             = useState<Person | null>(null);
  const [startDate, setStartDate]     = useState('');
  const [endDate, setEndDate]         = useState('');
  const [daysOfWeek, setDaysOfWeek]   = useState<number[]>([1, 3, 5]); // Mon/Wed/Fri default
  const [time, setTime]               = useState('15:00');
  const [duration, setDuration]       = useState(60);

  // Preview & booking
  const [preview, setPreview]         = useState<string[] | null>(null);
  const [booking, setBooking]         = useState(false);
  const [result, setResult]           = useState<BookingResult | null>(null);
  const [bookingError, setBookingError] = useState('');

  // Load students once
  useEffect(() => {
    supabase.from('students').select('id, name').order('name').then(({ data }) => {
      setStudents(data ?? []);
    });
  }, []);

  // When student changes, load their tutors (via signed contracts)
  useEffect(() => {
    if (!student) { setTutors([]); setTutor(null); return; }
    setTutorsLoading(true);
    setTutor(null);
    supabase
      .from('contracts')
      .select('tutor_id, tutor:tutors(id, name)')
      .eq('student_id', student.id)
      .eq('status', 'signed')
      .then(({ data }) => {
        const seen = new Set<string>();
        const list: Person[] = [];
        for (const row of data ?? []) {
          const t = (row as any).tutor;
          if (t && !seen.has(t.id)) { seen.add(t.id); list.push({ id: t.id, name: t.name }); }
        }
        setTutors(list);
        setTutorsLoading(false);
      });
  }, [student]);

  // Recompute preview whenever inputs change
  useEffect(() => {
    setPreview(null);
    setResult(null);
  }, [student, tutor, startDate, endDate, daysOfWeek, time, duration]);

  function toggleDay(d: number) {
    setDaysOfWeek(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  }

  function handlePreview() {
    const ats = generateScheduledAts(startDate, endDate, daysOfWeek, time);
    setPreview(ats);
    setResult(null);
  }

  async function handleBook() {
    if (!student || !tutor || !preview?.length) return;
    setBooking(true);
    setBookingError('');
    try {
      const res = await fetch('/api/sessions/bulk-recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id:     student.id,
          tutor_id:       tutor.id,
          scheduled_ats:  preview,
          duration_minutes: duration,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setBookingError(data.error ?? `Error ${res.status}`); return; }
      setResult(data);
      setPreview(null);
    } catch {
      setBookingError('Network error — please try again.');
    } finally {
      setBooking(false);
    }
  }

  const canPreview = !!(student && tutor && startDate && endDate && daysOfWeek.length && time);

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recurring Sessions</h1>
          <p className="text-gray-500 text-sm mt-1">
            Book a recurring session schedule for a student — creates Zoom meetings and sends confirmation emails for each.
          </p>
        </div>
        <CalendarRange className="w-8 h-8 text-navy-300" />
      </div>

      {/* ── Configuration card ───────────────────────────────────────────────── */}
      <div className="card p-6 mb-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Session Configuration</h2>

        {/* Student + Tutor */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Student</label>
            <Combobox
              placeholder="Select student…"
              options={students}
              selected={student}
              onSelect={s => { setStudent(s); }}
            />
          </div>
          <div>
            <label className="label">Tutor {tutorsLoading && <span className="text-gray-400 font-normal">(loading…)</span>}</label>
            <Combobox
              placeholder={student ? (tutors.length === 0 && !tutorsLoading ? 'No signed tutors' : 'Select tutor…') : 'Select student first'}
              options={tutors}
              selected={tutor}
              onSelect={setTutor}
              disabled={!student || tutors.length === 0}
            />
            {student && !tutorsLoading && tutors.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">No signed contracts found for this student.</p>
            )}
          </div>
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">End Date</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {/* Days of week */}
        <div className="mb-4">
          <label className="label">Days of Week</label>
          <div className="flex gap-2">
            {DAYS.map(d => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  daysOfWeek.includes(d.value)
                    ? 'bg-navy-700 text-white border-navy-700'
                    : 'text-gray-600 border-gray-200 hover:border-navy-300 hover:text-navy-700'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Time + Duration */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="label">Session Time</label>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Duration</label>
            <select
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              className="input"
            >
              <option value={60}>60 minutes</option>
              <option value={90}>90 minutes</option>
              <option value={120}>120 minutes</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={handlePreview}
          disabled={!canPreview}
          className="btn-secondary"
        >
          Generate Preview
        </button>
      </div>

      {/* ── Preview card ────────────────────────────────────────────────────── */}
      {preview !== null && (
        <div className="card p-6 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Preview — {preview.length} session{preview.length !== 1 ? 's' : ''} will be created
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {student?.name} with {tutor?.name} · {duration} min each
              </p>
            </div>
            {preview.length > 0 && (
              <button
                type="button"
                onClick={handleBook}
                disabled={booking}
                className="btn-primary"
              >
                {booking ? 'Booking…' : `Book All ${preview.length} Sessions`}
              </button>
            )}
          </div>

          {bookingError && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {bookingError}
            </div>
          )}

          {preview.length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              No dates fall on the selected days within the chosen date range.
            </p>
          ) : (
            <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto -mx-6 px-6">
              {preview.map(iso => (
                <div key={iso} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-gray-900 font-medium">
                    {format(parseISO(iso), "EEEE, MMM d, yyyy")}
                  </span>
                  <span className="text-gray-500">
                    {format(parseISO(iso), "h:mm a")} · {duration} min
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Result card ─────────────────────────────────────────────────────── */}
      {result && (
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Booking Complete</h2>

          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4">
              <p className="text-xs text-green-600 mb-1">Sessions Booked</p>
              <p className="text-3xl font-bold text-green-700">{result.booked.length}</p>
            </div>
            <div className={`border rounded-xl px-5 py-4 ${result.skipped.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
              <p className={`text-xs mb-1 ${result.skipped.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>Skipped (Conflicts)</p>
              <p className={`text-3xl font-bold ${result.skipped.length > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{result.skipped.length}</p>
            </div>
          </div>

          {result.skipped.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Skipped Sessions</h3>
              <div className="divide-y divide-gray-50">
                {result.skipped.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-gray-700">
                      {format(parseISO(s.date), "EEEE, MMM d, yyyy 'at' h:mm a")}
                    </span>
                    <span className="text-amber-600 text-xs">{s.reason}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setResult(null);
              setPreview(null);
              setStudent(null);
              setTutor(null);
              setStartDate('');
              setEndDate('');
              setDaysOfWeek([1, 3, 5]);
              setTime('15:00');
              setDuration(60);
            }}
            className="btn-secondary mt-5"
          >
            Book Another Schedule
          </button>
        </div>
      )}
    </AdminLayout>
  );
}
