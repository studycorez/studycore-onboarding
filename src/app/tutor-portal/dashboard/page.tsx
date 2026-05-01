'use client';

import { useEffect, useRef, useState } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/ui/Badge';
import { ExternalLink, Copy, Check, Video, BookOpen } from 'lucide-react';
import { format, startOfDay, endOfDay, addDays } from 'date-fns';

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

  // Format using browser local timezone
  const dateLabel = format(new Date(s.scheduled_at), "EEE, MMM d 'at' h:mm a");
  const studentName: string = (s.student as any)?.name ?? '—';
  const studentId: string   = (s.student as any)?.id ?? s.student_id ?? '';

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
          {!canJoin && s.zoom_join_url && (
            <span className="text-xs text-gray-400 font-medium px-2">
              {msToStart > 60 * 60 * 1000
                ? `in ${Math.floor(msToStart / (60 * 60 * 1000))}h ${Math.floor((msToStart % (60 * 60 * 1000)) / 60000)}m`
                : `in ${Math.floor(msToStart / 60000)}m`}
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

// ── Page ───────────────────────────────────────────────────────────────────
export default function TutorDashboardPage() {
  const { tutor, loading } = useTutorAuth();
  const supabase = createClient();

  const [todaySessions,    setTodaySessions]    = useState<any[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([]);
  const [homeworkMap,      setHomeworkMap]      = useState<Record<string, string>>({});
  const [stats, setStats] = useState({ students: 0, sessionsMonth: 0, hoursMonth: 0, earningsMonth: 0 });

  // Tick every 30 s to keep "Join" window accurate
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!tutor) return;
    const nowIso      = new Date().toISOString();
    const todayStart  = startOfDay(new Date()).toISOString();
    const todayEnd    = endOfDay(new Date()).toISOString();
    const monthStart  = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const thirtyAgo   = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    Promise.all([
      // Today's sessions
      supabase.from('sessions')
        .select('id, scheduled_at, duration_minutes, status, zoom_join_url, student:students(id, name)')
        .eq('tutor_id', tutor.id)
        .gte('scheduled_at', todayStart)
        .lte('scheduled_at', todayEnd)
        .order('scheduled_at'),

      // Next 5 upcoming scheduled from right now
      supabase.from('sessions')
        .select('id, scheduled_at, duration_minutes, status, zoom_join_url, student_id, student:students(id, name)')
        .eq('tutor_id', tutor.id)
        .eq('status', 'scheduled')
        .gte('scheduled_at', nowIso)
        .order('scheduled_at')
        .limit(5),

      // Active students count
      supabase.from('sessions')
        .select('student_id')
        .eq('tutor_id', tutor.id)
        .or(`status.eq.scheduled,and(status.eq.completed,scheduled_at.gte.${thirtyAgo})`),

      // Month sessions
      supabase.from('sessions')
        .select('duration_minutes')
        .eq('tutor_id', tutor.id)
        .eq('status', 'completed')
        .gte('scheduled_at', monthStart),
    ]).then(([today, upcoming, activeSessions, monthSessions]) => {
      setTodaySessions((today.data as any[]) ?? []);
      const upcomingData = (upcoming.data as any[]) ?? [];
      setUpcomingSessions(upcomingData);

      const hours = (monthSessions.data ?? []).reduce((s: number, x: any) => s + x.duration_minutes / 60, 0);
      setStats({
        students:      new Set((activeSessions.data ?? []).map((s: any) => s.student_id)).size,
        sessionsMonth: monthSessions.data?.length ?? 0,
        hoursMonth:    Math.round(hours * 10) / 10,
        earningsMonth: Math.round(hours * tutor.hourly_rate * 100) / 100,
      });

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

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (loading) return null;

  return (
    <TutorPortalLayout tutor={tutor}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{greeting}, {tutor?.name?.split(' ')[0]}!</h1>
        <p className="text-gray-500 text-sm mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
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
    </TutorPortalLayout>
  );
}
