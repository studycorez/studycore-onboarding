'use client';

import { useEffect, useState, useMemo } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { User, Search, ChevronDown, ChevronRight, Video, Calendar, Clock, FileText, CalendarPlus, UserPlus, Copy, Check, Link2 } from 'lucide-react';
import ProposeSessionModal from '@/components/tutor-portal/ProposeSessionModal';
import RequestStudentModal from '@/components/tutor-portal/RequestStudentModal';
import { format } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudentRow {
  id: string;
  name: string;
  email: string | null;
  grade: number | null;
  target_score: number | null;
  current_score: number | null;
  purchased_hours: number | null;
  used_hours: number | null;
  upcomingCount: number;
  lastSession: string | null;
  upcomingSessions: UpcomingSession[];
  game_plan_url: string | null;
  permanent_zoom_link: string | null;
}

interface UpcomingSession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  zoom_join_url: string | null;
}

type SortKey = 'name' | 'upcoming' | 'hours';

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-teal-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-rose-500', 'bg-indigo-500', 'bg-cyan-500',
];

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function displayEmail(email: string | null): string | null {
  if (!email) return null;
  if (email.endsWith('@studycore.import') || email.startsWith('student-')) return null;
  return email;
}

function hoursStatus(remaining: number): 'good' | 'low' | 'critical' {
  if (remaining <= 0) return 'critical';
  if (remaining < 5)  return 'low';
  return 'good';
}

const BORDER_COLOR = {
  good:     'border-l-green-400',
  low:      'border-l-amber-400',
  critical: 'border-l-red-400',
};

const HOURS_COLOR = {
  good:     'text-green-700',
  low:      'text-amber-600',
  critical: 'text-red-600 font-semibold',
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TutorStudentsPage() {
  const { tutor, loading: authLoading } = useTutorAuth();
  const supabase = createClient();

  const [students,  setStudents]  = useState<StudentRow[]>([]);
  const [fetching,  setFetching]  = useState(true);
  const [search,    setSearch]    = useState('');
  const [sort,      setSort]      = useState<SortKey>('upcoming');
  const [expanded,  setExpanded]  = useState<string | null>(null);

  // Propose session modal
  const [proposeOpen,      setProposeOpen]      = useState(false);
  const [proposeStudentId, setProposeStudentId] = useState<string>('');

  // Request student modal
  const [requestStudentOpen, setRequestStudentOpen] = useState(false);

  // Copy link feedback
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  useEffect(() => {
    if (!tutor) return;

    const now          = new Date().toISOString();
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    setFetching(true);

    Promise.all([
      // Students via contracts (signed, pending, active)
      supabase
        .from('contracts')
        .select('student_id, permanent_zoom_link, status, student:students(id,name,email,grade,target_score,current_score,purchased_hours,used_hours,game_plan_url)')
        .eq('tutor_id', tutor.id)
        .in('status', ['signed', 'pending', 'active']),

      // Recent sessions (last 90 days + all scheduled)
      supabase
        .from('sessions')
        .select('id, student_id, scheduled_at, status, duration_minutes, zoom_join_url, student:students(id,name,email,grade,target_score,current_score,purchased_hours,used_hours,game_plan_url)')
        .eq('tutor_id', tutor.id)
        .or(`status.eq.scheduled,and(status.in.(completed,no_show_student,no_show_tutor,no_show_both),scheduled_at.gte.${new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()})`)
        .order('scheduled_at', { ascending: true }),

      // Upcoming session counts (for sorting)
      supabase
        .from('sessions')
        .select('student_id')
        .eq('tutor_id', tutor.id)
        .eq('status', 'scheduled')
        .gte('scheduled_at', now),
    ]).then(([contracts, sessionsRes, upcomingRes]) => {

      // ── Build permanent zoom link map: student_id → link ─────────────────
      const permanentLinkMap = new Map<string, string>();
      for (const c of (contracts.data ?? []) as any[]) {
        if (c.permanent_zoom_link && c.student_id && !permanentLinkMap.has(c.student_id)) {
          permanentLinkMap.set(c.student_id, c.permanent_zoom_link);
        }
      }

      // ── Pass 1: Build ID-keyed map. Contracts take precedence. ────────────
      const studentMap = new Map<string, any>();

      for (const c of (contracts.data ?? []) as any[]) {
        const s = Array.isArray(c.student) ? c.student[0] : c.student;
        if (!s?.id) continue;
        if (!studentMap.has(s.id)) {
          studentMap.set(s.id, { ...s, _source: 'contract' });
        }
      }
      for (const row of (sessionsRes.data ?? []) as any[]) {
        const s = Array.isArray(row.student) ? row.student[0] : row.student;
        if (!s?.id) continue;
        if (!studentMap.has(s.id)) {
          studentMap.set(s.id, { ...s, _source: 'session' });
        } else {
          // Merge: promote real email over placeholder on the same ID
          const existing = studentMap.get(s.id)!;
          if (!displayEmail(existing.email) && displayEmail(s.email)) {
            studentMap.set(s.id, { ...existing, email: s.email });
          }
        }
      }

      // ── Pass 2: Name-based dedup ──────────────────────────────────────────
      // The same real person sometimes has two DB records: one with a real
      // email (from import) and one with a @studycore.import placeholder
      // (created when sessions were booked).  Collapse them by normalized
      // name, keeping the real-email record and discarding the placeholder.

      const normName = (n: string) =>
        n.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

      // nameKey → canonical ID (the one we keep)
      const nameToCanonical = new Map<string, string>();
      // duplicateId → canonicalId (for remapping session data)
      const idRemap = new Map<string, string>();

      for (const [id, s] of studentMap) {
        const key = normName(s.name ?? '');
        if (!key) continue;
        if (!nameToCanonical.has(key)) {
          nameToCanonical.set(key, id);
        } else {
          const canonId = nameToCanonical.get(key)!;
          const canon   = studentMap.get(canonId)!;
          const hasRealEmail      = !!displayEmail(s.email);
          const canonHasRealEmail = !!displayEmail(canon.email);

          if (hasRealEmail && !canonHasRealEmail) {
            // Current entry is better — swap canonical
            studentMap.set(id, { ...s, _source: canon._source === 'contract' ? 'contract' : s._source });
            nameToCanonical.set(key, id);
            idRemap.set(canonId, id);
            studentMap.delete(canonId);
          } else {
            // Keep existing canonical, drop current
            idRemap.set(id, canonId);
            studentMap.delete(id);
          }
        }
      }

      // ── Build session lookup maps (fold remapped IDs into canonical) ──────
      const resolve = (id: string) => idRemap.get(id) ?? id;

      const lastSessionMap      = new Map<string, string>();
      const upcomingSessionsMap = new Map<string, UpcomingSession[]>();

      for (const row of (sessionsRes.data ?? []) as any[]) {
        if (!row.student_id) continue;
        const cid = resolve(row.student_id);

        if (row.status === 'completed') {
          // sessions ordered asc → last write wins = most recent
          lastSessionMap.set(cid, row.scheduled_at);
        }

        if (row.status === 'scheduled' && new Date(row.scheduled_at) >= new Date()) {
          const arr = upcomingSessionsMap.get(cid) ?? [];
          arr.push({
            id:               row.id,
            scheduled_at:     row.scheduled_at,
            duration_minutes: row.duration_minutes ?? 60,
            zoom_join_url:    row.zoom_join_url ?? null,
          });
          upcomingSessionsMap.set(cid, arr);
        }
      }

      // ── Upcoming counts ───────────────────────────────────────────────────
      const upcomingCount = new Map<string, number>();
      for (const row of (upcomingRes.data ?? []) as any[]) {
        const cid = resolve(row.student_id);
        upcomingCount.set(cid, (upcomingCount.get(cid) ?? 0) + 1);
      }

      // ── Assemble final list ────────────────────────────────────────────────
      const list: StudentRow[] = Array.from(studentMap.values()).map(s => ({
        id:                  s.id,
        name:                s.name ?? 'Unknown',
        email:               s.email ?? null,
        grade:               s.grade ?? null,
        target_score:        s.target_score ?? null,
        current_score:       s.current_score ?? null,
        purchased_hours:     s.purchased_hours ?? null,
        used_hours:          s.used_hours ?? null,
        lastSession:         lastSessionMap.get(s.id) ?? null,
        upcomingCount:       upcomingCount.get(s.id) ?? 0,
        game_plan_url:       s.game_plan_url ?? null,
        permanent_zoom_link: permanentLinkMap.get(s.id) ?? null,
        upcomingSessions:    (upcomingSessionsMap.get(s.id) ?? []).sort(
          (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
        ),
      }));

      if (process.env.NODE_ENV === 'development') {
        console.log(`[tutor-portal/students] deduplicated: ${list.length} unique students (raw map had ${studentMap.size})`);
      }

      setStudents(list);
      setFetching(false);
    }).catch(() => setFetching(false));
  }, [tutor]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtering + sorting ────────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = search
      ? students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
      : students;

    list = [...list].sort((a, b) => {
      if (sort === 'upcoming') {
        if (b.upcomingCount !== a.upcomingCount) return b.upcomingCount - a.upcomingCount;
        return a.name.localeCompare(b.name);
      }
      if (sort === 'hours') {
        const ra = Math.max(0, (a.purchased_hours ?? 0) - (a.used_hours ?? 0));
        const rb = Math.max(0, (b.purchased_hours ?? 0) - (b.used_hours ?? 0));
        return ra - rb; // lowest first (most urgent)
      }
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [students, search, sort]);

  if (authLoading || fetching) return null;

  return (
    <TutorPortalLayout tutor={tutor}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Students</h1>
          <p className="text-gray-500 text-sm mt-1">
            {students.length} student{students.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setRequestStudentOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-navy-700 text-white hover:bg-navy-800 transition-colors"
        >
          <UserPlus className="w-4 h-4" /> Request New Student
        </button>
      </div>

      {students.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <User className="w-12 h-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No students yet</p>
          <p className="text-gray-400 text-sm">Students appear once you have a signed contract or a session.</p>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search students…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-400 bg-white"
              />
            </div>
            <div className="flex items-center gap-1 text-sm text-gray-500">
              <span className="text-xs font-medium">Sort:</span>
              {(['upcoming', 'hours', 'name'] as SortKey[]).map(key => (
                <button
                  key={key}
                  onClick={() => setSort(key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    sort === key
                      ? 'bg-navy-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {key === 'upcoming' ? 'Sessions' : key === 'hours' ? 'Hours' : 'Name'}
                </button>
              ))}
            </div>
          </div>

          {/* Student list */}
          <div className="space-y-2">
            {displayed.length === 0 && (
              <div className="card py-10 text-center text-gray-400 text-sm">
                No students match &ldquo;{search}&rdquo;
              </div>
            )}
            {displayed.map(s => {
              const remaining  = Math.max(0, (s.purchased_hours ?? 0) - (s.used_hours ?? 0));
              const status     = hoursStatus(remaining);
              const gap        = s.target_score != null && s.current_score != null
                ? s.target_score - s.current_score
                : null;
              const isExpanded = expanded === s.id;
              const email      = displayEmail(s.email);

              return (
                <div
                  key={s.id}
                  className={`bg-white rounded-xl border border-gray-200 border-l-4 ${BORDER_COLOR[status]} shadow-sm overflow-hidden`}
                >
                  {/* Main row */}
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : s.id)}
                    className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors"
                  >
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full ${avatarColor(s.id)} flex items-center justify-center flex-shrink-0`}>
                      <span className="text-white text-sm font-bold">{initials(s.name)}</span>
                    </div>

                    {/* Name + grade */}
                    <div className="min-w-0 flex-shrink-0 w-40">
                      <p className="font-semibold text-gray-900 leading-tight truncate">{s.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {s.grade != null && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                            Gr. {s.grade}
                          </span>
                        )}
                        {email ? (
                          <span className="text-xs text-gray-400 truncate">{email}</span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Email not on file</span>
                        )}
                      </div>
                    </div>

                    {/* Score columns */}
                    <div className="hidden md:flex items-center gap-6 flex-1 text-sm">
                      <div className="text-center min-w-[72px]">
                        <p className="text-xs text-gray-400 mb-0.5">Target</p>
                        <p className="font-semibold text-gray-900">
                          {s.target_score ?? <span className="text-gray-300">—</span>}
                        </p>
                      </div>
                      <div className="text-center min-w-[72px]">
                        <p className="text-xs text-gray-400 mb-0.5">Current</p>
                        <p className="font-semibold text-gray-900">
                          {s.current_score ?? <span className="text-gray-300">—</span>}
                        </p>
                      </div>
                      <div className="text-center min-w-[72px]">
                        <p className="text-xs text-gray-400 mb-0.5">Gap</p>
                        <p className={`font-semibold ${gap != null ? (gap <= 50 ? 'text-green-600' : gap <= 150 ? 'text-amber-600' : 'text-red-600') : 'text-gray-300'}`}>
                          {gap != null ? `+${gap}` : '—'}
                        </p>
                      </div>
                      <div className="text-center min-w-[80px]">
                        <p className="text-xs text-gray-400 mb-0.5">Hrs Left</p>
                        <p className={`font-semibold ${HOURS_COLOR[status]}`}>
                          {s.purchased_hours != null ? `${remaining.toFixed(1)}h` : <span className="text-gray-300">—</span>}
                        </p>
                      </div>
                      <div className="text-center min-w-[72px]">
                        <p className="text-xs text-gray-400 mb-0.5">Upcoming</p>
                        <p className={`font-semibold ${s.upcomingCount > 0 ? 'text-navy-700' : 'text-gray-400'}`}>
                          {s.upcomingCount > 0 ? `${s.upcomingCount} session${s.upcomingCount !== 1 ? 's' : ''}` : '—'}
                        </p>
                      </div>
                      <div className="text-center min-w-[96px]">
                        <p className="text-xs text-gray-400 mb-0.5">Last Session</p>
                        <p className="font-medium text-gray-700 text-xs">
                          {s.lastSession
                            ? format(new Date(s.lastSession), 'MMM d')
                            : <span className="text-gray-300">—</span>}
                        </p>
                      </div>
                    </div>

                    {/* Expand chevron */}
                    <div className="ml-auto flex-shrink-0 text-gray-400">
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4" />
                        : <ChevronRight className="w-4 h-4" />}
                    </div>
                  </button>

                  {/* Expanded — upcoming sessions */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                      {/* Mobile stats */}
                      <div className="flex md:hidden gap-4 mb-4 text-sm flex-wrap">
                        {[
                          { label: 'Target',  value: s.target_score  ?? '—' },
                          { label: 'Current', value: s.current_score ?? '—' },
                          { label: 'Gap',     value: gap != null ? `+${gap}` : '—' },
                          { label: 'Hrs Left',value: s.purchased_hours != null ? `${remaining.toFixed(1)}h` : '—' },
                        ].map(col => (
                          <div key={col.label} className="text-center">
                            <p className="text-xs text-gray-400">{col.label}</p>
                            <p className="font-semibold text-gray-900">{col.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Game Plan */}
                      <div className="flex items-center gap-2 mb-4">
                        <FileText className="w-3.5 h-3.5 text-gray-400" />
                        {s.game_plan_url ? (
                          <a
                            href={s.game_plan_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-navy-700 hover:text-navy-900 underline underline-offset-2"
                            onClick={e => e.stopPropagation()}
                          >
                            View Game Plan
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No game plan uploaded</span>
                        )}
                      </div>

                      {/* Permanent Zoom Link */}
                      {s.permanent_zoom_link && (
                        <div className="flex items-center gap-2 mb-4 p-3 bg-white rounded-lg border border-gray-200">
                          <Link2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          <span className="text-xs text-gray-500 font-medium flex-shrink-0">Session Link:</span>
                          <a
                            href={s.permanent_zoom_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-navy-700 hover:text-navy-900 underline underline-offset-2 truncate flex-1"
                            onClick={e => e.stopPropagation()}
                          >
                            {s.permanent_zoom_link}
                          </a>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(s.permanent_zoom_link!);
                              setCopiedLinkId(s.id);
                              setTimeout(() => setCopiedLinkId(null), 2000);
                            }}
                            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
                            title="Copy link"
                          >
                            {copiedLinkId === s.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      )}

                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Upcoming Sessions
                      </p>
                      {s.upcomingSessions.length === 0 ? (
                        <p className="text-sm text-gray-400 italic">No upcoming sessions scheduled.</p>
                      ) : (
                        <div className="space-y-2">
                          {s.upcomingSessions.map(sess => (
                            <div
                              key={sess.id}
                              className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-4 py-3"
                            >
                              <Calendar className="w-4 h-4 text-navy-400 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900">
                                  {format(new Date(sess.scheduled_at), 'EEEE, MMMM d')}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                  <Clock className="w-3 h-3" />
                                  {format(new Date(sess.scheduled_at), 'h:mm a')}
                                  <span className="text-gray-300">·</span>
                                  {sess.duration_minutes} min
                                </div>
                              </div>
                              {sess.zoom_join_url && (
                                <a
                                  href={sess.zoom_join_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors flex-shrink-0"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <Video className="w-3.5 h-3.5" />
                                  Join Zoom
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setProposeStudentId(s.id);
                          setProposeOpen(true);
                        }}
                        className="mt-3 flex items-center gap-1.5 text-xs font-medium text-navy-700 hover:text-navy-900 bg-navy-50 hover:bg-navy-100 border border-navy-200 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                        Propose a Session
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tutor && (
        <ProposeSessionModal
          open={proposeOpen}
          onClose={() => setProposeOpen(false)}
          onSuccess={() => {}}
          students={students.map(s => ({ id: s.id, name: s.name }))}
          defaultStudentId={proposeStudentId || undefined}
        />
      )}

      <RequestStudentModal open={requestStudentOpen} onClose={() => setRequestStudentOpen(false)} />
    </TutorPortalLayout>
  );
}
