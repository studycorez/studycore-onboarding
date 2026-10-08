'use client';

import { useEffect, useState } from 'react';
import type { SscStudent } from '@/lib/ghl-support';
import { calcTotalSessions } from '@/lib/ghl-support';
import { calcCheckInReminders, hasSchedule } from '@/lib/ssc-schedule';

const STAGE_LABELS: Record<string, string> = {
  '79095236-7c28-4684-b7ce-29d03e2d1c86': 'New Enrollment',
  'eb217c7e-1f20-4a6d-aeec-f5123fe625db': 'Form Completed',
  'f145c10b-bd9f-4794-ab8b-1d3cdc6c3707': 'Diagnostic Done',
  'e3af64f6-0af3-487f-aa5c-f8b05f3a84a3': 'Onboarding Call Done',
  '34126179-af56-4feb-969d-aec6dd9b6547': 'Session 1 Done',
  '22ddfa4c-a618-467f-b894-980d2d2ef4af': 'Session 3 Done',
  '99803c34-071c-476c-a513-e3789816bf85': 'Active',
  '3294f8d5-ff1c-4368-b0a0-17c3bf0cccc5': 'Phase 1 Done',
  '0f27807f-987a-44a4-9e3e-6399c4f73ff4': 'Phase 2 Done',
  'd3e839e1-1128-4308-9d51-93b8f2b7dd0d': 'Phase 3 Done',
  'd4454fd6-e20f-476d-896b-d4ad2c55c021': 'Phase 4 Done',
  '54e8aab9-ddd4-40d9-ab0a-95a7fb753c23': 'Low Hours',
  'b3731eaf-3b6f-4db2-9369-d0665f7f6e03': 'SAT Day Done',
  'eefacac9-3cbd-46ba-a711-ac24bc00a16c': 'Results Done',
};

const STAGE_COLORS: Record<string, string> = {
  '79095236-7c28-4684-b7ce-29d03e2d1c86': 'bg-gray-100 text-gray-600',
  'eb217c7e-1f20-4a6d-aeec-f5123fe625db': 'bg-blue-100 text-blue-700',
  'f145c10b-bd9f-4794-ab8b-1d3cdc6c3707': 'bg-blue-100 text-blue-700',
  'e3af64f6-0af3-487f-aa5c-f8b05f3a84a3': 'bg-yellow-100 text-yellow-800',
  '34126179-af56-4feb-969d-aec6dd9b6547': 'bg-green-100 text-green-700',
  '22ddfa4c-a618-467f-b894-980d2d2ef4af': 'bg-green-100 text-green-700',
  '99803c34-071c-476c-a513-e3789816bf85': 'bg-emerald-100 text-emerald-700',
  '3294f8d5-ff1c-4368-b0a0-17c3bf0cccc5': 'bg-purple-100 text-purple-700',
  '0f27807f-987a-44a4-9e3e-6399c4f73ff4': 'bg-purple-100 text-purple-700',
  'd3e839e1-1128-4308-9d51-93b8f2b7dd0d': 'bg-purple-100 text-purple-700',
  'd4454fd6-e20f-476d-896b-d4ad2c55c021': 'bg-purple-100 text-purple-700',
  '54e8aab9-ddd4-40d9-ab0a-95a7fb753c23': 'bg-orange-100 text-orange-700',
  'b3731eaf-3b6f-4db2-9369-d0665f7f6e03': 'bg-gray-100 text-gray-600',
  'eefacac9-3cbd-46ba-a711-ac24bc00a16c': 'bg-gray-100 text-gray-600',
};

// Next action to take based on pipeline stage
function getNextAction(stageId: string, hoursRemaining: number): { label: string; cls: string } | null {
  if (hoursRemaining > 0 && hoursRemaining <= 5) {
    return { label: 'Renewal Flag', cls: 'bg-red-100 text-red-700 border border-red-200' };
  }
  switch (stageId) {
    case '79095236-7c28-4684-b7ce-29d03e2d1c86':
    case 'eb217c7e-1f20-4a6d-aeec-f5123fe625db':
    case 'f145c10b-bd9f-4794-ab8b-1d3cdc6c3707':
      return { label: 'Onboarding Call', cls: 'bg-blue-100 text-blue-700 border border-blue-200' };
    case '34126179-af56-4feb-969d-aec6dd9b6547':
      return { label: 'Post-Session 1', cls: 'bg-green-100 text-green-700 border border-green-200' };
    case '22ddfa4c-a618-467f-b894-980d2d2ef4af':
      return { label: 'Weekly Sync', cls: 'bg-teal-100 text-teal-700 border border-teal-200' };
    case '99803c34-071c-476c-a513-e3789816bf85':
      return { label: 'Weekly Sync', cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' };
    case '3294f8d5-ff1c-4368-b0a0-17c3bf0cccc5':
    case '0f27807f-987a-44a4-9e3e-6399c4f73ff4':
    case 'd3e839e1-1128-4308-9d51-93b8f2b7dd0d':
    case 'd4454fd6-e20f-476d-896b-d4ad2c55c021':
      return { label: 'Phase Check-in', cls: 'bg-purple-100 text-purple-700 border border-purple-200' };
    case '54e8aab9-ddd4-40d9-ab0a-95a7fb753c23':
      return { label: 'Renewal Flag', cls: 'bg-orange-100 text-orange-700 border border-orange-200' };
    case 'b3731eaf-3b6f-4db2-9369-d0665f7f6e03':
      return { label: 'Post-SAT Call', cls: 'bg-indigo-100 text-indigo-700 border border-indigo-200' };
    case 'eefacac9-3cbd-46ba-a711-ac24bc00a16c':
      return { label: 'Results Call', cls: 'bg-gray-100 text-gray-600 border border-gray-200' };
    default:
      return null;
  }
}

// Sort priority: urgent flags first, then early-stage, then active, then late/done
function stageSortOrder(stageId: string, hoursRemaining: number): number {
  if (hoursRemaining > 0 && hoursRemaining <= 5) return 0; // renewal flags top
  const order: Record<string, number> = {
    '54e8aab9-ddd4-40d9-ab0a-95a7fb753c23': 1,  // Low Hours
    'b3731eaf-3b6f-4db2-9369-d0665f7f6e03': 2,  // SAT Day Done
    '3294f8d5-ff1c-4368-b0a0-17c3bf0cccc5': 3,  // Phase 1 Done
    '0f27807f-987a-44a4-9e3e-6399c4f73ff4': 3,
    'd3e839e1-1128-4308-9d51-93b8f2b7dd0d': 3,
    'd4454fd6-e20f-476d-896b-d4ad2c55c021': 3,
    '34126179-af56-4feb-969d-aec6dd9b6547': 4,  // Session 1 Done
    '22ddfa4c-a618-467f-b894-980d2d2ef4af': 4,
    '99803c34-071c-476c-a513-e3789816bf85': 5,  // Active
    'e3af64f6-0af3-487f-aa5c-f8b05f3a84a3': 6,  // Onboarding Call Done
    'f145c10b-bd9f-4794-ab8b-1d3cdc6c3707': 7,  // Diagnostic Done
    'eb217c7e-1f20-4a6d-aeec-f5123fe625db': 8,
    '79095236-7c28-4684-b7ce-29d03e2d1c86': 9,
    'eefacac9-3cbd-46ba-a711-ac24bc00a16c': 10, // Results Done (least urgent)
  };
  return order[stageId] ?? 99;
}

interface FulfillmentHealth {
  churnRate:       number;
  deliveryRate:    number;
  atRiskCount:     number;
  openDisputes:    number;
  activeStudents:  number;
  refundsThisMonth: number;
  sessionsHeld:    number;
  sessionsNoShow:  number;
  asOf:            string;
}

type FilterTab = 'all' | 'flags' | 'onboarding' | 'active';

const ONBOARDING_STAGES = new Set([
  '79095236-7c28-4684-b7ce-29d03e2d1c86',
  'eb217c7e-1f20-4a6d-aeec-f5123fe625db',
  'f145c10b-bd9f-4794-ab8b-1d3cdc6c3707',
  'e3af64f6-0af3-487f-aa5c-f8b05f3a84a3',
]);
const ACTIVE_STAGES = new Set([
  '34126179-af56-4feb-969d-aec6dd9b6547',
  '22ddfa4c-a618-467f-b894-980d2d2ef4af',
  '99803c34-071c-476c-a513-e3789816bf85',
  '3294f8d5-ff1c-4368-b0a0-17c3bf0cccc5',
  '0f27807f-987a-44a4-9e3e-6399c4f73ff4',
  'd3e839e1-1128-4308-9d51-93b8f2b7dd0d',
  'd4454fd6-e20f-476d-896b-d4ad2c55c021',
]);
const FLAG_STAGES = new Set([
  '54e8aab9-ddd4-40d9-ab0a-95a7fb753c23',
  'b3731eaf-3b6f-4db2-9369-d0665f7f6e03',
  'eefacac9-3cbd-46ba-a711-ac24bc00a16c',
]);

export default function SscPage() {
  const [authed, setAuthed]       = useState(false);
  const [password, setPassword]   = useState('');
  const [authError, setAuthError] = useState('');
  const [students, setStudents]   = useState<SscStudent[]>([]);
  const [loading, setLoading]     = useState(false);
  const [search, setSearch]       = useState('');
  const [tab, setTab]             = useState<FilterTab>('all');
  const [health, setHealth]       = useState<FulfillmentHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('sc_auth') === 'true') setAuthed(true);
  }, []);

  useEffect(() => {
    if (authed) {
      fetchStudents();
      fetchHealth();
    }
  }, [authed]);

  async function fetchStudents() {
    setLoading(true);
    try {
      const res = await fetch('/api/ssc-students');
      const data = await res.json();
      setStudents(data.students ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function fetchHealth() {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/fulfillment-health');
      if (res.ok) setHealth(await res.json());
    } finally {
      setHealthLoading(false);
    }
  }

  function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (password === 'Founders25') {
      localStorage.setItem('sc_auth', 'true');
      localStorage.setItem('sc_admin', 'true');
      setAuthed(true);
    } else if (password === 'StudyCore25') {
      localStorage.setItem('sc_auth', 'true');
      localStorage.removeItem('sc_admin');
      setAuthed(true);
    } else {
      setAuthError('Incorrect password');
    }
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

  const bySearch = students.filter(s =>
    s.studentName.toLowerCase().includes(search.toLowerCase()) ||
    s.parentName.toLowerCase().includes(search.toLowerCase())
  );

  const filtered = bySearch.filter(s => {
    if (tab === 'flags') return FLAG_STAGES.has(s.stageId) || (s.hoursRemaining > 0 && s.hoursRemaining <= 5);
    if (tab === 'onboarding') return ONBOARDING_STAGES.has(s.stageId);
    if (tab === 'active') return ACTIVE_STAGES.has(s.stageId);
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const diff = stageSortOrder(a.stageId, a.hoursRemaining) - stageSortOrder(b.stageId, b.hoursRemaining);
    if (diff !== 0) return diff;
    return a.studentName.localeCompare(b.studentName);
  });

  // Tab counts (from search-filtered, pre-tab-filter)
  const counts = {
    all:        bySearch.length,
    flags:      bySearch.filter(s => FLAG_STAGES.has(s.stageId) || (s.hoursRemaining > 0 && s.hoursRemaining <= 5)).length,
    onboarding: bySearch.filter(s => ONBOARDING_STAGES.has(s.stageId)).length,
    active:     bySearch.filter(s => ACTIVE_STAGES.has(s.stageId)).length,
  };

  const tabClass = (t: FilterTab) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
      tab === t ? 'bg-[#1e2090] text-white' : 'text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1e2090] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">SSC Dashboard</h1>
          <p className="text-blue-200 text-sm mt-0.5">Student call center — scripts, prep cards, and SOPs</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchStudents} className="text-blue-200 hover:text-white text-sm transition">↻ Refresh</button>
          <button
            onClick={() => {
              localStorage.removeItem('sc_auth');
              localStorage.removeItem('sc_admin');
              setAuthed(false);
            }}
            className="text-blue-200 hover:text-white text-sm transition"
          >
            Log out
          </button>
        </div>
      </div>

      {/* Nav */}
      <div className="bg-white border-b border-gray-200 px-6 py-2 flex gap-1">
        <a href="/match-queue" className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">Operations</a>
        <a href="/tqc"         className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">TQC</a>
        <a href="/check-ins"   className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">Check-ins</a>
        <a href="/ssc"         className="px-4 py-2 rounded-lg text-sm font-medium bg-[#1e2090] text-white">SSC</a>
      </div>

      {/* Fulfillment Health Panel */}
      <div className="max-w-5xl mx-auto px-6 pt-4">
        {healthLoading ? (
          <div className="text-xs text-gray-400 mb-4">Loading fulfillment data...</div>
        ) : health ? (
          <div className="grid grid-cols-4 gap-3 mb-4">
            {/* Churn Rate */}
            <div className={`rounded-xl border px-4 py-3 ${health.churnRate > 5 ? 'bg-red-50 border-red-200' : health.churnRate > 2 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
              <div className="text-xs text-gray-500 mb-1">Churn Rate</div>
              <div className={`text-2xl font-bold ${health.churnRate > 5 ? 'text-red-600' : health.churnRate > 2 ? 'text-yellow-700' : 'text-green-700'}`}>
                {health.churnRate}%
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{health.refundsThisMonth} refund{health.refundsThisMonth !== 1 ? 's' : ''} this month</div>
            </div>

            {/* Session Delivery */}
            <div className={`rounded-xl border px-4 py-3 ${health.deliveryRate < 80 ? 'bg-red-50 border-red-200' : health.deliveryRate < 90 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
              <div className="text-xs text-gray-500 mb-1">Session Delivery</div>
              <div className={`text-2xl font-bold ${health.deliveryRate < 80 ? 'text-red-600' : health.deliveryRate < 90 ? 'text-yellow-700' : 'text-green-700'}`}>
                {health.deliveryRate}%
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{health.sessionsHeld} held · {health.sessionsNoShow} no-show</div>
            </div>

            {/* At Risk */}
            <div className={`rounded-xl border px-4 py-3 ${health.atRiskCount > 10 ? 'bg-red-50 border-red-200' : health.atRiskCount > 5 ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className="text-xs text-gray-500 mb-1">At Risk</div>
              <div className={`text-2xl font-bold ${health.atRiskCount > 10 ? 'text-red-600' : health.atRiskCount > 5 ? 'text-yellow-700' : 'text-gray-700'}`}>
                {health.atRiskCount}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">≤5h remaining · {health.activeStudents} active</div>
            </div>

            {/* Open Disputes */}
            <div className={`rounded-xl border px-4 py-3 ${health.openDisputes > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className="text-xs text-gray-500 mb-1">Open Disputes</div>
              <div className={`text-2xl font-bold ${health.openDisputes > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                {health.openDisputes}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">needs_response in Stripe</div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Search + filter tabs */}
        <div className="mb-4 flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by student or parent name..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2090]"
          />
        </div>

        <div className="flex gap-2 mb-5">
          <button onClick={() => setTab('all')}        className={tabClass('all')}>
            All <span className="text-xs opacity-70">{counts.all}</span>
          </button>
          <button onClick={() => setTab('flags')}      className={tabClass('flags')}>
            Flags
            {counts.flags > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'flags' ? 'bg-red-400 text-white' : 'bg-red-100 text-red-700'}`}>
                {counts.flags}
              </span>
            )}
          </button>
          <button onClick={() => setTab('onboarding')} className={tabClass('onboarding')}>
            Onboarding <span className="text-xs opacity-70">{counts.onboarding}</span>
          </button>
          <button onClick={() => setTab('active')}     className={tabClass('active')}>
            Active <span className="text-xs opacity-70">{counts.active}</span>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading students...</div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No students found.</div>
        ) : (
          <div className="space-y-2">
            {sorted.map(student => {
              const nextAction    = getNextAction(student.stageId, student.hoursRemaining);
              const hasProgress  = student.hoursPurchased > 0;
              const pct          = hasProgress ? Math.min(100, Math.round((student.hoursCompleted / student.hoursPurchased) * 100)) : 0;
              const isLow        = student.hoursRemaining > 0 && student.hoursRemaining <= 5;
              const totalSessions = calcTotalSessions(student);
              const barColor     = isLow ? 'bg-red-400' : pct >= 75 ? 'bg-orange-400' : 'bg-[#1e2090]';

              // Check-in badges
              let checkinBadge: { label: string; cls: string } | null = null;
              if (hasSchedule(student.availability)) {
                const reminders = calcCheckInReminders(student);
                const hasOverdue = reminders.some(r => r.status === 'overdue');
                const hasDueThisWeek = !hasOverdue && reminders.some(r => r.status === 'this-week' || r.status === 'today');
                if (hasOverdue) {
                  checkinBadge = { label: 'Overdue', cls: 'bg-red-100 text-red-700 border border-red-200' };
                } else if (hasDueThisWeek) {
                  checkinBadge = { label: 'Due this week', cls: 'bg-yellow-100 text-yellow-700 border border-yellow-200' };
                }
              }

              return (
                <a
                  key={student.opportunityId}
                  href={`/ssc/${student.opportunityId}`}
                  className="block bg-white rounded-xl border border-gray-200 px-5 py-4 hover:border-[#1e2090] hover:shadow-sm transition group"
                >
                  {/* Top row */}
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 group-hover:text-[#1e2090] transition truncate">
                        {student.studentName}
                      </div>
                      <div className="text-sm text-gray-500 mt-0.5">
                        {student.contactName || student.parentName || '—'}
                        {student.tutorAssigned && (
                          <span className="ml-3 text-gray-400">· {student.tutorAssigned}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 flex-shrink-0 ml-4">
                      {checkinBadge && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${checkinBadge.cls}`}>
                          {checkinBadge.label}
                        </span>
                      )}
                      {nextAction && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${nextAction.cls}`}>
                          {nextAction.label}
                        </span>
                      )}
                      {student.currentScore && student.targetScore && (
                        <div className="text-sm text-gray-600 whitespace-nowrap">
                          <span className="font-medium">{student.currentScore}</span>
                          <span className="text-gray-400 mx-1">→</span>
                          <span className="font-medium text-[#1e2090]">{student.targetScore}</span>
                        </div>
                      )}
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${STAGE_COLORS[student.stageId] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STAGE_LABELS[student.stageId] ?? 'Unknown'}
                      </span>
                      <span className="text-gray-300 group-hover:text-[#1e2090] transition text-lg">›</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {hasProgress && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                        <span>
                          <span className={`font-semibold ${isLow ? 'text-red-600' : 'text-gray-700'}`}>
                            {Math.round(student.hoursCompleted)}
                          </span>
                          /{student.hoursPurchased}h
                          {student.sessionsCompleted > 0 && totalSessions > 0 && (
                            <span className="ml-2 text-gray-400">· {student.sessionsCompleted}/{totalSessions} sessions</span>
                          )}
                        </span>
                        <span className={isLow ? 'text-red-500 font-semibold' : ''}>{pct}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
