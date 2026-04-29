'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';

interface NPSSurvey {
  id: string;
  student_id: string;
  token: string;
  sent_at: string;
  responded_at: string | null;
  score: number | null;
  feedback: string | null;
  student?: { name: string; email: string } | null;
}

function npsCategory(score: number): 'promoter' | 'passive' | 'detractor' {
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'passive';
  return 'detractor';
}

export default function NPSDashboardPage() {
  const [surveys, setSurveys] = useState<NPSSurvey[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from('nps_surveys')
      .select('*, student:students(name, email)')
      .order('sent_at', { ascending: false })
      .then(({ data }) => {
        setSurveys((data as any) ?? []);
        setLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const responded = surveys.filter(s => s.score != null);
  const promoters  = responded.filter(s => npsCategory(s.score!) === 'promoter').length;
  const detractors = responded.filter(s => npsCategory(s.score!) === 'detractor').length;
  const npsScore   = responded.length
    ? Math.round(((promoters - detractors) / responded.length) * 100)
    : null;
  const avgScore = responded.length
    ? (responded.reduce((a, s) => a + s.score!, 0) / responded.length).toFixed(1)
    : null;

  const responseRate = surveys.length
    ? Math.round((responded.length / surveys.length) * 100)
    : null;

  const categoryColors = {
    promoter:  'bg-green-100 text-green-700',
    passive:   'bg-amber-100 text-amber-700',
    detractor: 'bg-red-100 text-red-700',
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">NPS Surveys</h1>
        <p className="text-gray-500 text-sm mt-1">Net Promoter Score — sent automatically after every 4th completed session</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card p-5 text-center">
          <p className="text-3xl font-bold text-gray-900">{surveys.length}</p>
          <p className="text-sm text-gray-500 mt-1">Surveys sent</p>
        </div>
        <div className="card p-5 text-center">
          <p className="text-3xl font-bold text-gray-900">{responded.length}</p>
          <p className="text-sm text-gray-500 mt-1">Responses ({responseRate ?? 0}%)</p>
        </div>
        <div className="card p-5 text-center">
          <p className={`text-3xl font-bold ${npsScore === null ? 'text-gray-400' : npsScore >= 50 ? 'text-green-600' : npsScore >= 0 ? 'text-amber-500' : 'text-red-500'}`}>
            {npsScore === null ? '—' : (npsScore >= 0 ? '+' : '') + npsScore}
          </p>
          <p className="text-sm text-gray-500 mt-1">NPS Score</p>
        </div>
        <div className="card p-5 text-center">
          <p className="text-3xl font-bold text-gray-900">{avgScore ?? '—'}</p>
          <p className="text-sm text-gray-500 mt-1">Avg score / 10</p>
        </div>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-gray-400 animate-pulse">Loading surveys…</div>
      ) : surveys.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500">No surveys sent yet. Surveys are sent automatically after every 4th completed session.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-header">Student</th>
                <th className="table-header">Sent</th>
                <th className="table-header text-center">Score</th>
                <th className="table-header text-center">Category</th>
                <th className="table-header">Feedback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {surveys.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <p className="font-medium text-gray-900">{s.student?.name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{s.student?.email}</p>
                  </td>
                  <td className="table-cell text-sm text-gray-500">
                    {new Date(s.sent_at).toLocaleDateString()}
                    {s.responded_at && (
                      <p className="text-xs text-gray-400">
                        Responded {new Date(s.responded_at).toLocaleDateString()}
                      </p>
                    )}
                  </td>
                  <td className="table-cell text-center">
                    {s.score != null ? (
                      <span className="text-lg font-bold text-gray-900">{s.score}</span>
                    ) : (
                      <span className="text-gray-300 text-sm italic">Pending</span>
                    )}
                  </td>
                  <td className="table-cell text-center">
                    {s.score != null ? (
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${categoryColors[npsCategory(s.score)]}`}>
                        {npsCategory(s.score)}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="table-cell text-sm text-gray-600 max-w-xs">
                    {s.feedback ? (
                      <p className="line-clamp-2">{s.feedback}</p>
                    ) : (
                      <span className="text-gray-300 italic text-xs">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
