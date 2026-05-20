'use client';

import { useEffect, useState } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/ui/Badge';
import { ExternalLink, Copy, Check, Video, BookOpen, Users, UserPlus, CheckSquare, Square, PlayCircle } from 'lucide-react';
import { format, startOfDay, endOfDay, differenceInCalendarDays } from 'date-fns';
import RequestStudentModal from '@/components/tutor-portal/RequestStudentModal';

// ── Color palette (hash by id) ─────────────────────────────────────────────
const PALETTE = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1'];
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ── Avatar bubble ──────────────────────────────────────────────────────────
function Avatar({ name, id, size = 36 }: { name: string; id: string; size?: number }) {
  const bg = avatarColor(id);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.4, flexShrink: 0,
    }}>
      {name.trim()[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

// ── Copy button ────────────────────────────────────────────────────────────
function CopyBtn({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={handleCopy}
      title="Copy Zoom link"
      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── Upcoming session card ──────────────────────────────────────────────────
function UpcomingCard({
  s,
  lastHomework,
  now,
}: {
  s: any;
  lastHomework: string | null;
  now: Date;
}) {
  const startMs   = new Date(s.scheduled_at).getTime();
  const endMs     = startMs + s.duration_minutes * 60 * 1000;
  const msToStart = startMs - now.getTime();
  const ongoing   = now.getTime() >= startMs && now.getTime() < endMs;
  const canJoin   = msToStart <= 30 * 60 * 1000 || ongoing;

  const dateLabel    = format(new Date(s.scheduled_at), "EEE, MMM d 'at' h:mm a");
  const studentName: string = (s.student as any)?.name ?? '—';
  const studentId: string   = (s.student as any)?.id ?? s.student_id ?? '';

  // Days-until label (shown when > 30 min away)
  function daysUntilLabel(): string {
    const daysAway = differenceInCalendarDays(new Date(s.scheduled_at), now);
    if (daysAway === 0) {
      if (msToStart > 60 * 60 * 1000) {
        return `in ${Math.floor(msToStart / (60 * 60 * 1000))}h ${Math.floor((msToStart % (60 * 60 * 1000)) / 60000)}m`;
      }
      return `in ${Math.floor(msToStart / 60000)}m`;
    }
    if (daysAway === 1) return 'tomorrow';
    return `in ${daysAway} days`;
  }

  return (
    <div className="px-5 py-4 flex flex-col gap-3">
      {/* Row 1: avatar + info + join */}
      <div className="flex items-center gap-3">
        <Avatar name={studentName} id={studentId} size={40} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 truncate">{studentName}</p>
          <p className="text-xs text-gray-500">{dateLabel} · {s.duration_minutes} min</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {s.zoom_join_url && <CopyBtn url={s.zoom_join_url} />}
          {s.zoom_join_url && canJoin && (
            <a
              href={s.zoom_join_url}
              target="_blank"
              rel="noopener"
              className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                ongoing
                  ? 'bg-green-600 text-white hover:bg-green-700 animate-pulse'
                  : 'bg-navy-600 text-white hover:bg-navy-700'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              {ongoing ? 'In Progress' : 'Join Zoom'}
            </a>
          )}
          {!canJoin && (
            <span className="text-xs text-gray-400 font-medium px-2 whitespace-nowrap">
              {daysUntilLabel()}
            </span>
          )}
        </div>
      </div>

      {/* Row 2: homework/prep note */}
      {lastHomework && (
        <div className="flex items-start gap-2 bg-amber-50 rounded-lg px-3 py-2.5">
          <BookOpen className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-700 mb-0.5">Last homework assigned</p>
            <p className="text-xs text-amber-800 leading-snug line-clamp-2">{lastHomework}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onboarding checklist types ─────────────────────────────────────────────
type ChecklistKey = 'profile_complete' | 'availability_set' | 'calendar_connected' | 'training_video_watched' | 'students_reviewed';

// ── Page ───────────────────────────────────────────────────────────────────
export default function TutorDashboardPage() {
  const { tutor, loading } = useTutorAuth();
  const supabase = createClient();

  const [todaySessions,    setTodaySessions]    = useState<any[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([]);
  const [homeworkMap,      setHomeworkMap]      = useState<Record<string, string>>({});
  const [stats, setStats] = useState({ students: 0, sessionsMonth: 0, hoursMonth: 0, earningsMonth: 0 });
  const [missingReports,      setMissingReports]      = useState(0);
  const [requestStudentOpen,  setRequestStudentOpen]  = useState(false);
  const [onboardingChecklist, setOnboardingChecklist] = useState<Record<string, string>>({});
  const [hasAvailability,     setHasAvailability]     = useState(false);
  const [markingItem,         setMarkingItem]         = useState<ChecklistKey | null>(null);

  // Tick every 30 s to keep "Join" window accurate
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!tutor) return;
    const nowIso     = new Date().toISOString();
    const todayStart = startOfDay(new Date()).toISOString();
    const todayEnd   = endOfDay(new Date()).toISOString();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    Promise.all([
      // Today's sessions
      supabase.from('sessions')
        .select('id, scheduled_at, duration_minutes, status, zoom_join_url, student:students(id, name)')
        .eq('tutor_id', tutor.id)
        .gte('scheduled_at', todayStart)
        .lte('scheduled_at', todayEnd)
        .order('scheduled_at'),

      // Next 10 upcoming scheduled from right now
      supabase.from('sessions')
        .select('id, scheduled_at, duration_minutes, status, zoom_join_url, student_id, student:students(id, name)')
        .eq('tutor_id', tutor.id)
        .eq('status', 'scheduled')
        .gte('scheduled_at', nowIso)
        .order('scheduled_at')
        .limit(10),

      // Students via contracts (non-voided)
      supabase.from('contracts')
        .select('student_id')
        .eq('tutor_id', tutor.id)
        .in('status', ['signed', 'pending']),

      // Month completed sessions
      supabase.from('sessions')
        .select('duration_minutes')
        .eq('tutor_id', tutor.id)
        .eq('status', 'completed')
        .gte('scheduled_at', monthStart),
    ]).then(([today, upcoming, contracts, monthSessions]) => {
      setTodaySessions((today.data as any[]) ?? []);
      const upcomingData = (upcoming.data as any[]) ?? [];
      setUpcomingSessions(upcomingData);

      const hours = (monthSessions.data ?? []).reduce((s: number, x: any) => s + x.duration_minutes / 60, 0);

      // Active students = unique students from non-voided contracts
      const contractStudents = new Set((contracts.data ?? []).map((c: any) => c.student_id));
      // Also add students from upcoming sessions who might not have a contract yet
      for (const s of upcomingData) {
        if (s.student_id) contractStudents.add(s.student_id);
      }

      setStats({
        students:      contractStudents.size,
        sessionsMonth: monthSessions.data?.length ?? 0,
        hoursMonth:    Math.round(hours * 10) / 10,
        earningsMonth: Math.round(hours * tutor.hourly_rate * 100) / 100,
      });

      // Missing reports: fetched via service-role API to bypass RLS on session_reports
      fetch('/api/tutor-portal/missing-reports-count', { cache: 'no-store' })
        .then(r => r.json())
        .then(d => setMissingReports(d.missing ?? 0));

      // Fetch last homework for each unique student in upcoming sessions
      const studentIds = Array.from(new Set(upcomingData.map((s: any) => s.student_id).filter(Boolean))) as string[];
      if (studentIds.length === 0) return;

      supabase.from('sessions')
        .select('student_id, homework_assigned, scheduled_at')
        .in('student_id', studentIds)
        .eq('status', 'completed')
        .not('homework_assigned', 'is', null)
        .order('scheduled_at', { ascending: false })
        .then(({ data }) => {
          const map: Record<string, string> = {};
          for (const row of (data as any[]) ?? []) {
            if (!map[row.student_id] && row.homework_assigned) {
              map[row.student_id] = row.homework_assigned;
            }
          }
          setHomeworkMap(map);
        });
    });
  }, [tutor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch onboarding checklist + availability for the checklist component
  useEffect(() => {
    if (!tutor) return;
    Promise.all([
      supabase.from('tutors').select('onboarding_checklist').eq('id', tutor.id).single(),
      supabase.from('tutor_availability').select('id', { count: 'exact', head: true }).eq('tutor_id', tutor.id).limit(1),
    ]).then(([checklistRes, availRes]) => {
      setOnboardingChecklist((checklistRes.data as any)?.onboarding_checklist ?? {});
      setHasAvailability((availRes.count ?? 0) > 0);
    });
  }, [tutor]); // eslint-disable-line react-hooks/exhaustive-deps

  async function markComplete(item: ChecklistKey) {
    setMarkingItem(item);
    await fetch('/api/tutor-portal/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item }),
    });
    setOnboardingChecklist(prev => ({ ...prev, [item]: new Date().toISOString() }));
    setMarkingItem(null);
  }

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (loading) return null;

  // Onboarding checklist items — auto-detected where possible, manual otherwise
  const checklistItems: {
    key: ChecklistKey;
    label: string;
    done: boolean;
    href?: string;
    videoUrl?: string;
    auto: boolean;
    actionLabel?: string;
    markLabel?: string;
  }[] = [
    {
      key:    'profile_complete',
      label:  'Complete your profile (bio + subjects required)',
      done:   !!(tutor?.bio?.trim() && (tutor?.subjects?.length ?? 0) > 0),
      href:   '/tutor-portal/profile',
      auto:   true,
    },
    {
      key:    'availability_set',
      label:  'Set your availability',
      done:   hasAvailability,
      href:   '/tutor-portal/availability',
      auto:   true,
    },
    {
      key:    'calendar_connected',
      label:  'Connect Google Calendar',
      done:   !!tutor?.google_calendar_connected,
      href:   '/tutor-portal/profile',
      auto:   true,
    },
    {
      key:      'training_video_watched',
      label:    'Watch the training video',
      done:     !!onboardingChecklist.training_video_watched,
      // TODO: Move to Loom or Vimeo for durability (Zoom links may expire)
      videoUrl: 'https://us06web.zoom.us/rec/share/tMrS9Om4lxsfGuUUA-291_XJ-uItJgWWVY2K6QdYBKNDuktRtjQuAZa1JYGgMrxd.Gt7hLUz9nkMuNPfT',
      auto:     false,
      markLabel: "I've watched it",
    },
    {
      key:         'students_reviewed',
      label:       'Review your assigned students',
      done:        !!onboardingChecklist.students_reviewed,
      href:        '/tutor-portal/students',
      auto:        false,
      actionLabel: 'View students',
      markLabel:   'Got it',
    },
  ];

  const completedCount = checklistItems.filter(c => c.done).length;
  const allDone        = completedCount === checklistItems.length;

  return (
    <TutorPortalLayout tutor={tutor}>
      {/* Onboarding checklist */}
      {!allDone && (
        <div className="mb-5 card border-2 border-navy-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900 text-base">Getting Started</h2>
            <div className="flex items-center gap-2.5">
              <div className="h-2 w-32 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-navy-600 rounded-full transition-all duration-300"
                  style={{ width: `${(completedCount / checklistItems.length) * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 font-medium whitespace-nowrap">
                {completedCount} of {checklistItems.length} complete
              </span>
            </div>
          </div>
          <div className="space-y-2">
            {checklistItems.map(item => (
              <div
                key={item.key}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                  item.done ? 'bg-green-50' : 'bg-gray-50'
                }`}
              >
                {item.done
                  ? <CheckSquare className="w-5 h-5 text-green-500 flex-shrink-0" />
                  : <Square className="w-5 h-5 text-gray-300 flex-shrink-0" />
                }
                <span className={`flex-1 text-sm font-medium ${item.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                  {item.label}
                </span>
                {!item.done && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.videoUrl && (
                      <a
                        href={item.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-navy-600 hover:text-navy-800"
                      >
                        <PlayCircle className="w-3.5 h-3.5" /> Watch video
                      </a>
                    )}
                    {item.href && !item.videoUrl && (
                      <a
                        href={item.href}
                        className="text-xs font-medium text-navy-600 hover:text-navy-800"
                      >
                        {item.actionLabel ?? 'Go →'}
                      </a>
                    )}
                    {!item.auto && (
                      <button
                        onClick={() => markComplete(item.key)}
                        disabled={markingItem === item.key}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-navy-700 text-white hover:bg-navy-800 transition-colors disabled:opacity-50"
                      >
                        {markingItem === item.key ? '…' : `✓ ${item.markLabel}`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missing reports banner */}
      {missingReports > 0 && (
        <div className="mb-5 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <span className="text-red-500 text-lg">⚠️</span>
          <p className="text-sm font-medium text-red-800 flex-1">
            You have <strong>{missingReports}</strong> session{missingReports !== 1 ? 's' : ''} with missing reports from the last 7 days.
          </p>
          <a href="/tutor-portal/my-reports" className="text-sm font-semibold text-red-700 hover:text-red-900 underline whitespace-nowrap">
            Submit Now →
          </a>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting}, {tutor?.name?.split(' ')[0]}!</h1>
          <p className="text-gray-500 text-sm mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <button
          onClick={() => setRequestStudentOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-navy-700 text-white hover:bg-navy-800 transition-colors"
        >
          <UserPlus className="w-4 h-4" /> Request New Student
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Active Students',     value: stats.students },
          { label: 'Sessions This Month', value: stats.sessionsMonth },
          { label: 'Hours This Month',    value: `${stats.hoursMonth}h` },
          { label: 'Earnings This Month', value: `$${stats.earningsMonth.toFixed(2)}` },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <p className="text-xs text-gray-500 font-medium">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Today's sessions */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Today&apos;s Sessions</h2>
          </div>
          {todaySessions.length === 0 ? (
            <p className="px-5 py-6 text-gray-400 text-sm">No sessions today.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {todaySessions.map((s: any) => (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={(s.student as any)?.name ?? '?'} id={(s.student as any)?.id ?? s.id} size={30} />
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-gray-900 truncate">{(s.student as any)?.name ?? '—'}</p>
                      <p className="text-xs text-gray-500">{format(new Date(s.scheduled_at), 'h:mm a')} · {s.duration_minutes}min</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={s.status} />
                    {s.zoom_join_url && (
                      <a href={s.zoom_join_url} target="_blank" rel="noopener"
                        className="inline-flex items-center gap-1 text-xs text-navy-600 hover:text-navy-800 font-medium">
                        <ExternalLink className="w-3 h-3" /> Join
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Sessions */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Upcoming Sessions</h2>
            <span className="text-xs text-gray-400 font-medium">Next {upcomingSessions.length || '—'}</span>
          </div>
          {upcomingSessions.length === 0 ? (
            <p className="px-5 py-6 text-gray-400 text-sm">No upcoming sessions scheduled.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {upcomingSessions.map((s: any) => (
                <UpcomingCard
                  key={s.id}
                  s={s}
                  lastHomework={homeworkMap[(s.student as any)?.id ?? s.student_id] ?? null}
                  now={now}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Group Sessions card — only shown for David Zhu */}
      {tutor?.id === '3f2ab4fe-74a9-453a-9037-4739889547a9' && (() => {
        const monJoin = 'https://us06web.zoom.us/j/88498800127?pwd=TvUwlKqQBzKZJavDDEEPqJSiFEZb80.1';
        const satJoin = 'https://us06web.zoom.us/j/81335609717?pwd=aApUwMaEkLZSEmbquA6vDt2uvTWabM.1';

        const nextMonday = (() => {
          const d = new Date();
          const daysUntil = (1 - d.getDay() + 7) % 7 || 7;
          const next = new Date(d.getTime() + daysUntil * 24 * 60 * 60 * 1000);
          next.setUTCHours(23, 0, 0, 0);
          return next;
        })();

        const nextSaturday = (() => {
          const d = new Date();
          const daysUntil = (6 - d.getDay() + 7) % 7 || 7;
          const next = new Date(d.getTime() + daysUntil * 24 * 60 * 60 * 1000);
          next.setUTCHours(21, 30, 0, 0);
          return next;
        })();

        return (
          <div className="mt-6 card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-navy-500" />
              <h2 className="font-semibold text-gray-900">My Group Sessions</h2>
            </div>
            <p className="text-xs text-gray-500 mb-4">Permanent Zoom links — same every week, forever.</p>
            <div className="space-y-3">
              {[
                { label: 'Monday Group Session', time: '7:00–8:00 PM ET', url: monJoin, next: nextMonday },
                { label: 'Saturday Group Session', time: '4:30–5:30 PM ET', url: satJoin, next: nextSaturday },
              ].map(({ label, time, url, next: nextDate }) => (
                <div key={label} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{label}</p>
                      <p className="text-xs text-gray-500">{time}</p>
                      <p className="text-xs text-navy-600 mt-0.5 font-medium">
                        Next: {format(nextDate, "EEEE, MMM d 'at' h:mm a")}
                      </p>
                    </div>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-white bg-green-600 hover:bg-green-700 transition-colors whitespace-nowrap flex-shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Join
                    </a>
                  </div>
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-500 font-mono truncate flex-1">{url}</span>
                    <CopyBtn url={url} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <RequestStudentModal open={requestStudentOpen} onClose={() => setRequestStudentOpen(false)} />
    </TutorPortalLayout>
  );
}
