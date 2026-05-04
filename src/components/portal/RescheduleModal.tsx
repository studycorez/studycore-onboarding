'use client';

import { useState, useEffect } from 'react';
import { X, Calendar, Loader2, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays, startOfDay } from 'date-fns';

interface RescheduleModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  sessionTime: string;       // ISO — original session time
  tutorName: string;
  studentName: string;
  durationMinutes: number;
  apiBase: 'parent-portal' | 'student-portal';
}

function groupSlotsByDate(slots: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const iso of slots) {
    const day = iso.slice(0, 10); // YYYY-MM-DD
    (out[day] ??= []).push(iso);
  }
  return out;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
  });
}

function fmtDayHeader(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00'); // noon to avoid tz flip
  return format(d, 'EEEE, MMM d');
}

export default function RescheduleModal({
  open, onClose, sessionId, sessionTime, tutorName, studentName, durationMinutes, apiBase,
}: RescheduleModalProps) {
  const [step, setStep] = useState<'loading' | 'slots' | 'confirm' | 'submitting' | 'done' | 'error'>('loading');
  const [slots, setSlots] = useState<string[]>([]);
  const [grouped, setGrouped] = useState<Record<string, string[]>>({});
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [weekOffset, setWeekOffset] = useState(0); // 0 = first 7 days, 1 = days 7-14

  useEffect(() => {
    if (!open) return;
    setStep('loading');
    setSlots([]);
    setSelectedSlot(null);
    setNote('');
    setWeekOffset(0);

    fetch(`/api/${apiBase}/reschedule-request?session_id=${sessionId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErrorMsg(d.error); setStep('error'); return; }
        setSlots(d.slots ?? []);
        setGrouped(groupSlotsByDate(d.slots ?? []));
        setStep('slots');
      })
      .catch(() => { setErrorMsg('Failed to load available times.'); setStep('error'); });
  }, [open, sessionId, apiBase]);

  async function handleSubmit() {
    if (!selectedSlot) return;
    setStep('submitting');
    try {
      const res = await fetch(`/api/${apiBase}/reschedule-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, requested_time: selectedSlot, note: note || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error ?? 'Something went wrong.');
        setStep('error');
        return;
      }
      setStep('done');
    } catch {
      setErrorMsg('Network error — please try again.');
      setStep('error');
    }
  }

  if (!open) return null;

  // Visible dates: week 0 = days 0–6, week 1 = days 7–13
  const today = startOfDay(new Date());
  const visibleDates = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, weekOffset * 7 + i);
    return d.toISOString().slice(0, 10);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Request Reschedule</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Session with {tutorName} · {durationMinutes} min
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {/* Loading */}
          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-navy-600" />
              <p className="text-sm text-gray-500">Loading available times…</p>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="py-8 text-center">
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{errorMsg}</p>
              <button onClick={onClose} className="mt-4 text-sm text-gray-500 hover:text-gray-700">Close</button>
            </div>
          )}

          {/* Done */}
          {step === 'done' && (
            <div className="py-8 text-center">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Check className="w-7 h-7 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Request Submitted!</h3>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">
                Your reschedule request has been submitted. We&apos;ll confirm within 24 hours.
              </p>
              <button
                onClick={onClose}
                className="mt-6 inline-flex items-center px-5 py-2.5 bg-navy-700 text-white text-sm font-semibold rounded-lg hover:bg-navy-800 transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {/* Slot picker */}
          {(step === 'slots' || step === 'confirm') && (
            <>
              {/* Current session */}
              <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <span className="font-medium">Current time:</span>{' '}
                {new Date(sessionTime).toLocaleString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric',
                  hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
                })} ET
              </div>

              {/* Week navigation */}
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-900">Available Times</p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setWeekOffset(0)}
                    disabled={weekOffset === 0}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-600" />
                  </button>
                  <span className="text-xs text-gray-500 px-1">
                    {weekOffset === 0 ? 'This week' : 'Next week'}
                  </span>
                  <button
                    onClick={() => setWeekOffset(1)}
                    disabled={weekOffset === 1}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Slot grid */}
              {slots.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  No available slots in the next 2 weeks. Please contact us directly.
                </p>
              ) : (
                <div className="space-y-4">
                  {visibleDates.map(dateStr => {
                    const daySlots = grouped[dateStr] ?? [];
                    if (daySlots.length === 0) return null;
                    return (
                      <div key={dateStr}>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          {fmtDayHeader(dateStr)}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {daySlots.map(slot => (
                            <button
                              key={slot}
                              onClick={() => setSelectedSlot(slot === selectedSlot ? null : slot)}
                              className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors ${
                                selectedSlot === slot
                                  ? 'bg-navy-700 text-white border-navy-700'
                                  : 'bg-white text-gray-700 border-gray-200 hover:border-navy-300 hover:bg-navy-50'
                              }`}
                            >
                              {fmtTime(slot)} ET
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {visibleDates.every(d => !grouped[d]?.length) && (
                    <p className="text-sm text-gray-400 text-center py-4">
                      No slots this week —{' '}
                      <button onClick={() => setWeekOffset(w => w === 0 ? 1 : 0)} className="text-navy-600 underline">
                        check {weekOffset === 0 ? 'next week' : 'this week'}
                      </button>
                    </p>
                  )}
                </div>
              )}

              {/* Note */}
              {selectedSlot && (
                <div className="mt-5">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Note <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. conflict came up, need to move to afternoon…"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent resize-none"
                  />
                </div>
              )}
            </>
          )}

          {/* Submitting */}
          {step === 'submitting' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-navy-600" />
              <p className="text-sm text-gray-500">Submitting request…</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'slots' || step === 'confirm') && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={!selectedSlot}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-navy-700 text-white text-sm font-semibold rounded-lg hover:bg-navy-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Calendar className="w-4 h-4" />
              Submit Request
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
