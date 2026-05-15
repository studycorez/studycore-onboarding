'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, Eye } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface PortalPickerModalProps {
  type: 'student' | 'parent' | 'tutor';
  onClose: () => void;
}

interface StudentRow {
  id: string;
  name: string;
  parent_email: string | null;
  tutorName: string | null;
}

interface TutorRow {
  id: string;
  name: string;
  activeStudents: number;
}

export default function PortalPickerModal({ type, onClose }: PortalPickerModalProps) {
  const [query, setQuery]           = useState('');
  const [students, setStudents]     = useState<StudentRow[]>([]);
  const [tutors, setTutors]         = useState<TutorRow[]>([]);
  const [fetching, setFetching]     = useState(true);
  const [loadingBtn, setLoadingBtn] = useState<string | null>(null);
  const searchRef                   = useRef<HTMLInputElement>(null);
  const supabase                    = createClient();

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Focus search on open
  useEffect(() => { searchRef.current?.focus(); }, []);

  // Fetch data on open
  useEffect(() => {
    if (type === 'tutor') {
      fetchTutors();
    } else {
      fetchStudents();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  async function fetchStudents() {
    setFetching(true);
    const [{ data: studentRows }, { data: contractRows }] = await Promise.all([
      supabase.from('students').select('id, name, parent_email').order('name'),
      supabase.from('contracts').select('student_id, tutor:tutors(name)').eq('status', 'signed'),
    ]);

    // Build student_id → tutor name map (first signed contract)
    const tutorMap = new Map<string, string>();
    for (const c of contractRows ?? []) {
      if (!tutorMap.has(c.student_id) && (c.tutor as any)?.name) {
        tutorMap.set(c.student_id, (c.tutor as any).name);
      }
    }

    setStudents((studentRows ?? []).map(s => ({
      id:          s.id,
      name:        s.name,
      parent_email: s.parent_email ?? null,
      tutorName:   tutorMap.get(s.id) ?? null,
    })));
    setFetching(false);
  }

  async function fetchTutors() {
    setFetching(true);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: tutorRows }, { data: sessionRows }] = await Promise.all([
      supabase.from('tutors').select('id, name').is('archived_at', null).order('name'),
      supabase
        .from('sessions')
        .select('tutor_id, student_id')
        .or(`status.eq.scheduled,and(status.eq.completed,scheduled_at.gte.${thirtyDaysAgo})`),
    ]);

    // Build tutor_id → active student count
    const activeMap = new Map<string, Set<string>>();
    for (const s of sessionRows ?? []) {
      if (!activeMap.has(s.tutor_id)) activeMap.set(s.tutor_id, new Set());
      activeMap.get(s.tutor_id)!.add(s.student_id);
    }

    setTutors((tutorRows ?? []).map(t => ({
      id:             t.id,
      name:           t.name,
      activeStudents: activeMap.get(t.id)?.size ?? 0,
    })));
    setFetching(false);
  }

  const openPortal = useCallback(async (
    portalType: 'student' | 'parent' | 'tutor',
    id: string,
    btnKey: string,
  ) => {
    setLoadingBtn(btnKey);
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: portalType, id }),
      });
      const { token } = await res.json();
      window.open(
        `/${portalType}-portal/impersonate?token=${encodeURIComponent(token)}`,
        '_blank',
      );
    } finally {
      setLoadingBtn(null);
    }
  }, []);

  const title = type === 'tutor' ? 'Tutor Portal' : type === 'student' ? 'Student Portal' : 'Parent Portal';

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(query.toLowerCase())
  );
  const filteredTutors = tutors.filter(t =>
    t.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-navy-600" />
            <h2 className="text-base font-semibold text-gray-900">{title} — View As</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2">
          <input
            ref={searchRef}
            type="text"
            placeholder={`Search ${type === 'tutor' ? 'tutors' : 'students'}…`}
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {fetching ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : type === 'tutor' ? (
            filteredTutors.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">No tutors found</p>
            ) : (
              <div className="space-y-1">
                {filteredTutors.map(t => {
                  const btnKey = `tutor-${t.id}`;
                  const busy   = loadingBtn === btnKey;
                  return (
                    <div key={t.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                        <p className="text-xs text-gray-400">
                          {t.activeStudents} active student{t.activeStudents !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => openPortal('tutor', t.id, btnKey)}
                        disabled={!!loadingBtn}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-navy-50 text-navy-700 rounded-lg hover:bg-navy-100 disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                        Tutor View
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            filteredStudents.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">No students found</p>
            ) : (
              <div className="space-y-1">
                {filteredStudents.map(s => {
                  const studentKey = `student-${s.id}`;
                  const parentKey  = `parent-${s.id}`;
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {s.tutorName ? `Tutor: ${s.tutorName}` : 'No tutor assigned'}
                          {s.parent_email ? ` · ${s.parent_email}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => openPortal('student', s.id, studentKey)}
                          disabled={!!loadingBtn}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          {loadingBtn === studentKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                          Student
                        </button>
                        <button
                          onClick={() => openPortal('parent', s.id, parentKey)}
                          disabled={!!loadingBtn}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          {loadingBtn === parentKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                          Parent
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
