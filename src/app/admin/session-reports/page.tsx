'use client';

import { useEffect, useState, useMemo } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { formatDateTime } from '@/lib/utils';
import { Download, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

function Stars({ n }: { n: number | null }) {
  if (!n) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span className="text-yellow-500 text-sm">
      {'★'.repeat(n)}{'☆'.repeat(5 - n)}
    </span>
  );
}

function ReportBadge({ submitted }: { submitted: boolean }) {
  if (submitted) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Submitted</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Pending</span>;
}

export default function SessionReportsPage() {
  const supabase = createClient();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [nudging, setNudging] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  // Filters
  const [filterStatus, setFilterStatus] = useState<'all' | 'submitted' | 'pending'>('all');
  const [filterTutor, setFilterTutor] = useState('');
  const [filterStudent, setFilterStudent] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, status, report_submitted, report_submitted_at, topics_covered, student_engagement, session_notes, next_session_plan, homework_assigned, tutor:tutors(id, name, email), student:students(id, name)')
      .eq('status', 'completed')
      .order('scheduled_at', { ascending: false })
      .limit(500);
    setSessions((data as any[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function nudgeTutor(s: any) {
    setNudging(s.id);
    try {
      const res = await fetch('/api/admin/nudge-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: s.id }),
      });
      if (res.ok) {
        setToast(`Reminder sent to ${s.tutor?.name ?? 'tutor'}`);
      } else {
        setToast('Failed to send reminder');
      }
    } finally {
      setNudging(null);
      setTimeout(() => setToast(''), 3000);
    }
  }

  const tutors = useMemo(() => {
    const names = Array.from(new Set(sessions.map((s: any) => s.tutor?.name).filter(Boolean))) as string[];
    return names.sort();
  }, [sessions]);

  const filtered = useMemo(() => sessions.filter((s: any) => {
    if (filterStatus === 'submitted' && !s.report_submitted) return false;
    if (filterStatus === 'pending' && s.report_submitted) return false;
    if (filterTutor && s.tutor?.name !== filterTutor) return false;
    if (filterStudent && !(s.student?.name ?? '').toLowerCase().includes(filterStudent.toLowerCase())) return false;
    if (filterFrom && s.scheduled_at < filterFrom) return false;
    if (filterTo && s.scheduled_at > filterTo + 'T23:59:59') return false;
    return true;
  }), [sessions, filterStatus, filterTutor, filterStudent, filterFrom, filterTo]);

  const total = sessions.length;
  const submitted = sessions.filter((s: any) => s.report_submitted).length;
  const pending = total - submitted;
  const rate = total > 0 ? Math.round((submitted / total) * 100) : 0;

  function exportCSV() {
    const rows = [
      ['Date', 'Student', 'Tutor', 'Duration', 'Engagement', 'Topics', 'Status'].join(','),
      ...filtered.map((s: any) => [
        formatDateTime(s.scheduled_at),
        s.student?.name ?? '',
        s.tutor?.name ?? '',
        s.duration_minutes,
        s.student_engagement ?? '',
        `"${(s.topics_covered ?? '').replace(/"/g, '""')}"`,
        s.report_submitted ? 'Submitted' : 'Pending',
      ].join(',')),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'session-reports.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const inputCls = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-navy-500';

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Session Reports</h1>
          <p className="text-gray-500 text-sm mt-1">Tutor-submitted reports for completed sessions</p>
        </div>
        <button onClick={exportCSV} className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Completed', value: total },
          { label: 'Reports Submitted', value: submitted },
          { label: 'Reports Pending', value: pending },
          { label: 'Submission Rate', value: `${rate}%` },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <p className="text-xs text-gray-500 font-medium">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4 mb-5 flex flex-wrap gap-3 items-center">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className={inputCls}>
          <option value="all">All statuses</option>
          <option value="submitted">Submitted</option>
          <option value="pending">Pending</option>
        </select>
        <select value={filterTutor} onChange={e => setFilterTutor(e.target.value)} className={inputCls}>
          <option value="">All tutors</option>
          {tutors.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search student..."
          value={filterStudent}
          onChange={e => setFilterStudent(e.target.value)}
          className={inputCls}
        />
        <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className={inputCls} />
        <span className="text-gray-400 text-sm">→</span>
        <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className={inputCls} />
        <button onClick={() => { setFilterStatus('all'); setFilterTutor(''); setFilterStudent(''); setFilterFrom(''); setFilterTo(''); }} className="text-sm text-gray-500 hover:text-gray-700">Reset</button>
        <span className="ml-auto text-sm text-gray-500">{filtered.length} sessions</span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-header">Date</th>
              <th className="table-header">Student</th>
              <th className="table-header">Tutor</th>
              <th className="table-header">Duration</th>
              <th className="table-header">Engagement</th>
              <th className="table-header">Topics</th>
              <th className="table-header">Status</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && (
              <tr><td colSpan={8} className="table-cell text-center py-8 text-gray-400">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} className="table-cell text-center py-8 text-gray-400">No sessions match filters</td></tr>
            )}
            {filtered.map((s: any) => {
              const isExpanded = expanded === s.id;
              return (
                <>
                  <tr
                    key={s.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpanded(isExpanded ? null : s.id)}
                  >
                    <td className="table-cell text-sm font-medium">{formatDateTime(s.scheduled_at)}</td>
                    <td className="table-cell">{s.student?.name ?? '—'}</td>
                    <td className="table-cell">{s.tutor?.name ?? '—'}</td>
                    <td className="table-cell">{s.duration_minutes}m</td>
                    <td className="table-cell"><Stars n={s.student_engagement} /></td>
                    <td className="table-cell text-sm text-gray-600 max-w-xs">
                      <span className="line-clamp-1">{s.topics_covered ?? <span className="text-gray-400">—</span>}</span>
                    </td>
                    <td className="table-cell"><ReportBadge submitted={!!s.report_submitted} /></td>
                    <td className="table-cell" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpanded(isExpanded ? null : s.id)}
                          className="text-xs text-navy-600 hover:text-navy-800 font-medium"
                        >
                          {isExpanded ? 'Collapse' : 'View'}
                        </button>
                        {!s.report_submitted && (
                          <button
                            onClick={() => nudgeTutor(s)}
                            disabled={nudging === s.id}
                            className="text-xs text-orange-600 hover:text-orange-800 font-medium disabled:opacity-40"
                          >
                            {nudging === s.id ? 'Sending…' : 'Nudge'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${s.id}-detail`}>
                      <td colSpan={8} className="px-6 py-5 bg-gray-50">
                        {s.report_submitted ? (
                          <div className="grid grid-cols-2 gap-5 text-sm">
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Topics Covered</p>
                              <p className="text-gray-800">{s.topics_covered}</p>
                            </div>
                            {s.session_notes && (
                              <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Session Notes</p>
                                <p className="text-gray-800">{s.session_notes}</p>
                              </div>
                            )}
                            {s.homework_assigned && (
                              <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Homework Assigned</p>
                                <p className="text-gray-800">{s.homework_assigned}</p>
                              </div>
                            )}
                            {s.next_session_plan && (
                              <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Plan for Next Session</p>
                                <p className="text-gray-800">{s.next_session_plan}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Student Engagement</p>
                              <Stars n={s.student_engagement} />
                            </div>
                            {s.report_submitted_at && (
                              <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Submitted</p>
                                <p className="text-gray-600">{formatDateTime(s.report_submitted_at)}</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 text-orange-700">
                            <AlertCircle className="w-4 h-4" />
                            <p className="text-sm">No report submitted yet. <button onClick={() => nudgeTutor(s)} className="underline font-medium hover:text-orange-900">Send a reminder to {s.tutor?.name}</button>.</p>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-sm px-4 py-3 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </AdminLayout>
  );
}
