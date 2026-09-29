'use client';

import { useEffect, useState } from 'react';
import type { SscStudent } from '@/lib/ghl-support';

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
  '4d31767c-c855-41ea-982c-4f4c5f0f3c25': 'Guarantee Case',
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
  '4d31767c-c855-41ea-982c-4f4c5f0f3c25': 'bg-red-100 text-red-700',
};

export default function SscPage() {
  const [authed, setAuthed]     = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [students, setStudents] = useState<SscStudent[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('sc_auth') === 'true') setAuthed(true);
  }, []);

  useEffect(() => {
    if (authed) fetchStudents();
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

  function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (password === 'StudyCore25') {
      localStorage.setItem('sc_auth', 'true');
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

  const filtered = students.filter(s =>
    s.studentName.toLowerCase().includes(search.toLowerCase()) ||
    s.parentName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1e2090] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">SSC Dashboard</h1>
          <p className="text-blue-200 text-sm mt-0.5">Student call center — scripts, prep cards, and SOPs</p>
        </div>
        <button onClick={fetchStudents} className="text-blue-200 hover:text-white text-sm transition">↻ Refresh</button>
      </div>

      {/* Nav */}
      <div className="bg-white border-b border-gray-200 px-6 py-2 flex gap-1">
        <a href="/match-queue" className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">Operations</a>
        <a href="/tqc"         className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">TQC</a>
        <a href="/check-ins"   className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">Check-ins</a>
        <a href="/ssc"         className="px-4 py-2 rounded-lg text-sm font-medium bg-[#1e2090] text-white">SSC</a>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Search */}
        <div className="mb-5 flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by student or parent name..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2090]"
          />
          <span className="text-sm text-gray-500">{filtered.length} students</span>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading students...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No students found.</div>
        ) : (
          <div className="space-y-2">
            {filtered.map(student => (
              <a
                key={student.opportunityId}
                href={`/ssc/${student.opportunityId}`}
                className="block bg-white rounded-xl border border-gray-200 px-5 py-4 hover:border-[#1e2090] hover:shadow-sm transition group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="font-semibold text-gray-900 group-hover:text-[#1e2090] transition">
                        {student.studentName}
                      </div>
                      <div className="text-sm text-gray-500 mt-0.5">
                        Parent: {student.parentName || '—'}
                        {student.tutorAssigned && (
                          <span className="ml-3 text-gray-400">Tutor: {student.tutorAssigned}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {student.currentScore && student.targetScore && (
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">{student.currentScore}</span>
                        <span className="text-gray-400 mx-1">→</span>
                        <span className="font-medium text-[#1e2090]">{student.targetScore}</span>
                      </div>
                    )}

                    {student.hoursRemaining > 0 && (
                      <div className={`text-xs px-2 py-0.5 rounded-full ${student.hoursRemaining <= 5 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                        {Math.round(student.hoursRemaining)}h left
                      </div>
                    )}

                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STAGE_COLORS[student.stageId] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STAGE_LABELS[student.stageId] ?? 'Unknown'}
                    </span>

                    <span className="text-gray-300 group-hover:text-[#1e2090] transition text-lg">›</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
