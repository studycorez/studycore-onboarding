'use client';

import { useEffect, useState } from 'react';
import { useStudentAuth } from '@/hooks/useStudentAuth';
import StudentPortalLayout from '@/components/student-portal/StudentPortalLayout';
import { createClient } from '@/lib/supabase/client';
import { getLevelInfo, getAnimalEmoji, getColorHex, BADGE_DEFS } from '@/lib/xp';
import { ExternalLink, Check, Calendar, Zap, FileText, Clock, Target, Copy, Video, CalendarClock, Users, Link2 } from 'lucide-react';
import RescheduleModal from '@/components/portal/RescheduleModal';
import Link from 'next/link';
import { format, differenceInCalendarDays, startOfWeek, endOfWeek } from 'date-fns';

// ── Avatar for tutor ───────────────────────────────────────────────────────
const PALETTE = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1'];
function hashColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function TutorAvatar({ name, id, size = 36 }: { name: string; id: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: hashColor(id),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.4, flexShrink: 0,
    }}>
      {name.trim()[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

// ── Copy button ────────────────────────────────────────────────────────────
function CopyBtn({ url, small }: { url: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={e => { e.preventDefault(); navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
      title="Copy Zoom link"
      className={`${small ? 'p-1' : 'p-1.5'} rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0`}
    >
      {copied ? <Check className={`${small ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-green-500`} /> : <Copy className={small ? 'w-3 h-3' : 'w-3.5 h-3.5'} />}
    </button>
  );
}

// ── Timezone-aware session time formatter ─────────────────────────────────
function fmtSessionTime(iso: string, tz: string | null | undefined): string {
  const t = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const d = new Date(iso);
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: t, weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d);
  const tzAbbr = new Intl.DateTimeFormat('en-US', { timeZone: t, timeZoneName: 'short' })
    .formatToParts(d).find(p => p.type === 'timeZoneName')?.value ?? '';
  return `${label}${tzAbbr ? ` ${tzAbbr}` : ''}`;
}

// ── Upcoming session card for student portal ──────────────────────────────
function UpcomingSessionCard({ s, now, tz, onReschedule }: { s: Session; now: Date; tz?: string | null; onReschedule?: (s: Session) => void }) {
  const startMs   = new Date(s.scheduled_at).getTime();
  const endMs     = startMs + s.duration_minutes * 60 * 1000;
  const msToStart = startMs - now.getTime();
  const ongoing   = now.getTime() >= startMs && now.getTime() < endMs;
  const canJoin   = msToStart <= 30 * 60 * 1000 || ongoing;

  const tutorName = (s.tutor as any)?.name ?? '—';
  const tutorId   = (s.tutor as any)?.id ?? s.id;
  const dateStr   = fmtSessionTime(s.scheduled_at, tz);

  function countdownLabel(): string {
    if (ongoing) return 'In Progress';
    const totalMin = Math.ceil(msToStart / 60000);
    if (totalMin >= 60) {
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      return `Joins in ${h}h${m > 0 ? ` ${m}m` : ''}`;
    }
    return `Joins in ${totalMin}m`;
  }

  return (
    <div className={`flex items-center gap-3 px-5 py-4 transition-colors ${canJoin ? 'bg-green-50' : ''}`}>
      <TutorAvatar name={tutorName} id={tutorId} size={40} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-900 truncate">with {tutorName}</p>
        <p className="text-xs text-gray-500">{dateStr} · {s.duration_minutes} min</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Reschedule — only if >24h away */}
        {onReschedule && (startMs - now.getTime()) > 24 * 60 * 60 * 1000 && (
          <button
            onClick={() => onReschedule(s)}
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-300 rounded-lg px-2 py-1.5 transition-colors"
          >
            <CalendarClock className="w-3 h-3" />
          </button>
        )}
        {s.zoom_join_url && <CopyBtn url={s.zoom_join_url} />}
        {s.zoom_join_url ? (
          canJoin ? (
            <a
              href={s.zoom_join_url}
              target="_blank"
              rel="noopener"
              className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-white transition-all ${
                ongoing ? 'bg-green-600 animate-pulse' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              {ongoing ? 'Join Now' : 'Join Session'}
            </a>
          ) : (
            <span className="inline-flex items-center text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-100 text-gray-400 whitespace-nowrap">
              {countdownLabel()}
            </span>
          )
        ) : (
          <span className="text-xs text-gray-300">No link yet</span>
        )}
      </div>
    </div>
  );
}

interface Session {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  zoom_join_url: string | null;
  tutor_notes: string | null;
  homework_assigned: string | null;
  tutor: { id: string; name: string } | null;
}

export default function StudentDashboardPage() {
  const { student, loading } = useStudentAuth();
  const supabase = createClient();
  const [sessions,          setSessions]          = useState<Session[]>([]);
  const [upcoming5,         setUpcoming5]         = useState<Session[]>([]);
  const [permanentZoomLink, setPermanentZoomLink] = useState<string | null>(null);
  const [dataLoading,       setDataLoading]       = useState(true);
  const [rescheduleSession, setRescheduleSession] = useState<Session | null>(null);
  const [linkCopied,        setLinkCopied]        = useState(false);

  // Live clock — tick every 30 s so countdowns stay accurate
  const [tick, setTick] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!student) return;
    const nowIso = new Date().toISOString();
    Promise.all([
      // Past + this week sessions for prep card and "This Week"
      supabase
        .from('sessions')
        .select('id, scheduled_at, duration_minutes, status, zoom_join_url, tutor_notes, homework_assigned, tutor:tutors(id, name)')
        .eq('student_id', student.id)
        .gte('scheduled_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .lte('scheduled_at', new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString())
        .order('scheduled_at')
        .limit(50),
      // Next 5 upcoming scheduled sessions (any date)
      supabase
        .from('sessions')
        .select('id, scheduled_at, duration_minutes, status, zoom_join_url, tutor_notes, homework_assigned, tutor:tutors(id, name)')
        .eq('student_id', student.id)
        .eq('status', 'scheduled')
        .gte('scheduled_at', nowIso)
        .order('scheduled_at')
        .limit(5),
      // Permanent Zoom link from signed contract
      supabase
        .from('contracts')
        .select('permanent_zoom_link')
        .eq('student_id', student.id)
        .eq('status', 'signed')
        .not('permanent_zoom_link', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(([main, up5, contractRes]) => {
      setSessions(((main.data ?? []) as any[]).map((s: any) => ({
        ...s,
        tutor: Array.isArray(s.tutor) ? (s.tutor[0] ?? null) : s.tutor,
      })) as Session[]);
      setUpcoming5(((up5.data ?? []) as any[]).map((s: any) => ({
        ...s,
        tutor: Array.isArray(s.tutor) ? (s.tutor[0] ?? null) : s.tutor,
      })) as Session[]);
      setPermanentZoomLink((contractRes.data as any)?.permanent_zoom_link ?? null);
      setDataLoading(false);
    });
  }, [student]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || dataLoading) {
    return (
      <StudentPortalLayout student={null}>
        <div className="animate-pulse space-y-4 max-w-2xl">
          {[1, 2, 3].map(i => <div key={i} className="h-24 card rounded-xl" />)}
        </div>
      </StudentPortalLayout>
    );
  }

  if (!student) return null;

  const levelInfo = getLevelInfo(student.xp_points);
  const emoji     = getAnimalEmoji(student.avatar_animal);
  const colorHex  = getColorHex(student.avatar_color);
  const firstName = student.name.split(' ')[0];

  // ── Feature 1: Session prep card ────────────────────────────────────────
  const now   = new Date();
  const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const in1h  = new Date(Date.now() + 60 * 60 * 1000);

  const prepSession = sessions.find(s =>
    s.status === 'scheduled' &&
    new Date(s.scheduled_at) > now &&
    new Date(s.scheduled_at) <= in24h,
  ) ?? null;

  const sessionStartsSoon = prepSession != null && new Date(prepSession.scheduled_at) <= in1h;

  const completedSessions = sessions.filter(s => s.status === 'completed');
  const lastCompleted     = completedSessions.length > 0
    ? completedSessions[completedSessions.length - 1]
    : null;

  // ── Feature 2: Goal countdown ────────────────────────────────────────────
  const daysToTest  = student.test_date
    ? differenceInCalendarDays(new Date(student.test_date), now)
    : null;
  const programStart = new Date(student.created_at);
  const testDate     = student.test_date ? new Date(student.test_date) : null;
  const totalDays    = testDate ? differenceInCalendarDays(testDate, programStart) : null;
  const daysPassed   = testDate ? differenceInCalendarDays(now, programStart) : null;
  const pctThrough   = totalDays != null && totalDays > 0 && daysPassed != null
    ? Math.min(100, Math.max(0, Math.round((daysPassed / totalDays) * 100)))
    : null;

  const countdownColor = daysToTest == null ? 'gray'
    : daysToTest > 60 ? 'green'
    : daysToTest > 30 ? 'amber'
    : 'red';

  const countdownMsg = daysToTest == null ? 'Ask your tutor to set your test date.'
    : daysToTest > 60 ? 'You have plenty of time — stay consistent.'
    : daysToTest > 30 ? "The test is coming up — let's pick up the pace."
    : daysToTest >= 0 ? "Final stretch — give it everything you've got!"
    : 'Test day has passed. Great work!';

  const cStyles = {
    green: { bar: 'bg-green-500', badge: 'bg-green-100 text-green-800 border-green-200', num: 'text-green-700' },
    amber: { bar: 'bg-amber-400', badge: 'bg-amber-100 text-amber-800 border-amber-200', num: 'text-amber-700' },
    red:   { bar: 'bg-red-500',   badge: 'bg-red-100 text-red-800 border-red-200',       num: 'text-red-700'   },
    gray:  { bar: 'bg-gray-300',  badge: 'bg-gray-100 text-gray-600 border-gray-200',    num: 'text-gray-500'  },
  }[countdownColor];

  // ── Existing derived values ──────────────────────────────────────────────
  const scoreProgress = student.current_score != null && student.target_score != null
    ? Math.min(100, Math.max(0, Math.round((student.current_score / student.target_score) * 100)))
    : null;

  const weekStart   = startOfWeek(now);
  const weekEnd     = endOfWeek(now);
  const thisWeek    = sessions.filter(s => { const d = new Date(s.scheduled_at); return d >= weekStart && d <= weekEnd; });
  const upcoming    = sessions.filter(s => s.status === 'scheduled' && new Date(s.scheduled_at) > now);
  const nextSession = upcoming[0] ?? null;
  const recentBadges = (student.badges ?? []).slice(-3).reverse();

  return (
    <StudentPortalLayout student={student}>
      <div className="max-w-2xl space-y-6">

        {/* ── Feature 1: Session Prep Card ─────────────────────────────── */}
        {prepSession && (
          <div className={`card p-5 border-2 ${sessionStartsSoon ? 'border-green-400 bg-green-50' : 'border-[#1e2090] bg-blue-50'}`}>
            <div className="flex items-center gap-2 mb-3">
              <Clock className={`w-4 h-4 ${sessionStartsSoon ? 'text-green-600' : 'text-[#1e2090]'}`} />
              <span className={`text-xs font-bold uppercase tracking-wide ${sessionStartsSoon ? 'text-green-700' : 'text-[#1e2090]'}`}>
                {sessionStartsSoon ? '🟢 Session Starting Soon!' : '📅 Session Today'}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-bold text-gray-900">
                  {fmtSessionTime(prepSession.scheduled_at, student.timezone)}
                </p>
                <p className="text-sm text-gray-600 mt-0.5">
                  with {(prepSession.tutor as any)?.name ?? '—'} · {prepSession.duration_minutes} min
                </p>
              </div>
              {prepSession.zoom_join_url && (
                <a
                  href={prepSession.zoom_join_url}
                  target="_blank"
                  rel="noopener"
                  className={`flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-lg flex-shrink-0 ${
                    sessionStartsSoon
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-[#1e2090] text-white hover:bg-[#161870]'
                  }`}
                >
                  <ExternalLink className="w-4 h-4" /> Join Session
                </a>
              )}
            </div>
            {lastCompleted && (lastCompleted.tutor_notes || lastCompleted.homework_assigned) && (
              <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
                {lastCompleted.tutor_notes && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Session Recap</p>
                    <p className="text-sm text-gray-700 mt-1">{lastCompleted.tutor_notes}</p>
                  </div>
                )}
                {lastCompleted.homework_assigned && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your Homework</p>
                    <p className="text-sm text-gray-700 mt-1">{lastCompleted.homework_assigned}</p>
                  </div>
                )}
              </div>
            )}
            <p className={`text-xs mt-3 font-medium italic ${sessionStartsSoon ? 'text-green-700' : 'text-[#1e2090]'}`}>
              You&apos;ve got this — see you at {new Intl.DateTimeFormat('en-US', { timeZone: student.timezone ?? undefined, hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' }).format(new Date(prepSession.scheduled_at))}! 🚀
            </p>
          </div>
        )}

        {/* Greeting + Avatar */}
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
            style={{ backgroundColor: colorHex + '22', border: `2px solid ${colorHex}` }}
          >
            {emoji}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome back, {firstName}! 👋</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {student.avatar_color && student.avatar_animal
                ? `${student.avatar_color} ${student.avatar_animal} · `
                : ''}{levelInfo.name}
            </p>
          </div>
        </div>

        {/* XP Bar */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold text-gray-900">Level {levelInfo.level} — {levelInfo.name}</span>
            </div>
            <span className="text-sm text-gray-500">{student.xp_points} XP</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div className="h-3 rounded-full transition-all" style={{ width: `${levelInfo.pct}%`, backgroundColor: colorHex }} />
          </div>
          {levelInfo.nextName
            ? <p className="text-xs text-gray-500 mt-1.5">{levelInfo.xpToNext} XP to {levelInfo.nextName}</p>
            : <p className="text-xs text-amber-600 font-medium mt-1.5">👑 Max Level — Legend!</p>}
        </div>

        {/* ── Feature 2: Goal Countdown ─────────────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-900">Test Countdown</span>
            {student.test_date && (
              <span className={`ml-auto text-xs font-semibold border rounded-full px-2 py-0.5 ${cStyles.badge}`}>
                {format(new Date(student.test_date), 'MMM d, yyyy')}
              </span>
            )}
          </div>
          {student.test_date ? (
            <>
              <div className="flex items-baseline gap-2 mb-3">
                <span className={`text-5xl font-black ${cStyles.num}`}>{Math.max(0, daysToTest ?? 0)}</span>
                <span className="text-gray-500 text-sm">days remaining</span>
              </div>
              {pctThrough != null && (
                <>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 mb-1.5">
                    <div className={`h-2.5 rounded-full transition-all ${cStyles.bar}`} style={{ width: `${pctThrough}%` }} />
                  </div>
                  <p className="text-xs text-gray-400">{pctThrough}% through your program</p>
                </>
              )}
              <p className="text-sm text-gray-600 mt-3 italic">{countdownMsg}</p>
            </>
          ) : (
            <p className="text-sm text-gray-400">{countdownMsg}</p>
          )}
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-4 gap-3">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{student.xp_points}</p>
            <p className="text-xs text-gray-500 mt-1">XP Points</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{student.streak_weeks}</p>
            <p className="text-xs text-gray-500 mt-1">Week Streak 🔥</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{student.current_score ?? '—'}</p>
            <p className="text-xs text-gray-500 mt-1">
              {student.target_score ? `→ ${student.target_score} goal` : 'Current Score'}
            </p>
            {scoreProgress != null && (
              <div className="w-full bg-gray-100 rounded-full h-1 mt-2">
                <div className="h-1 rounded-full bg-navy-600" style={{ width: `${scoreProgress}%` }} />
              </div>
            )}
          </div>
          <div className={`card p-4 text-center ${daysToTest != null && daysToTest <= 14 ? 'bg-red-50 border-red-200' : ''}`}>
            <p className={`text-2xl font-bold ${daysToTest != null && daysToTest <= 14 ? 'text-red-600' : 'text-gray-900'}`}>
              {daysToTest != null ? (daysToTest >= 0 ? daysToTest : 0) : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-1">Days to Test</p>
            {student.test_date && (
              <p className="text-xs text-gray-400 mt-0.5">{format(new Date(student.test_date), 'MMM d')}</p>
            )}
          </div>
        </div>

        {/* Your Session Link */}
        {permanentZoomLink && (
          <div className="card p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
              <Link2 className="w-4.5 h-4.5 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-700 mb-0.5">Your Session Link</p>
              <p className="text-xs text-gray-400 truncate">{permanentZoomLink}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(permanentZoomLink);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="Copy link"
              >
                {linkCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <a
                href={permanentZoomLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg text-white bg-green-600 hover:bg-green-700 transition-colors"
              >
                <Video className="w-3 h-3" /> Join
              </a>
            </div>
          </div>
        )}

        {/* This Week */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">This Week</h2>
          </div>
          {thisWeek.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400">No sessions this week.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {thisWeek.map(s => {
                const past = new Date(s.scheduled_at) < now;
                const done = s.status === 'completed';
                return (
                  <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-green-500' : past ? 'bg-gray-200' : 'bg-navy-100 border-2 border-navy-300'}`}>
                      {done && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {fmtSessionTime(s.scheduled_at, student.timezone)}
                      </p>
                      <p className="text-xs text-gray-500">with {(s.tutor as any)?.name ?? '—'} · {s.duration_minutes} min</p>
                    </div>
                    {!done && s.zoom_join_url && !past && (
                      <a href={s.zoom_join_url} target="_blank" rel="noopener"
                        className="text-xs text-navy-600 font-medium hover:text-navy-800 flex-shrink-0">
                        Join
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Upcoming Sessions (next 5) ───────────────────────────────── */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Upcoming Sessions</h2>
            {upcoming5.length > 0 && (
              <span className="ml-auto text-xs font-medium text-gray-400">{upcoming5.length} scheduled</span>
            )}
          </div>
          {upcoming5.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400">No upcoming sessions scheduled.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {upcoming5.map(s => (
                <UpcomingSessionCard key={s.id} s={s} now={tick} tz={student.timezone} onReschedule={setRescheduleSession} />
              ))}
            </div>
          )}
        </div>

        {/* Next Session (only show when no prep card) */}
        {nextSession && !prepSession && (
          <div className="card p-5 bg-navy-950 text-white">
            <p className="text-xs font-medium text-navy-400 mb-2 uppercase tracking-wide">Next Session</p>
            <p className="text-lg font-bold mb-0.5">
              {format(new Date(nextSession.scheduled_at), "EEEE, MMMM d 'at' h:mm a")}
            </p>
            <p className="text-navy-300 text-sm mb-4">
              with {(nextSession.tutor as any)?.name ?? '—'} · {nextSession.duration_minutes} min
            </p>
            {nextSession.zoom_join_url ? (
              <a href={nextSession.zoom_join_url} target="_blank" rel="noopener"
                className="inline-flex items-center gap-2 bg-white text-navy-900 text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-gray-100 transition-colors">
                <ExternalLink className="w-4 h-4" /> Join Session
              </a>
            ) : (
              <p className="text-navy-400 text-sm">Zoom link coming soon</p>
            )}
          </div>
        )}

        {/* Recent Badges */}
        {recentBadges.length > 0 && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Recent Badges</h2>
              <Link href="/student-portal/badges" className="text-xs text-navy-600 hover:text-navy-800">View all →</Link>
            </div>
            <div className="flex gap-3">
              {recentBadges.map(key => {
                const badge = BADGE_DEFS[key as keyof typeof BADGE_DEFS];
                if (!badge) return null;
                return (
                  <div key={key} className="flex flex-col items-center gap-1.5 flex-1 bg-amber-50 border border-amber-200 rounded-xl py-3 px-2">
                    <span className="text-2xl">{badge.icon}</span>
                    <p className="text-xs font-semibold text-amber-800 text-center leading-tight">{badge.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Game Plan */}
        {student.game_plan_url && (
          <a href={student.game_plan_url} target="_blank" rel="noopener noreferrer"
            className="card p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors">
            <FileText className="w-8 h-8 text-navy-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">My Game Plan</p>
              <p className="text-xs text-gray-500">View your personalized study plan</p>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </a>
        )}

        {/* Group Sessions Card */}
        {(student as any).group_sessions_enabled && (() => {
          const allocated  = (student as any).group_session_hours_allocated ?? 0;
          const used       = (student as any).group_session_hours_used ?? 0;
          const remaining  = Math.max(0, allocated - used);
          const monJoin    = 'https://us06web.zoom.us/j/88498800127?pwd=TvUwlKqQBzKZJavDDEEPqJSiFEZb80.1';
          const satJoin    = 'https://us06web.zoom.us/j/81335609717?pwd=aApUwMaEkLZSEmbquA6vDt2uvTWabM.1';
          return (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-navy-500" />
                <h2 className="text-sm font-semibold text-gray-900">Group Sessions</h2>
                <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${remaining > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  {remaining} hr{remaining !== 1 ? 's' : ''} remaining
                </span>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Monday Group Session', time: '7:00–8:00 PM ET', url: monJoin },
                  { label: 'Saturday Group Session', time: '4:30–5:30 PM ET', url: satJoin },
                ].map(({ label, time, url }) => (
                  <div key={label} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{label}</p>
                      <p className="text-xs text-gray-500">{time} · Every week</p>
                    </div>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-white bg-green-600 hover:bg-green-700 transition-colors whitespace-nowrap"
                    >
                      <Video className="w-3.5 h-3.5" /> Join Zoom
                    </a>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}


      </div>

      {rescheduleSession && (
        <RescheduleModal
          open={!!rescheduleSession}
          onClose={() => setRescheduleSession(null)}
          sessionId={rescheduleSession.id}
          sessionTime={rescheduleSession.scheduled_at}
          tutorName={(rescheduleSession.tutor as any)?.name ?? '—'}
          studentName={student.name}
          durationMinutes={rescheduleSession.duration_minutes}
          apiBase="student-portal"
        />
      )}
    </StudentPortalLayout>
  );
}
