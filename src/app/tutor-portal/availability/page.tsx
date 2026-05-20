'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { cn } from '@/lib/utils';
import { Loader2, Check, Trash2, Info } from 'lucide-react';

// ─── timezone list ─────────────────────────────────────────────────
const TIMEZONES = [
  { tz: 'America/Los_Angeles', label: 'Pacific Time (PT)'                  },
  { tz: 'America/Denver',      label: 'Mountain Time (MT)'                 },
  { tz: 'America/Phoenix',     label: 'Arizona / Phoenix (no DST)'         },
  { tz: 'America/Chicago',     label: 'Central Time (CT)'                  },
  { tz: 'America/New_York',    label: 'Eastern Time (ET)'                  },
  { tz: 'America/Anchorage',   label: 'Alaska Time (AK)'                   },
  { tz: 'Pacific/Honolulu',    label: 'Hawaii Time (HI)'                   },
  { tz: 'America/Toronto',     label: 'Eastern Time – Toronto'             },
  { tz: 'America/Vancouver',   label: 'Pacific Time – Vancouver'           },
  { tz: 'Europe/London',       label: 'London (GMT/BST)'                   },
  { tz: 'Europe/Paris',        label: 'Central European (CET/CEST)'        },
  { tz: 'Asia/Kolkata',        label: 'India Standard Time (IST)'          },
  { tz: 'Asia/Manila',         label: 'Philippine Time (PHT)'              },
  { tz: 'Asia/Singapore',      label: 'Singapore Time (SGT)'               },
  { tz: 'Australia/Sydney',    label: 'Sydney (AEST/AEDT)'                 },
] as const;

// ─── grid constants ────────────────────────────────────────────────
const HOUR_START  = 6;
const HOUR_END    = 22;
const TOTAL_SLOTS = (HOUR_END - HOUR_START) * 2; // 32 half-hour slots

const DAY_ORDER  = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── helpers ───────────────────────────────────────────────────────
function slotToTime(idx: number): string {
  const total = HOUR_START * 60 + idx * 30;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function timeToSlot(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return ((h * 60 + m) - HOUR_START * 60) / 30;
}

function slotLabel(idx: number): string {
  const total = HOUR_START * 60 + idx * 30;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12  = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

interface DbSlot { day_of_week: number; start_time: string; end_time: string }

function slotsToSet(dbSlots: DbSlot[]): Set<string> {
  const set = new Set<string>();
  for (const slot of dbSlots) {
    const s = Math.max(0, timeToSlot(slot.start_time));
    const e = Math.min(TOTAL_SLOTS, timeToSlot(slot.end_time));
    for (let i = s; i < e; i++) set.add(`${slot.day_of_week}:${i}`);
  }
  return set;
}

function setToRanges(cells: Set<string>): { day: number; start: string; end: string }[] {
  const byDay: Record<number, number[]> = {};
  for (const key of cells) {
    const [d, s] = key.split(':').map(Number);
    (byDay[d] ??= []).push(s);
  }
  const ranges: { day: number; start: string; end: string }[] = [];
  for (const dStr of Object.keys(byDay)) {
    const day    = Number(dStr);
    const sorted = [...byDay[day]].sort((a, b) => a - b);
    let start = sorted[0];
    let prev  = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      if (sorted[i] !== prev + 1) {
        ranges.push({ day, start: slotToTime(start), end: slotToTime(prev + 1) });
        start = sorted[i];
      }
      prev = sorted[i];
    }
  }
  return ranges;
}

// ─── component ─────────────────────────────────────────────────────
export default function TutorAvailabilityPage() {
  const { tutor, loading: authLoading } = useTutorAuth();

  const [cells,     setCells]     = useState<Set<string>>(new Set());
  const [origCells, setOrigCells] = useState<Set<string>>(new Set());
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState('');

  // timezone
  const [selectedTz, setSelectedTz] = useState('');
  const [origTz,     setOrigTz]     = useState('');

  // drag
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode,   setDragMode]   = useState<'add' | 'remove'>('add');

  // initialise TZ from tutor profile (runs once when tutor loads)
  useEffect(() => {
    if (tutor && origTz === '') {
      const tz = tutor.timezone ?? 'America/Los_Angeles';
      setSelectedTz(tz);
      setOrigTz(tz);
    }
  }, [tutor, origTz]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/tutor-auth/availability');
    if (res.ok) {
      const data: DbSlot[] = await res.json();
      const s = slotsToSet(data);
      setCells(s);
      setOrigCells(s);
    } else {
      setError('Failed to load availability. Please refresh.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (!authLoading) load(); }, [authLoading, load]);

  useEffect(() => {
    const end = () => setIsDragging(false);
    window.addEventListener('mouseup', end);
    return () => window.removeEventListener('mouseup', end);
  }, []);

  function handleCellDown(key: string) {
    const mode = cells.has(key) ? 'remove' : 'add';
    setDragMode(mode);
    setIsDragging(true);
    applyCell(key, mode);
  }

  function handleCellEnter(key: string) {
    if (!isDragging) return;
    applyCell(key, dragMode);
  }

  function applyCell(key: string, mode: 'add' | 'remove') {
    setCells(prev => {
      const next = new Set(prev);
      if (mode === 'add') next.add(key);
      else next.delete(key);
      return next;
    });
  }

  const tzChanged = selectedTz !== '' && selectedTz !== origTz;

  const isDirty = useMemo(() => {
    if (selectedTz !== origTz && selectedTz !== '') return true;
    if (cells.size !== origCells.size) return true;
    for (const k of cells) if (!origCells.has(k)) return true;
    return false;
  }, [cells, origCells, selectedTz, origTz]);

  const totalHours = (cells.size * 0.5).toFixed(1).replace('.0', '');

  const tzLabel = TIMEZONES.find(t => t.tz === selectedTz)?.label ?? selectedTz;

  async function save() {
    setSaving(true);
    setError('');
    const ranges = setToRanges(cells);
    const body: Record<string, unknown> = { slots: ranges };
    if (tzChanged) body.new_timezone = selectedTz;

    const res = await fetch('/api/tutor-auth/availability', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? 'Failed to save');
    } else {
      setOrigCells(new Set(cells));
      setOrigTz(selectedTz);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  }

  if (authLoading) return null;

  return (
    <TutorPortalLayout tutor={tutor}>
      {/* ── Header ── */}
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Availability</h1>
          <p className="text-gray-500 text-sm mt-1">
            Click or drag to toggle time blocks. Changes are saved when you click Save.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            <span className="font-semibold text-gray-900">{totalHours}</span> hrs/week
          </span>
          <button
            onClick={() => setCells(new Set())}
            disabled={cells.size === 0 || saving}
            className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All
          </button>
          <button
            onClick={save}
            disabled={!isDirty || saving}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4" />
            ) : null}
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* ── Timezone selector ── */}
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
          Your Timezone:
        </label>
        <select
          className="input text-sm py-1.5"
          value={selectedTz}
          onChange={e => setSelectedTz(e.target.value)}
          disabled={saving}
        >
          {/* Show current TZ as option if not in standard list */}
          {selectedTz && !TIMEZONES.find(t => t.tz === selectedTz) && (
            <option value={selectedTz}>{selectedTz}</option>
          )}
          {TIMEZONES.map(t => (
            <option key={t.tz} value={t.tz}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* ── TZ change notice ── */}
      {tzChanged && (
        <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-sm text-amber-800 max-w-2xl">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Changing timezone keeps your schedule's local times the same — 9 AM stays
            9 AM in your new timezone. Click <strong>Save Changes</strong> to apply.
          </span>
        </div>
      )}

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {loading ? (
        <div className="card p-12 flex items-center justify-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <div className="card p-4 overflow-x-auto">
          {/* Legend + TZ context */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-navy-500 inline-block" />
                Available
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-gray-100 border border-gray-200 inline-block" />
                Unavailable
              </span>
            </div>
            {selectedTz && (
              <span className="text-xs text-gray-400">
                All times shown in <span className="font-medium text-gray-600">{tzLabel}</span>
              </span>
            )}
          </div>

          {/* Grid */}
          <div className="select-none" style={{ userSelect: 'none' }}>
            {/* Header row */}
            <div className="flex mb-1">
              <div className="flex-shrink-0" style={{ width: 52 }} />
              {DAY_ORDER.map((day, di) => (
                <div
                  key={day}
                  className="flex-1 text-center text-xs font-semibold text-gray-600 pb-1"
                >
                  {DAY_LABELS[di]}
                </div>
              ))}
            </div>

            {/* Time rows */}
            <div className="flex">
              {/* Time label column */}
              <div className="flex-shrink-0" style={{ width: 52 }}>
                {Array.from({ length: TOTAL_SLOTS }, (_, i) => (
                  <div key={i} className="relative" style={{ height: 20 }}>
                    {i % 2 === 0 && (
                      <span
                        className="absolute right-2 text-gray-400 leading-none"
                        style={{ fontSize: 10, top: -6 }}
                      >
                        {slotLabel(i)}
                      </span>
                    )}
                  </div>
                ))}
                {/* 10pm end boundary label */}
                <div className="relative" style={{ height: 8 }}>
                  <span
                    className="absolute right-2 text-gray-400 leading-none"
                    style={{ fontSize: 10, top: -6 }}
                  >
                    {slotLabel(TOTAL_SLOTS)}
                  </span>
                </div>
              </div>

              {/* Day columns */}
              {DAY_ORDER.map((day, di) => (
                <div key={day} className="flex-1 min-w-0">
                  {Array.from({ length: TOTAL_SLOTS }, (_, slotIdx) => {
                    const key    = `${day}:${slotIdx}`;
                    const active = cells.has(key);
                    const onHour = slotIdx % 2 === 0;
                    return (
                      <div
                        key={slotIdx}
                        className={cn(
                          'border-b cursor-pointer transition-colors overflow-hidden',
                          di === 0 ? 'border-l' : '',
                          di === DAY_ORDER.length - 1 ? 'border-r border-gray-200' : '',
                          onHour ? 'border-b-gray-200' : 'border-b-gray-100',
                          active
                            ? 'bg-navy-500 hover:bg-navy-600'
                            : 'bg-white hover:bg-navy-50',
                          di > 0 ? 'border-l border-gray-200' : 'border-l-gray-200',
                        )}
                        style={{ height: 20 }}
                        onMouseDown={(e) => { e.preventDefault(); handleCellDown(key); }}
                        onMouseEnter={() => handleCellEnter(key)}
                      >
                        <span
                          className={cn(
                            'block leading-none pt-px pl-0.5 pointer-events-none',
                            active ? 'text-white/60' : 'text-gray-300',
                          )}
                          style={{ fontSize: 9 }}
                        >
                          {slotLabel(slotIdx)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </TutorPortalLayout>
  );
}
