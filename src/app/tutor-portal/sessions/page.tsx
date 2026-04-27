'use client';

import { useEffect, useState } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/ui/Badge';
import { Check, ExternalLink } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

type Filter = 'all' | 'scheduled' | 'completed' | 'cancelled';

export default function TutorSessionsPage() {
  const { tutor, loading } = useTutorAuth();
  const supabase = createClient();
  const [sessions, setSessions] = useState<any[]>([]);
  const [filter,   setFilter]   = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!tutor) return;
    let q = supabase
      .from('sessions')
      .select('*, student:students(name), session_logs(*)')
      .eq('tutor_id', tutor.id)
      .order('scheduled_at', { ascending: false })
      .limit(100);
    if (filter !== 'all') q = q.eq('status', filter);
    q.then(({ data }) => setSessions((data as any[]) ?? []));
  }, [tutor, filter]);

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
              <th className="table-header">Log</th>
              <th className="table-header">Zoom</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sessions.length === 0 && (
              <tr><td colSpan={6} className="table-cell text-center py-8 text-gray-400">No sessions found</td></tr>
            )}
            {sessions.map((s: any) => {
              const log = s.session_logs?.[0];
              return (
                <>
                  <tr
                    key={s.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                  >
                    <td className="table-cell font-medium text-sm">{formatDateTime(s.scheduled_at)}</td>
                    <td className="table-cell">{s.student?.name ?? '—'}</td>
                    <td className="table-cell">{s.duration_minutes}min</td>
                    <td className="table-cell"><StatusBadge status={s.status} /></td>
                    <td className="table-cell">
                      {log ? (
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
                  {expanded === s.id && log && (
                    <tr key={`${s.id}-detail`}>
                      <td colSpan={6} className="px-5 py-4 bg-gray-50 text-sm">
                        <div className="grid grid-cols-3 gap-4">
                          {log.went_well    && <div><p className="text-xs text-gray-500 font-medium mb-1">Went Well</p><p className="text-gray-700">{log.went_well}</p></div>}
                          {log.issues       && <div><p className="text-xs text-gray-500 font-medium mb-1">Issues</p><p className="text-gray-700">{log.issues}</p></div>}
                          {log.homework     && <div><p className="text-xs text-gray-500 font-medium mb-1">Homework</p><p className="text-gray-700">{log.homework}</p></div>}
                        </div>
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
