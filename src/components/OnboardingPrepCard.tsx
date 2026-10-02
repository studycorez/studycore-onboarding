'use client';

import { useState } from 'react';
import { CALL_TYPES } from '@/lib/call-scripts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AirtableData {
  priorSatScore:        number;
  targetScore:          number;
  hardestTopics:        string[];
  harderSection:        string;
  strugglesInDetail:    string;
  dailyPracticeTime:    string;
  anythingElseForTutor: string;
  parentConfidence:     number;
  parentConcerns:       string;
  whyStudyCore:         string;
  targetSchools:        string;
  satTestDate:          string;
  // Extended fields now available
  anythingElseAboutStudent?: string;
  whatDidntWorkBefore?:  string;
  parentWhosDriving?:    string;
  checkinContactMethod?: string;
  studentDoubts?:        string;
  whosDriving?:          string;
  parentTargetScore?:    number;
}

interface Props {
  student: {
    contactId: string;
    studentName: string;
    parentName: string;
    contactName: string;
    contactFirstName: string;
    currentScore: string;
    targetScore: string;
    tutorAssigned: string;
    availability: string;
    sessionsPerWeek: string;
    hoursPurchased: number;
    startDate: string;
    stageId: string;
  };
  airtableData?: AirtableData;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TZ_ABBR: Record<string, string> = {
  'America/New_York':    'ET',
  'America/Chicago':     'CT',
  'America/Denver':      'MT',
  'America/Los_Angeles': 'PT',
};

function parseAvailability(availability: string) {
  const parts = availability.split('|');
  if (parts.length < 2) {
    return { days: [] as string[], times: [] as string[], duration: 1.5, timezone: '', tzAbbr: '' };
  }
  const days     = parts[0].split(',').map(d => d.trim()).filter(Boolean);
  const duration = parseFloat(parts[1]) || 1.5;
  const rawTimes = parts[2] ?? '';
  const timezone = parts[3] ?? '';
  const tzAbbr   = TZ_ABBR[timezone] ?? timezone;

  let times: string[] = [];
  if (rawTimes) {
    const timeParts = rawTimes.split(',');
    if (timeParts.length === 1) {
      times = days.map(() => timeParts[0]);
    } else {
      times = days.map((_, i) => timeParts[i] ?? '');
    }
  }

  return { days, times, duration, timezone, tzAbbr };
}

function formatDuration(hrs: number): string {
  if (Number.isInteger(hrs)) return `${hrs}h`;
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  if (h === 0) return `${m}min`;
  return `${h}h ${m}min`;
}

function addHoursToTime(timeStr: string, hrs: number): string {
  const match = timeStr.trim().match(/^(\d+):(\d{2})\s*(AM|PM)$/i);
  if (!match) return '';
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  const totalMins = h * 60 + m + Math.round(hrs * 60);
  const nh = Math.floor(totalMins / 60) % 24;
  const nm = totalMins % 60;
  const nAmpm = nh < 12 ? 'AM' : 'PM';
  const nh12 = nh % 12 || 12;
  return `${nh12}:${nm.toString().padStart(2, '0')} ${nAmpm}`;
}

function buildScheduleLabel(days: string[], times: string[], duration: number, tzAbbr: string): string {
  if (!days.length) return '(schedule not set)';
  return days
    .map((day, i) => {
      const start = times[i] ?? '';
      if (!start) return day;
      const end = addHoursToTime(start, duration);
      // Strip AM/PM from start if same as end, for compact display
      const startAmpm = start.match(/(AM|PM)$/i)?.[1]?.toUpperCase() ?? '';
      const endAmpm   = end.match(/(AM|PM)$/i)?.[1]?.toUpperCase() ?? '';
      const startDisplay = startAmpm === endAmpm ? start.replace(/\s*(AM|PM)$/i, '') : start;
      return `${day} ${startDisplay}–${end}${tzAbbr ? ' ' + tzAbbr : ''}`;
    })
    .join(' · ');
}

function getGapBadgeClass(gap: number): string {
  if (gap <= 200) return 'bg-green-100 text-green-700';
  if (gap <= 300) return 'bg-yellow-100 text-yellow-700';
  return 'bg-orange-100 text-orange-700';
}

function getDiagnosticFraming(gap: number): string {
  if (gap <= 150) return 'Conservative gain — very achievable. Students hit this consistently.';
  if (gap <= 250) return 'Strong but realistic gain. Program is designed for exactly this range.';
  if (gap <= 350) return 'Ambitious target. Will require consistent daily practice.';
  return 'Aggressive target. Set clear expectations about daily commitment.';
}

// ─── ScriptRenderer (local copy matching page.tsx style) ─────────────────────

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

// ─── Section heading helper ───────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingPrepCard({ student, airtableData, onClose }: Props) {
  const studentFirstName = student.studentName.split(' ')[0] || student.studentName;
  const parentFirstName  = student.contactFirstName || student.contactName.split(' ')[0] || student.parentName.split(' ')[0];

  // Prefer Airtable scores (more reliable) over GHL custom fields
  const currentScore = airtableData?.priorSatScore || parseInt(student.currentScore) || 0;
  const targetScore  = airtableData?.targetScore   || parseInt(student.targetScore)  || 0;
  const gap          = targetScore - currentScore;

  const hardestTopics     = airtableData?.hardestTopics     ?? [];
  const harderSection     = airtableData?.harderSection     ?? '';
  const strugglesInDetail = airtableData?.strugglesInDetail ?? '';
  const parentConcerns    = airtableData?.parentConcerns    ?? '';
  const parentConfidence  = airtableData?.parentConfidence  ?? 0;

  const { days, times, duration, tzAbbr } = parseAvailability(student.availability);
  const scheduleLabel = buildScheduleLabel(days, times, duration, tzAbbr);
  const firstSlotLabel = days.length > 0
    ? `${days[0]}${times[0] ? ' at ' + times[0] : ''}${tzAbbr ? ' ' + tzAbbr : ''}`
    : '(first session TBD)';

  const hasTutor = !!student.tutorAssigned.trim();
  const [schedulePath, setSchedulePath] = useState<'a' | 'b'>(hasTutor ? 'a' : 'b');

  const [studentTime, setStudentTime] = useState('');
  const [parentTime,  setParentTime]  = useState('');
  const [savingCheckin, setSavingCheckin] = useState(false);
  const [checkinSaved,  setCheckinSaved]  = useState(false);
  const [checkinError,  setCheckinError]  = useState(false);

  async function saveCheckinTimes() {
    if (!studentTime && !parentTime) return;
    setSavingCheckin(true);
    setCheckinError(false);
    try {
      const res = await fetch('/api/ssc-save-checkin-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId:   student.contactId,
          studentTime,
          parentTime,
        }),
      });
      if (!res.ok) throw new Error();
      setCheckinSaved(true);
      setTimeout(() => setCheckinSaved(false), 3000);
    } catch {
      setCheckinError(true);
      setTimeout(() => setCheckinError(false), 3000);
    } finally {
      setSavingCheckin(false);
    }
  }

  const onboardingCallType = CALL_TYPES.find(c => c.id === 'onboarding')!;
  const scriptValues: Record<string, string> = {
    studentFirstName,
    parentFirstName,
    studentName:          student.studentName,
    parentName:           student.parentName,
    currentScore:         student.currentScore,
    targetScore:          student.targetScore,
    tutorName:            student.tutorAssigned || '(tutor TBD)',
    tutorScore:           '',
    session1Day:          days[0] ?? '',
    session1Time:         times[0] ?? '',
    session2Day:          days[1] ?? '',
    session2Time:         times[1] ?? '',
    sessionEndTime:       times[0] ? addHoursToTime(times[0], duration) : '',
    postCallTime:         times[0] ? addHoursToTime(times[0], duration + 10 / 60) : '',
    weeklyCheckinStudent: studentTime || '(set on call)',
    weeklyCheckinParent:  parentTime  || '(set on call)',
    testDate:             student.startDate || '',
    sscName:              'Jonas',
  };

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 py-3.5 flex items-center justify-between shadow-sm">
        <h1 className="text-sm font-bold text-gray-900">
          Onboarding Call — <span className="text-[#1e2090]">{studentFirstName}</span>
        </h1>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 text-xl font-light leading-none transition"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Two-column layout */}
      <div className="max-w-screen-xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-0 min-h-[calc(100vh-56px)]">

        {/* ── Left column: structured brief ──────────────────────────────────── */}
        <div className="px-5 py-5 lg:border-r border-gray-100 overflow-y-auto">

          {/* 1. Student Snapshot */}
          <div className="bg-[#1e2090] text-white rounded-2xl p-4 mb-4">
            <p className="text-sm mb-2">
              Student: <strong>{student.studentName}</strong>
              {' · '}
              Parent: <strong>{student.contactName}</strong>
            </p>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="bg-white/20 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                {student.currentScore || '—'}
              </span>
              <span className="text-white/60 text-xs">→</span>
              <span className="bg-white/20 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                {student.targetScore || '—'}
              </span>
              {gap > 0 && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getGapBadgeClass(gap)}`}>
                  +{gap}
                </span>
              )}
            </div>
            <p className="text-sm text-white/80 mb-2">
              {student.hoursPurchased}h purchased · {student.sessionsPerWeek}x/week
            </p>
            {hasTutor ? (
              <p className="text-sm text-green-300 font-semibold">✓ Tutor matched: {student.tutorAssigned}</p>
            ) : (
              <p className="text-sm text-orange-300 font-semibold">⚠ No tutor matched yet</p>
            )}
          </div>

          {/* 2. Diagnostic Talking Points */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
            <SectionTitle>📊 Diagnostic Talking Points</SectionTitle>
            {gap > 0 && (
              <p className="text-xs text-amber-700 font-semibold mb-3">{getDiagnosticFraming(gap)}</p>
            )}
            <ul className="space-y-2 mb-3">
              <li className="flex items-start gap-2 text-sm text-amber-900">
                <span className="text-amber-400 shrink-0 mt-0.5">•</span>
                <span>Going from <strong>{currentScore || '—'}</strong> to <strong>{targetScore || '—'}</strong>{gap > 0 ? ` — that's +${gap} points.` : '.'}</span>
              </li>
              {harderSection && (
                <li className="flex items-start gap-2 text-sm text-amber-900">
                  <span className="text-amber-400 shrink-0 mt-0.5">•</span>
                  <span>Harder section: <strong>{harderSection}</strong>. Tutor will go through every question on the diagnostic in session 1 — not just the answer, the reason behind each one.</span>
                </li>
              )}
              {hardestTopics.length > 0 && (
                <li className="flex items-start gap-2 text-sm text-amber-900">
                  <span className="text-amber-400 shrink-0 mt-0.5">•</span>
                  <span>Hardest topics: <strong>{hardestTopics.join(', ')}</strong></span>
                </li>
              )}
              {strugglesInDetail && (
                <li className="flex items-start gap-2 text-sm text-amber-900">
                  <span className="text-amber-400 shrink-0 mt-0.5">•</span>
                  <span>In their own words: <em>&ldquo;{strugglesInDetail}&rdquo;</em></span>
                </li>
              )}
              {!harderSection && !hardestTopics.length && (
                <li className="flex items-start gap-2 text-sm text-amber-900">
                  <span className="text-amber-400 shrink-0 mt-0.5">•</span>
                  <span>Our students hit this range consistently through this program — requires real daily practice, not just sessions.</span>
                </li>
              )}
              <li className="flex items-start gap-2 text-sm text-amber-900">
                <span className="text-amber-400 shrink-0 mt-0.5">•</span>
                <span>Program designed for exactly this. But it requires 30–45 min of daily practice — sessions alone won&apos;t move the score.</span>
              </li>
            </ul>
            {parentConcerns && (
              <div className="bg-amber-100 border border-amber-300 rounded-xl px-3 py-2 mt-2">
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">Parent concern to address</p>
                <p className="text-xs text-amber-900 italic">&ldquo;{parentConcerns}&rdquo;</p>
              </div>
            )}
            {parentConfidence > 0 && (
              <p className="text-[10px] text-amber-600 mt-2">Parent confidence: {parentConfidence}/10</p>
            )}
          </div>

          {/* 3. Scheduling */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
            <SectionTitle>📅 Schedule Lock</SectionTitle>

            {days.length > 0 && (
              <div className="mb-3">
                <p className="text-sm font-semibold text-gray-800 mb-1">{scheduleLabel}</p>
                <p className="text-xs text-gray-500">Duration: {formatDuration(duration)}{tzAbbr ? ` · ${tzAbbr}` : ''}</p>
              </div>
            )}

            {/* Path toggle */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setSchedulePath('a')}
                className={`flex-1 text-xs font-semibold py-2 rounded-xl transition ${schedulePath === 'a' ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'}`}
              >
                Path A: Tutor Matched
              </button>
              <button
                onClick={() => setSchedulePath('b')}
                className={`flex-1 text-xs font-semibold py-2 rounded-xl transition ${schedulePath === 'b' ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'}`}
              >
                Path B: No Tutor Yet
              </button>
            </div>

            {schedulePath === 'a' ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-1.5">
                <p className="text-sm text-green-800">
                  <strong>Schedule confirmed:</strong> {scheduleLabel}
                </p>
                <p className="text-sm text-green-800">
                  <strong>Tutor:</strong> {student.tutorAssigned || '(confirm name)'}
                </p>
                <p className="text-xs text-green-700 font-mono mt-2">
                  &quot;Your first session will be {firstSlotLabel}. Tutor details already sent to your number.&quot;
                </p>
              </div>
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 space-y-1.5">
                <p className="text-sm text-yellow-800">
                  <strong>Lock schedule:</strong> {scheduleLabel}
                </p>
                <ul className="space-y-1">
                  {[
                    'We have 3–4 tutor matches based on the diagnostic results and this schedule.',
                    'As soon as I send this out, I\'ll confirm a tutor immediately — usually same day.',
                  ].map((line, i) => (
                    <li key={i} className="text-xs text-yellow-800 flex items-start gap-1.5">
                      <span className="text-yellow-500 shrink-0">•</span>{line}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-yellow-700 font-mono mt-2">
                  &quot;Your first session will be {firstSlotLabel}. I&apos;ll send over tutor info the moment we have a confirmed match.&quot;
                </p>
              </div>
            )}
          </div>

          {/* 4. Student Commitment Script */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4">
            <SectionTitle>🎯 Student Commitment — {studentFirstName}</SectionTitle>
            <p className="text-[10px] text-gray-400 italic mb-2">[SSC reads directly to student]</p>
            <div className="font-mono text-sm leading-relaxed text-gray-800 space-y-2">
              <p>&quot;{studentFirstName}, here&apos;s what I need from you:</p>
              <p>30 to 45 minutes of independent practice every single day — not every other day, every day. That&apos;s homework your tutor assigns, error log review, revenge tests. Sessions are where you learn. Daily practice is where it gets locked in. You can&apos;t skip it and expect sessions alone to move your score.</p>
              <p>Show up to every session. If something comes up, give us 24 hours notice. A no-show wastes your tutor&apos;s time and one of your paid sessions.</p>
              <p>If anything feels off — sessions feel too easy, homework is unclear, you&apos;re not clicking with your tutor — tell me directly. Don&apos;t wait for the weekly check-in. I can fix something I know about.</p>
              <p>Can I get your commitment on all of that right now?&quot;</p>
            </div>
          </div>

          {/* 5. Parent Commitment Script */}
          <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 mb-4">
            <SectionTitle>👨‍👩‍👧 Parent Commitment — {parentFirstName}</SectionTitle>
            <div className="font-mono text-sm leading-relaxed text-gray-800 space-y-2">
              <p>&quot;{parentFirstName}, here&apos;s what I need from you:</p>
              <p>On the days when {studentFirstName} doesn&apos;t feel like doing the homework — when motivation drops, when school gets busy and SAT prep feels like the easiest thing to push off — that&apos;s when your accountability matters most.</p>
              <p>Our team monitors homework completion weekly. If I see {studentFirstName}&apos;s scores falling behind, I&apos;ll call you directly — and I need to know you&apos;ll back that up at home.</p>
              <p>One missed session per week is 25% of your tutoring time gone. That math catches up fast.</p>
              <p>Can I count on you for that?&quot;</p>
            </div>
          </div>

          {/* 6. Lock Weekly Check-in Times */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
            <SectionTitle>🔒 Lock Check-in Times</SectionTitle>
            <p className="text-xs text-gray-500 mb-3">Confirm live on the call — lock in both slots now</p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Student ({studentFirstName}) — weekly call time:
                </label>
                <input
                  type="text"
                  value={studentTime}
                  onChange={e => setStudentTime(e.target.value)}
                  placeholder="e.g. Sun 11:10am"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2090]/20 focus:border-[#1e2090]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Parent ({parentFirstName}) — weekly call time:
                </label>
                <input
                  type="text"
                  value={parentTime}
                  onChange={e => setParentTime(e.target.value)}
                  placeholder="e.g. Sun 11:30am"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2090]/20 focus:border-[#1e2090]"
                />
              </div>
            </div>

            <button
              onClick={saveCheckinTimes}
              disabled={savingCheckin || (!studentTime && !parentTime)}
              className="w-full bg-[#1e2090] text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-[#161870] disabled:opacity-50 disabled:cursor-not-allowed transition mb-3"
            >
              {savingCheckin ? 'Saving…' : checkinSaved ? '✓ Saved to GHL' : checkinError ? '✕ Save failed' : 'Save & Lock →'}
            </button>

            {/* Script for locking times */}
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 font-mono text-sm space-y-2">
              <p className="text-gray-700">
                &quot;{studentFirstName}, what time works for you on Sundays for a quick 5-minute check-in call?&quot;
              </p>
              <p className="text-[10px] text-gray-400 italic">→ [{studentTime || 'Student time input'}]</p>
              <p className="text-gray-700">
                &quot;{parentFirstName}, and for you? I&apos;ll call {studentFirstName} first, then you right after.&quot;
              </p>
              <p className="text-[10px] text-gray-400 italic">→ [{parentTime || 'Parent time input'}]</p>
            </div>
          </div>

          {/* 7. Call Close */}
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-4">
            <SectionTitle>✅ Close the Call</SectionTitle>
            <div className="font-mono text-sm leading-relaxed text-gray-800 space-y-1.5">
              <p>&quot;Just to recap:</p>
              <ul className="pl-4 space-y-1">
                <li>• First session: {firstSlotLabel}</li>
                <li>• I&apos;ll call {studentFirstName} right after session 1 — just 5 minutes to hear how it went.</li>
                <li>• Weekly check-in: {studentTime || '(set above)'}</li>
                <li>• {parentFirstName}, I&apos;ll call you right after at {parentTime || '(set above)'}.</li>
                <li>• Practice tests at the end of every phase — we&apos;ll review together on Zoom.</li>
              </ul>
              <p>Any questions before we hang up?&quot;</p>
            </div>
            <div className="mt-3 pt-3 border-t border-green-200 font-mono text-sm text-gray-700">
              <p>&quot;Perfect. Talk soon — you&apos;re going to do great, {studentFirstName}. {parentFirstName}, thanks for trusting us with this.&quot;</p>
            </div>
          </div>

        </div>

        {/* ── Right column: live script ───────────────────────────────────────── */}
        <div className="flex flex-col lg:sticky lg:top-[56px] lg:h-[calc(100vh-56px)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 bg-white flex items-center justify-between flex-wrap gap-2 shrink-0">
            <h2 className="font-bold text-gray-900 text-sm">Live Script</h2>
            <div className="flex items-center gap-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-300" />Filled
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-orange-300" />Missing
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-indigo-300" />Screen
              </span>
            </div>
          </div>
          <div className="overflow-y-auto flex-1 px-5 py-4">
            <ScriptRenderer template={onboardingCallType.script} values={scriptValues} />

            {/* SOP points */}
            <div className="mt-6 border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">SOP Quick Reference</p>
              </div>
              <ul className="divide-y divide-gray-50 px-4 py-3 space-y-1.5">
                {onboardingCallType.sopPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600 py-1">
                    <span className="text-[#1e2090] mt-0.5 shrink-0">•</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
