'use client';

import { useEffect, useState } from 'react';
import { CALL_TYPES, type CallTypeId, type CallType } from '@/lib/call-scripts';
import { calcTotalSessions } from '@/lib/ghl-support';

interface SscStudent {
  opportunityId:     string;
  contactId:         string;
  studentName:       string;
  parentName:        string;
  stageId:           string;
  currentScore:      string;
  targetScore:       string;
  tutorAssigned:     string;
  weeklyCheckinTime: string;
  availability:      string;
  hasGuarantee:      string;
  sessionsCompleted: number;
  sessionsPerWeek:   string;
  hoursCompleted:    number;
  hoursRemaining:    number;
  hoursPurchased:    number;
  startDate:         string;
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
  };
}

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

export default function SscContactPage({ params }: { params: { id: string } }) {
  const [authed, setAuthed]               = useState(false);
  const [password, setPassword]           = useState('');
  const [authError, setAuthError]         = useState('');
  const [student, setStudent]             = useState<SscStudent | null>(null);
  const [loading, setLoading]             = useState(true);
  const [activeCallType, setActiveCallType] = useState<CallTypeId>('onboarding');
  const [prepCard, setPrepCard]           = useState<Record<string, string>>({});
  const [sopOpen, setSopOpen]             = useState(false);
  const [stageSaving, setStageSaving]     = useState(false);
  const [toasts, setToasts]               = useState<{ id: number; msg: string; ok: boolean }[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('sc_auth') === 'true') setAuthed(true);
  }, []);

  useEffect(() => {
    if (!authed) return;
    fetch(`/api/ssc-student/${params.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.student) {
          setStudent(data.student);
          setPrepCard(buildDefaults(data.student));
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
  }

  function updateField(key: string, value: string) {
    setPrepCard(prev => ({ ...prev, [key]: value }));
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

  const scoreGap      = student.currentScore && student.targetScore
    ? parseInt(student.targetScore) - parseInt(student.currentScore)
    : null;
  const hasProgress   = student.hoursPurchased > 0;
  const pct           = hasProgress ? Math.min(100, Math.round((student.hoursCompleted / student.hoursPurchased) * 100)) : 0;
  const isLow         = student.hoursRemaining > 0 && student.hoursRemaining <= 5;
  const totalSessions = calcTotalSessions(student);
  const showDots      = totalSessions > 0 && totalSessions <= 30;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Toasts */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`rounded-lg px-4 py-3 text-sm shadow-lg text-white ${t.ok ? 'bg-green-600' : 'bg-red-600'}`}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="bg-[#1e2090] text-white px-6 py-4">
        <div className="flex items-center gap-3 mb-2">
          <a href="/ssc" className="text-blue-200 hover:text-white text-sm transition">← All Students</a>
        </div>

        {/* Name row + stage selector */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{student.studentName}</h1>
            <div className="flex items-center gap-4 mt-1 text-blue-200 text-sm flex-wrap">
              <span>Parent: {student.parentName || '—'}</span>
              {student.tutorAssigned && <span>Tutor: {student.tutorAssigned}</span>}
              {student.sessionsPerWeek && <span>{student.sessionsPerWeek}x/wk</span>}
              {student.currentScore && student.targetScore && (
                <span>
                  {student.currentScore}
                  <span className="text-blue-400 mx-1">→</span>
                  {student.targetScore}
                  {scoreGap !== null && scoreGap > 0 && (
                    <span className="text-blue-400 ml-1 text-xs">(+{scoreGap})</span>
                  )}
                </span>
              )}
              {student.hasGuarantee === 'Yes' && (
                <span className="bg-yellow-400 text-yellow-900 text-xs px-2 py-0.5 rounded-full font-medium">Guarantee</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
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
        {hasProgress && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-blue-200">
                Program Progress —
                <span className="text-white font-semibold ml-1">{Math.round(student.hoursCompleted)}/{student.hoursPurchased}h</span>
                {student.sessionsCompleted > 0 && (
                  <span className="text-blue-300 ml-2">· {student.sessionsCompleted}/{totalSessions} sessions</span>
                )}
              </span>
              <span className={`font-semibold ${isLow ? 'text-red-300' : 'text-blue-200'}`}>{pct}%</span>
            </div>
            <div className="h-2.5 bg-[#1a1a7a] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isLow ? 'bg-red-400' : pct >= 75 ? 'bg-orange-400' : 'bg-emerald-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {showDots && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Array.from({ length: totalSessions }, (_, i) => {
                  const done = i < student.sessionsCompleted;
                  return (
                    <div
                      key={i}
                      title={`Session ${i + 1}${done ? ' — completed' : ''}`}
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        done
                          ? 'bg-emerald-400 text-white'
                          : 'bg-[#1a1a7a] border border-blue-500 text-blue-400'
                      }`}
                    >
                      {done ? '✓' : i + 1}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="bg-white border-b border-gray-200 px-6 py-2 flex gap-1">
        <a href="/match-queue" className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">Operations</a>
        <a href="/tqc"         className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">TQC</a>
        <a href="/check-ins"   className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">Check-ins</a>
        <a href="/ssc"         className="px-4 py-2 rounded-lg text-sm font-medium bg-[#1e2090] text-white">SSC</a>
      </div>

      {/* Call type tabs */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex gap-2 overflow-x-auto">
        {CALL_TYPES.map(ct => (
          <button
            key={ct.id}
            onClick={() => switchCallType(ct.id)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition whitespace-nowrap ${
              activeCallType === ct.id
                ? 'bg-[#1e2090] text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {ct.title}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Prep Card */}
        <div className="w-2/5 border-r border-gray-200 bg-white overflow-y-auto flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">{callType.title} — Prep Card</h2>
            <p className="text-xs text-gray-400 mt-0.5">{callType.duration}</p>
          </div>

          <div className="px-5 py-4 flex-1 space-y-3">
            {callType.prepCardFields.filter(f => f.autoFillKey).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Auto-filled from GHL</p>
                {callType.prepCardFields
                  .filter(f => f.autoFillKey)
                  .map(field => (
                    <div key={field.key} className="mb-2">
                      <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                      <input
                        type="text"
                        value={prepCard[field.key] ?? ''}
                        onChange={e => updateField(field.key, e.target.value)}
                        placeholder={field.placeholder ?? ''}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2090] bg-blue-50"
                      />
                    </div>
                  ))}
              </div>
            )}

            {callType.prepCardFields.filter(f => !f.autoFillKey).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 mt-4">Fill in before the call</p>
                {callType.prepCardFields
                  .filter(f => !f.autoFillKey)
                  .map(field => (
                    <div key={field.key} className="mb-2">
                      <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                      {field.wide ? (
                        <textarea
                          value={prepCard[field.key] ?? ''}
                          onChange={e => updateField(field.key, e.target.value)}
                          placeholder={field.placeholder ?? ''}
                          rows={2}
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2090] resize-none"
                        />
                      ) : (
                        <input
                          type="text"
                          value={prepCard[field.key] ?? ''}
                          onChange={e => updateField(field.key, e.target.value)}
                          placeholder={field.placeholder ?? ''}
                          className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2090] ${
                            prepCard[field.key] ? 'border-gray-200' : 'border-orange-200 bg-orange-50'
                          }`}
                        />
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Log call button */}
          <div className="px-5 py-4 border-t border-gray-100">
            <a
              href={callType.tallyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2.5 text-sm font-medium transition"
            >
              📋 Log Call → Tally
            </a>
            <p className="text-xs text-gray-400 text-center mt-1.5">Opens in new tab — fill out immediately after the call</p>
          </div>
        </div>

        {/* Right: Script */}
        <div className="w-3/5 overflow-y-auto bg-white">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">Script</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                <span className="inline-block w-3 h-3 rounded bg-blue-50 border border-blue-200 mr-1 align-middle" />
                Filled value
                <span className="inline-block w-3 h-3 rounded bg-orange-50 border border-orange-200 ml-3 mr-1 align-middle" />
                Needs filling
                <span className="inline-block w-3 h-3 rounded bg-indigo-50 border border-indigo-200 ml-3 mr-1 align-middle" />
                Screen action
              </p>
            </div>
          </div>

          <div className="px-6 py-4">
            <ScriptRenderer template={callType.script} values={prepCard} />
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
    </div>
  );
}
