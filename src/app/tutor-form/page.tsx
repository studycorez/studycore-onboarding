'use client';

import { useState, Fragment } from 'react';
import { BookOpen, CheckCircle, Loader2, Plus, X, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS = [
  { label: 'Monday',    short: 'Mon', dbDay: 1 },
  { label: 'Tuesday',   short: 'Tue', dbDay: 2 },
  { label: 'Wednesday', short: 'Wed', dbDay: 3 },
  { label: 'Thursday',  short: 'Thu', dbDay: 4 },
  { label: 'Friday',    short: 'Fri', dbDay: 5 },
  { label: 'Saturday',  short: 'Sat', dbDay: 6 },
  { label: 'Sunday',    short: 'Sun', dbDay: 0 },
];

const TIMEZONES = ['EST', 'CST', 'MST', 'PST'];
const STEP_LABELS = ['Your Info', 'Availability', 'Sessions', 'Confirm'];
const TOTAL_STEPS = STEP_LABELS.length;

// ── Types ─────────────────────────────────────────────────────────────────────

type TimeBlock = { id: string; start: string; end: string };
type DayState  = { enabled: boolean; blocks: TimeBlock[] };

type InfoState = {
  name: string;
  email: string;
  phone: string;
  bio: string;
  subjects: string[];
  timezone: string;
};

type SessionEntry = {
  id: string;
  studentName: string;
  studentEmail: string;
  days: number[];       // dbDay values
  startTime: string;
  endTime: string;
  timezone: string;
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function mkBlock(): TimeBlock {
  return { id: uid(), start: '09:00', end: '17:00' };
}

function mkSession(): SessionEntry {
  return { id: uid(), studentName: '', studentEmail: '', days: [], startTime: '16:00', endTime: '17:00', timezone: '' };
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-navy-500 focus:ring-offset-2',
        on ? 'bg-navy-900' : 'bg-gray-200',
      )}
      aria-checked={on}
      role="switch"
    >
      <span className={cn(
        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
        on ? 'translate-x-6' : 'translate-x-1',
      )} />
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TutorFormPage() {
  const [step, setStep]             = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState('');

  const [info, setInfo] = useState<InfoState>(() => {
    const detected = typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'America/Los_Angeles';
    const US_ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'];
    const timezone = US_ZONES.includes(detected) ? detected : 'America/Los_Angeles';
    return { name: '', email: '', phone: '', bio: '', subjects: [], timezone };
  });

  const [availability, setAvailability] = useState<DayState[]>(
    DAYS.map(() => ({ enabled: false, blocks: [mkBlock()] })),
  );

  const [sessions, setSessions] = useState<SessionEntry[]>([mkSession()]);

  // ── Availability helpers ─────────────────────────────────────────────────

  function toggleDay(idx: number) {
    setAvailability(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], enabled: !next[idx].enabled };
      return next;
    });
  }

  function addBlock(dayIdx: number) {
    setAvailability(prev => {
      const next = [...prev];
      next[dayIdx] = { ...next[dayIdx], blocks: [...next[dayIdx].blocks, mkBlock()] };
      return next;
    });
  }

  function removeBlock(dayIdx: number, blockIdx: number) {
    setAvailability(prev => {
      const next = [...prev];
      next[dayIdx] = { ...next[dayIdx], blocks: next[dayIdx].blocks.filter((_, i) => i !== blockIdx) };
      return next;
    });
  }

  function updateBlock(dayIdx: number, blockIdx: number, field: 'start' | 'end', value: string) {
    setAvailErr('');
    setAvailability(prev => {
      const next = [...prev];
      const blocks = [...next[dayIdx].blocks];
      blocks[blockIdx] = { ...blocks[blockIdx], [field]: value };
      next[dayIdx] = { ...next[dayIdx], blocks };
      return next;
    });
  }

  // ── Session helpers ──────────────────────────────────────────────────────

  function addSession() { setSessions(prev => [...prev, mkSession()]); }
  function removeSession(id: string) { setSessions(prev => prev.filter(s => s.id !== id)); }

  function updateSession<K extends keyof SessionEntry>(id: string, field: K, value: SessionEntry[K]) {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }

  function toggleSessionDay(id: string, dbDay: number) {
    setSessions(prev => prev.map(s => {
      if (s.id !== id) return s;
      const days = s.days.includes(dbDay) ? s.days.filter(d => d !== dbDay) : [...s.days, dbDay];
      return { ...s, days };
    }));
  }

  // ── Computed ─────────────────────────────────────────────────────────────

  const enabledDays = DAYS.filter((_, i) => availability[i].enabled);
  const totalBlocks = availability.reduce((s, d) => s + (d.enabled ? d.blocks.length : 0), 0);
  const filledSessions = sessions.filter(s => s.studentName.trim());

  function buildAvailSlots() {
    const slots: { day: number; start: string; end: string }[] = [];
    availability.forEach((day, idx) => {
      if (!day.enabled) return;
      day.blocks.forEach(b => slots.push({ day: DAYS[idx].dbDay, start: b.start, end: b.end }));
    });
    return slots;
  }

  function step1Valid() {
    return info.name.trim().length > 0 && info.email.trim().length > 0 && info.email.includes('@');
  }

  // Returns an error string if any enabled day has an invalid block, otherwise ''.
  function availabilityError(): string {
    for (let i = 0; i < DAYS.length; i++) {
      const day = availability[i];
      if (!day.enabled) continue;
      for (const block of day.blocks) {
        if (!block.start || !block.end) {
          return `${DAYS[i].label}: please fill in both start and end times.`;
        }
        if (block.end === '00:00') {
          return `${DAYS[i].label}: end time cannot be 12:00 AM (midnight). Use 11:59 PM (23:59) if you mean end of day.`;
        }
        if (block.end <= block.start) {
          return `${DAYS[i].label}: end time must be after start time (${block.start}–${block.end}).`;
        }
      }
    }
    return '';
  }

  const [availErr, setAvailErr] = useState('');

  // ── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/tutor-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:         info.name.trim(),
          email:        info.email.trim().toLowerCase(),
          phone:        info.phone.trim() || null,
          bio:          info.bio.trim() || null,
          subjects:     info.subjects.length > 0 ? info.subjects : null,
          timezone:     info.timezone,
          availability: buildAvailSlots(),
          sessions: filledSessions.map(s => ({
            studentName:  s.studentName.trim(),
            studentEmail: s.studentEmail.trim() || null,
            days:         s.days,
            startTime:    s.startTime,
            endTime:      s.endTime,
            timezone:     info.timezone,
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Submission failed');
      }
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success screen ───────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-navy-900 rounded-xl mb-3">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-navy-950">StudyCore</h1>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-9 h-9 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              You&apos;re all set, {info.name.split(' ')[0]}!
            </h2>
            <p className="text-gray-500 text-sm">
              Your profile and availability have been saved to StudyCore. We&apos;ll be in touch soon.
            </p>
            <p className="text-xs text-gray-400 mt-6">You can close this window.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-navy-900 rounded-lg flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-navy-950 text-sm">StudyCore</span>
            <span className="text-gray-300 mx-1">·</span>
            <span className="text-gray-500 text-sm">Tutor Onboarding</span>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1">
            {STEP_LABELS.map((label, i) => (
              <Fragment key={i}>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                    i + 1 < step    ? 'bg-green-500 text-white'
                    : i + 1 === step ? 'bg-navy-900 text-white'
                    : 'bg-gray-200 text-gray-500',
                  )}>
                    {i + 1 < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={cn(
                    'text-xs font-medium hidden sm:inline transition-colors',
                    i + 1 === step ? 'text-navy-900' : i + 1 < step ? 'text-green-600' : 'text-gray-400',
                  )}>
                    {label}
                  </span>
                </div>
                {i < TOTAL_STEPS - 1 && (
                  <div className={cn('flex-1 h-px transition-colors', i + 1 < step ? 'bg-green-400' : 'bg-gray-200')} />
                )}
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">

        {/* ── STEP 1: Your Info ── */}
        {step === 1 && (
          <>
            <div className="mb-2">
              <h2 className="text-lg font-bold text-gray-900">Your Info</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Tell us a little about yourself. We&apos;ll use this to set up your tutor profile.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
              <div>
                <label className="label">Full Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={info.name}
                  onChange={e => setInfo(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Alex Johnson"
                  className="input"
                  autoComplete="name"
                />
              </div>
              <div>
                <label className="label">Email <span className="text-red-400">*</span></label>
                <input
                  type="email"
                  value={info.email}
                  onChange={e => setInfo(f => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com"
                  className="input"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="label">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="tel"
                  value={info.phone}
                  onChange={e => setInfo(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(555) 123-4567"
                  className="input"
                  autoComplete="tel"
                />
              </div>
              <div>
                <label className="label">Test Types <span className="text-red-400">*</span></label>
                <p className="text-xs text-gray-500 mb-2">Which tests can you tutor? Select all that apply.</p>
                <div className="flex flex-wrap gap-2">
                  {(['SAT', 'ACT', 'PSAT'] as const).map(subject => {
                    const selected = info.subjects.includes(subject);
                    return (
                      <button
                        key={subject}
                        type="button"
                        onClick={() => setInfo(f => ({
                          ...f,
                          subjects: selected
                            ? f.subjects.filter(s => s !== subject)
                            : [...f.subjects, subject],
                        }))}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          selected
                            ? 'bg-navy-700 text-white border-navy-700'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {subject}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="label">Timezone <span className="text-red-400">*</span></label>
                <p className="text-xs text-gray-500 mb-2">All times in this form will be interpreted in this timezone.</p>
                <select
                  value={info.timezone}
                  onChange={e => setInfo(f => ({ ...f, timezone: e.target.value }))}
                  className="input"
                >
                  <option value="America/New_York">Eastern Time (ET)</option>
                  <option value="America/Chicago">Central Time (CT)</option>
                  <option value="America/Denver">Mountain Time (MT)</option>
                  <option value="America/Los_Angeles">Pacific Time (PT)</option>
                </select>
              </div>
              <div>
                <label className="label">Bio / Teaching Style <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea
                  value={info.bio}
                  onChange={e => setInfo(f => ({ ...f, bio: e.target.value }))}
                  placeholder="A brief intro about your teaching approach…"
                  rows={3}
                  className="input resize-none"
                />
              </div>
            </div>
          </>
        )}

        {/* ── STEP 2: Availability ── */}
        {step === 2 && (
          <>
            <div className="mb-2">
              <h2 className="text-lg font-bold text-gray-900">Weekly Availability</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Toggle the days you&apos;re generally available and set your hours. You can add multiple time blocks per day.
              </p>
            </div>

            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              Enter times in <strong>{info.timezone.replace('America/', '').replace('_', ' ')}</strong>.
              Change in Step 1 if needed.
            </p>

            {DAYS.map((day, idx) => {
              const dayState = availability[idx];
              return (
                <div
                  key={idx}
                  className={cn(
                    'rounded-xl border p-4 transition-colors',
                    dayState.enabled ? 'border-navy-200 bg-navy-50' : 'border-gray-200 bg-white',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Toggle on={dayState.enabled} onToggle={() => toggleDay(idx)} />
                      <span className={cn('font-semibold text-sm', dayState.enabled ? 'text-navy-900' : 'text-gray-500')}>
                        {day.label}
                      </span>
                    </div>
                    {dayState.enabled && (
                      <button
                        type="button"
                        onClick={() => addBlock(idx)}
                        className="flex items-center gap-1 text-xs text-navy-600 hover:text-navy-800 font-medium"
                      >
                        <Plus className="w-3 h-3" /> Add block
                      </button>
                    )}
                  </div>

                  {dayState.enabled && (
                    <div className="mt-3 space-y-2">
                      {dayState.blocks.map((block, bIdx) => (
                        <div key={block.id} className="flex items-center gap-2">
                          <input
                            type="time"
                            value={block.start}
                            onChange={e => updateBlock(idx, bIdx, 'start', e.target.value)}
                            className="input flex-1 text-sm py-1.5"
                          />
                          <span className="text-gray-400 text-sm flex-shrink-0">–</span>
                          <input
                            type="time"
                            value={block.end}
                            onChange={e => updateBlock(idx, bIdx, 'end', e.target.value)}
                            className="input flex-1 text-sm py-1.5"
                          />
                          {dayState.blocks.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeBlock(idx, bIdx)}
                              className="flex-shrink-0 text-red-400 hover:text-red-600 p-1"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {enabledDays.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">
                Toggle at least one day, or tap Next to skip availability for now.
              </p>
            )}

            {availErr && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                {availErr}
              </div>
            )}
          </>
        )}

        {/* ── STEP 3: Current Sessions ── */}
        {step === 3 && (
          <>
            <div className="mb-2">
              <h2 className="text-lg font-bold text-gray-900">Current Sessions</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Add the students you&apos;re already working with. We&apos;ll create their sessions in StudyCore automatically.
                This step is optional — tap Skip if you have no existing students.
              </p>
            </div>

            {sessions.map((sess, sIdx) => (
              <div key={sess.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">Student {sIdx + 1}</p>
                  {sessions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSession(sess.id)}
                      className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                    >
                      <X className="w-3.5 h-3.5" /> Remove
                    </button>
                  )}
                </div>

                <div>
                  <label className="label">Student Name <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={sess.studentName}
                    onChange={e => updateSession(sess.id, 'studentName', e.target.value)}
                    placeholder="e.g. Shaan Patel"
                    className="input"
                  />
                </div>

                <div>
                  <label className="label">Student Email <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input
                    type="email"
                    value={sess.studentEmail}
                    onChange={e => updateSession(sess.id, 'studentEmail', e.target.value)}
                    placeholder="student@example.com"
                    className="input"
                  />
                </div>

                <div>
                  <label className="label">Session Day(s)</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {DAYS.map(day => {
                      const selected = sess.days.includes(day.dbDay);
                      return (
                        <button
                          key={day.dbDay}
                          type="button"
                          onClick={() => toggleSessionDay(sess.id, day.dbDay)}
                          className={cn(
                            'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                            selected
                              ? 'bg-navy-900 text-white border-navy-900'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-navy-300 hover:text-navy-700',
                          )}
                        >
                          {day.short}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Start Time</label>
                    <input
                      type="time"
                      value={sess.startTime}
                      onChange={e => updateSession(sess.id, 'startTime', e.target.value)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">End Time</label>
                    <input
                      type="time"
                      value={sess.endTime}
                      onChange={e => updateSession(sess.id, 'endTime', e.target.value)}
                      className="input"
                    />
                  </div>
                </div>

              </div>
            ))}

            <button
              type="button"
              onClick={addSession}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-navy-200 text-navy-700 text-sm font-medium hover:border-navy-400 hover:bg-navy-50 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Another Student
            </button>
          </>
        )}

        {/* ── STEP 4: Confirm ── */}
        {step === 4 && (
          <>
            <div className="mb-2">
              <h2 className="text-lg font-bold text-gray-900">Confirm &amp; Submit</h2>
              <p className="text-sm text-gray-500 mt-0.5">Review your information below, then submit.</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3 text-sm">
              <div>
                <p className="label">Name</p>
                <p className="font-semibold text-gray-900">{info.name}</p>
              </div>
              <div>
                <p className="label">Email</p>
                <p className="text-gray-700">{info.email}</p>
              </div>
              {info.phone && (
                <div>
                  <p className="label">Phone</p>
                  <p className="text-gray-700">{info.phone}</p>
                </div>
              )}
              {info.subjects.length > 0 && (
                <div>
                  <p className="label">Test Types</p>
                  <p className="text-gray-700">{info.subjects.join(', ')}</p>
                </div>
              )}
            </div>

            <div className="bg-navy-50 rounded-xl border border-navy-100 p-5 space-y-3">
              <p className="text-sm font-semibold text-navy-900">Availability</p>
              <div className="text-sm text-navy-700">
                {enabledDays.length > 0 ? (
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>
                      {totalBlocks} time block{totalBlocks !== 1 ? 's' : ''} across {enabledDays.length} day{enabledDays.length !== 1 ? 's' : ''}
                      {': '}{enabledDays.map(d => d.short).join(', ')}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-gray-500">
                    <span className="text-gray-300">—</span>
                    <span>No availability selected</span>
                  </div>
                )}
              </div>
            </div>

            {filledSessions.length > 0 && (
              <div className="bg-navy-50 rounded-xl border border-navy-100 p-5 space-y-3">
                <p className="text-sm font-semibold text-navy-900">Sessions</p>
                <div className="space-y-1.5 text-sm text-navy-700">
                  {filledSessions.map(s => (
                    <div key={s.id} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>
                        {s.studentName}
                        {s.days.length > 0 && (
                          <> — {s.days.map(d => DAYS.find(day => day.dbDay === d)?.short).join(', ')} {s.startTime}–{s.endTime}</>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-4 z-10">
        <div className="max-w-lg mx-auto flex gap-3">
          {step > 1 && (
            <button
              type="button"
              onClick={() => { setStep(s => s - 1); setError(''); }}
              className="btn-secondary flex-shrink-0 py-3 px-5"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}

          {/* Skip button on sessions step */}
          {step === 3 && (
            <button
              type="button"
              onClick={() => setStep(4)}
              className="btn-secondary flex-shrink-0 py-3 px-4 text-sm"
            >
              Skip
            </button>
          )}

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={() => {
                if (step === 2) {
                  const err = availabilityError();
                  if (err) { setAvailErr(err); return; }
                  setAvailErr('');
                }
                setStep(s => s + 1);
              }}
              disabled={step === 1 && !step1Valid()}
              className="btn-primary flex-1 justify-center py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary flex-1 justify-center py-3 text-base"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
