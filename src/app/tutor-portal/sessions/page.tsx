'use client';

import { useEffect, useState } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/ui/Badge';
import { Check, ExternalLink, Loader2 } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

type Filter = 'all' | 'scheduled' | 'completed' | 'cancelled';

export default function TutorSessionsPage() {
  const { tutor, loading } = useTutorAuth();
  const supabase = createClient();
  const [sessions, setSessions] = useState<any[]>([]);
  const [filter,   setFilter]   = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Score form state per session
  const [scoreForm, setScoreForm] = useState<Record<string, { math: string; reading: string; writing: string; total: string }>>({});
  const [scoreSaving, setScoreSaving] = useState<string | null>(null);
  const [scoreSuccess, setScoreSuccess] = useState<Set<string>>(new Set());

  async function load() {
    if (!tutor) return;
    let q = supabase
      .from('sessions')
      .select('*, student:students(name), session_logs(*), student_progress(*)')
      .eq('tutor_id', tutor.id)
      .order('scheduled_at', { ascending: false })
      .limit(100);
    if (filter !== 'all') q = q.eq('status', filter);
    const { data } = await q;
    setSessions((data as any[]) ?? []);
  }

  useEffect(() => { load(); }, [tutor, filter]);

  function getScoreForm(sessionId: string) {
    return scoreForm[sessionId] ?? { math: '', reading: '', writing: '', total: '' };
  }

  function setScoreField(sessionId: string, field: string, value: string) {
    setScoreForm(prev => ({
      ...prev,
      [sessionId]: { ...getScoreForm(sessionId), [field]: value },
    }));
  }

  async function submitScore(sessionId: string, studentId: string) {
    const form = getScoreForm(sessionId);
    if (!form.math && !form.reading && !form.writing && !form.total) return;
    setScoreSaving(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          math_score:    form.math    ? parseInt(form.math)    : null,
          reading_score: form.reading ? parseInt(form.reading) : null,
          writing_score: form.writing ? parseInt(form.writing) : null,
          total_score:   form.total   ? parseInt(form.total)   : null,
        }),
      });
      if (res.ok) {
        setScoreSuccess(prev => new Set(prev).add(sessionId));
        setScoreForm(prev => ({ ...prev, [sessionId]: { math: '', reading: '', writing: '', total: '' } }));
        await load();
      }
    } finally {
      setScoreSaving(null);
    }
  }

  if (loading) return null;

  return (
    <TutorPortalLayout tutor={tutor}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
        <p className="text-gray-500 text-sm mt-1">{sessions.length} sessions</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {(['all','scheduled','completed','cancelled'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              filter === f ? 'bg-navy-900 text-white' : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-header">Date & Time</th>
              <th className="table-header">Student</th>
              <th className="table-header">Duration</th>
              <th className="table-header">Status</th>
              <th className="table-header">Notes</th>
              <th className="table-header">Zoom</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sessions.length === 0 && (
              <tr><td colSpan={6} className="table-cell text-center py-8 text-gray-400">No sessions found</td></tr>
            )}
            {sessions.map((s: any) => {
              const log = s.session_logs?.[0];
              const scores = (s.student_progress ?? []).sort((a: any, b: any) =>
                new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
              );
              const latestScore = scores[0] ?? null;
              const isExpanded = expanded === s.id;
              const form = getScoreForm(s.id);
              const isPast = new Date(s.scheduled_at) < new Date();

              return (
                <>
                  <tr
                    key={s.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpanded(isExpanded ? null : s.id)}
                  >
                    <td className="table-cell font-medium text-sm">{formatDateTime(s.scheduled_at)}</td>
                    <td className="table-cell">{s.student?.name ?? '—'}</td>
                    <td className="table-cell">{s.duration_minutes}min</td>
                    <td className="table-cell"><StatusBadge status={s.status} /></td>
                    <td className="table-cell">
                      {s.tutor_notes ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                          <Check className="w-3 h-3" /> Submitted
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="table-cell">
                      {s.zoom_join_url
                        ? <a href={s.zoom_join_url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-navy-600 hover:text-navy-800 text-xs font-medium">
                            <ExternalLink className="w-3 h-3" />Join
                          </a>
                        : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${s.id}-detail`}>
                      <td colSpan={6} className="px-5 py-4 bg-gray-50 text-sm space-y-4">
                        {/* Tutor notes */}
                        {s.tutor_notes && (
                          <div>
                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1.5">Session Notes</p>
                            <p className="text-gray-700">{s.tutor_notes}</p>
                            {s.homework_assigned && (
                              <p className="text-gray-600 mt-1"><span className="font-medium">Homework:</span> {s.homework_assigned}</p>
                            )}
                          </div>
                        )}
                        {/* Old session log */}
                        {log && !s.tutor_notes && (
                          <div className="grid grid-cols-3 gap-4">
                            {log.went_well && <div><p className="text-xs text-gray-500 font-medium mb-1">Went Well</p><p className="text-gray-700">{log.went_well}</p></div>}
                            {log.issues    && <div><p className="text-xs text-gray-500 font-medium mb-1">Issues</p><p className="text-gray-700">{log.issues}</p></div>}
                            {log.homework  && <div><p className="text-xs text-gray-500 font-medium mb-1">Homework</p><p className="text-gray-700">{log.homework}</p></div>}
                          </div>
                        )}
                        {/* Existing scores */}
                        {latestScore && (
                          <div>
                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1.5">Latest Score</p>
                            <div className="flex gap-4 text-sm">
                              {latestScore.math_score    && <span><span className="text-gray-500">Math:</span> <strong>{latestScore.math_score}</strong></span>}
                              {latestScore.reading_score && <span><span className="text-gray-500">Reading:</span> <strong>{latestScore.reading_score}</strong></span>}
                              {latestScore.writing_score && <span><span className="text-gray-500">Writing:</span> <strong>{latestScore.writing_score}</strong></span>}
                              {latestScore.total_score   && <span><span className="text-gray-500">Total:</span> <strong className="text-navy-700">{latestScore.total_score}</strong></span>}
                            </div>
                          </div>
                        )}
                        {/* Score entry form — only for past sessions */}
                        {isPast && (
                          <div className="border-t border-gray-200 pt-3">
                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">
                              {scoreSuccess.has(s.id) ? '✓ Score logged' : 'Log Score'}
                            </p>
                            <div className="flex items-end gap-2 flex-wrap">
                              {(['math', 'reading', 'writing', 'total'] as const).map(field => (
                                <div key={field}>
                                  <label className="block text-xs text-gray-500 capitalize mb-1">{field}</label>
                                  <input
                                    type="number"
                                    value={form[field]}
                                    onChange={e => setScoreField(s.id, field, e.target.value)}
                                    className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-navy-500"
                                    placeholder={field === 'total' ? '1600' : '800'}
                                  />
                                </div>
                              ))}
                              <button
                                onClick={() => submitScore(s.id, s.student_id)}
                                disabled={scoreSaving === s.id || (!form.math && !form.reading && !form.writing && !form.total)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-navy-900 text-white text-sm font-medium rounded hover:bg-navy-800 disabled:opacity-40 transition-colors"
                              >
                                {scoreSaving === s.id && <Loader2 className="w-3 h-3 animate-spin" />}
                                Save
                              </button>
                            </div>
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
    </TutorPortalLayout>
  );
}
