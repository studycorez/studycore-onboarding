'use client';

import { useEffect, useState } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { ExternalLink, FileText, Download, PlayCircle } from 'lucide-react';

type Category = 'all' | 'sop' | 'training' | 'sat_content' | 'other' | 'general';

const CATEGORY_TABS: { value: Category; label: string }[] = [
  { value: 'all',         label: 'All'         },
  { value: 'sop',         label: 'SOP'         },
  { value: 'training',    label: 'Training'    },
  { value: 'sat_content', label: 'SAT Content' },
  { value: 'other',       label: 'Other'       },
];

const TYPE_COLORS: Record<string, string> = {
  loom:  'bg-purple-100 text-purple-700',
  pdf:   'bg-red-100 text-red-700',
  video: 'bg-blue-100 text-blue-700',
  doc:   'bg-green-100 text-green-700',
  other: 'bg-gray-100 text-gray-600',
};

export default function TutorResourcesPage() {
  const { tutor, loading } = useTutorAuth();
  const supabase = createClient();
  const [resources, setResources] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [category,  setCategory]  = useState<Category>('all');

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/resources').then(r => r.json()),
    ]).then(([res]) => setResources(res ?? []));
  }, []);

  useEffect(() => {
    if (!tutor) return;
    supabase
      .from('contracts')
      .select('id, status, signed_at, game_plan_url, student:students(name)')
      .eq('tutor_id', tutor.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setContracts((data as any[]) ?? []));
  }, [tutor]);

  const filtered = category === 'all'
    ? resources
    : resources.filter(r => r.category === category);

  if (loading) return null;

  return (
    <TutorPortalLayout tutor={tutor}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Resources</h1>
        <p className="text-gray-500 text-sm mt-1">Training materials, guides, and content</p>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {CATEGORY_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setCategory(tab.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              category === tab.value ? 'bg-navy-900 text-white' : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Resources grid */}
      {filtered.length === 0 ? (
        <p className="text-gray-400 text-sm">No resources in this category.</p>
      ) : (
        <div className="grid grid-cols-3 gap-5 mb-8">
          {filtered.map((r: any) => (
            <div key={r.id} className="card p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-gray-900 text-sm leading-snug flex-1">{r.title}</h3>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 capitalize ${TYPE_COLORS[r.type] ?? TYPE_COLORS.other}`}>
                  {r.type}
                </span>
              </div>
              {r.description && <p className="text-sm text-gray-500 line-clamp-2">{r.description}</p>}
              <div className="mt-auto">
                {r.type === 'loom' && r.url && (
                  <a href={r.url} target="_blank" rel="noopener"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-purple-700 hover:text-purple-900">
                    <PlayCircle className="w-4 h-4" /> Watch
                  </a>
                )}
                {r.type === 'pdf' && (r.file_url || r.url) && (
                  <a href={r.file_url ?? r.url} target="_blank" rel="noopener" download
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700 hover:text-red-900">
                    <Download className="w-4 h-4" /> Download
                  </a>
                )}
                {r.type !== 'loom' && r.type !== 'pdf' && (r.file_url || r.url) && (
                  <a href={r.file_url ?? r.url} target="_blank" rel="noopener"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-navy-900">
                    <ExternalLink className="w-4 h-4" /> View
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* My Contracts section */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">My Contracts</h2>
        </div>
        {contracts.length === 0 ? (
          <p className="px-5 py-6 text-gray-400 text-sm">No contracts yet.</p>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
              <tr>
                <th className="table-header">Student</th>
                <th className="table-header">Status</th>
                <th className="table-header">Signed</th>
                <th className="table-header">Game Plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {contracts.map((c: any) => (
                <tr key={c.id}>
                  <td className="table-cell">{c.student?.name ?? '—'}</td>
                  <td className="table-cell capitalize">{c.status}</td>
                  <td className="table-cell text-sm text-gray-500">{c.signed_at ? new Date(c.signed_at).toLocaleDateString() : '—'}</td>
                  <td className="table-cell">
                    {c.game_plan_url
                      ? <a href={c.game_plan_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-navy-600 hover:underline"><FileText className="w-3 h-3" />View</a>
                      : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </TutorPortalLayout>
  );
}
