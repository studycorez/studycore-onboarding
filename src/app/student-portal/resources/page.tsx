'use client';

import { useEffect, useState } from 'react';
import { useStudentAuth } from '@/hooks/useStudentAuth';
import StudentPortalLayout from '@/components/student-portal/StudentPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { ExternalLink, FolderOpen } from 'lucide-react';

interface Resource {
  id: string;
  title: string;
  url: string | null;
  subject: string | null;
  resource_type: string | null;
  notes: string | null;
  created_at: string;
}

const SUBJECTS = ['Math', 'Reading', 'Writing', 'Science', 'General'];

const TYPE_STYLES: Record<string, { label: string; cls: string }> = {
  khan_academy:   { label: 'Khan Academy',   cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  college_board:  { label: 'College Board',  cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  video:          { label: 'Video',          cls: 'bg-red-100 text-red-800 border-red-200' },
  pdf:            { label: 'PDF',            cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  custom:         { label: 'Custom',         cls: 'bg-[#1e2090]/10 text-[#1e2090] border-[#1e2090]/20' },
};

export default function ResourcesPage() {
  const { student, loading } = useStudentAuth();
  const supabase = createClient();
  const [resources, setResources] = useState<Resource[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!student) return;
    supabase
      .from('student_resources')
      .select('id, title, url, subject, resource_type, notes, created_at')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setResources((data as any[]) ?? []); setDataLoading(false); });
  }, [student]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || dataLoading) {
    return (
      <StudentPortalLayout student={null}>
        <div className="animate-pulse space-y-3 max-w-2xl">
          {[1, 2, 3].map(i => <div key={i} className="h-20 card rounded-xl" />)}
        </div>
      </StudentPortalLayout>
    );
  }
  if (!student) return null;

  const grouped: Record<string, Resource[]> = {};
  for (const r of resources) {
    const key = r.subject ?? 'General';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  const orderedSubjects = SUBJECTS.filter(s => grouped[s]);

  return (
    <StudentPortalLayout student={student}>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Resources</h1>
          <p className="text-gray-500 text-sm mt-1">Study materials shared by your tutor</p>
        </div>

        {resources.length === 0 ? (
          <div className="card p-10 text-center">
            <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Your tutor will add resources here as you progress.</p>
          </div>
        ) : (
          orderedSubjects.map(subject => (
            <div key={subject} className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="text-sm font-semibold text-gray-700">{subject}</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {grouped[subject].map(r => {
                  const typeInfo = TYPE_STYLES[r.resource_type ?? ''] ?? { label: r.resource_type ?? 'Resource', cls: 'bg-gray-100 text-gray-600 border-gray-200' };
                  return (
                    <div key={r.id} className="px-5 py-4 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900">{r.title}</p>
                          <span className={`text-xs font-medium border rounded-full px-2 py-0.5 ${typeInfo.cls}`}>
                            {typeInfo.label}
                          </span>
                        </div>
                        {r.notes && <p className="text-xs text-gray-500 mt-1">{r.notes}</p>}
                      </div>
                      {r.url && (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener"
                          className="flex items-center gap-1.5 text-xs font-semibold text-[#1e2090] hover:text-[#161870] flex-shrink-0 mt-0.5"
                        >
                          Open <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </StudentPortalLayout>
  );
}
