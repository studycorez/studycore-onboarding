'use client';

import { useEffect, useState, useCallback } from 'react';
import { useStudentAuth } from '@/hooks/useStudentAuth';
import StudentPortalLayout from '@/components/student-portal/StudentPortalLayout';
import { format, startOfWeek, subWeeks } from 'date-fns';
import { CheckCircle, Circle, BookOpen, Zap, ChevronDown, ChevronRight } from 'lucide-react';

interface HWItem {
  id: string;
  description: string;
  estimated_minutes: number | null;
  completed: boolean;
  completed_at: string | null;
  session_report_id: string;
  session_id: string | null;
  session_scheduled_at: string | null;
  session_duration_minutes: number | null;
  tutor_name: string;
}

interface SessionGroup {
  session_report_id: string;
  session_scheduled_at: string;
  session_duration_minutes: number | null;
  tutor_name: string;
  items: HWItem[];
}

function xpForItem(item: HWItem): number {
  return item.estimated_minutes != null ? Math.ceil(item.estimated_minutes * 1.5) : 25;
}

function groupBySession(items: HWItem[]): SessionGroup[] {
  const map = new Map<string, SessionGroup>();
  for (const item of items) {
    if (!map.has(item.session_report_id)) {
      map.set(item.session_report_id, {
        session_report_id:       item.session_report_id,
        session_scheduled_at:    item.session_scheduled_at ?? '',
        session_duration_minutes: item.session_duration_minutes,
        tutor_name:              item.tutor_name,
        items:                   [],
      });
    }
    map.get(item.session_report_id)!.items.push(item);
  }
  return Array.from(map.values()).sort((a, b) =>
    b.session_scheduled_at.localeCompare(a.session_scheduled_at)
  );
}

interface BucketSectionProps {
  title: string;
  groups: SessionGroup[];
  defaultOpen: boolean;
  toggling: string | null;
  onToggle: (item: HWItem) => void;
  xpToastItemId: string | null;
}

function BucketSection({ title, groups, defaultOpen, toggling, onToggle, xpToastItemId }: BucketSectionProps) {
  const [sectionOpen, setSectionOpen] = useState(defaultOpen);
  if (groups.length === 0) return null;
  return (
    <div>
      <button
        onClick={() => setSectionOpen(o => !o)}
        className="flex items-center gap-2 mb-3 text-xs font-bold text-gray-500 uppercase tracking-wider hover:text-gray-700 transition-colors"
      >
        {sectionOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {title}
      </button>
      {sectionOpen && (
        <div className="space-y-3">
          {groups.map(g => (
            <SessionCard
              key={g.session_report_id}
              group={g}
              defaultOpen={defaultOpen}
              toggling={toggling}
              onToggle={onToggle}
              xpToastItemId={xpToastItemId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionCard({
  group,
  defaultOpen,
  toggling,
  onToggle,
  xpToastItemId,
}: {
  group: SessionGroup;
  defaultOpen: boolean;
  toggling: string | null;
  onToggle: (item: HWItem) => void;
  xpToastItemId: string | null;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const completedCount = group.items.filter(i => i.completed).length;
  const totalCount     = group.items.length;
  const xpEarned       = group.items.filter(i => i.completed).reduce((s, i) => s + xpForItem(i), 0);
  const dateStr        = group.session_scheduled_at
    ? format(new Date(group.session_scheduled_at), 'EEE, MMM d')
    : '—';

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-gray-900">{dateStr} · with {group.tutor_name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {completedCount}/{totalCount} complete
              {xpEarned > 0 && <span className="ml-2 text-amber-600 font-medium">+{xpEarned} XP earned</span>}
            </p>
          </div>
        </div>
        <div className="flex-shrink-0 ml-3">
          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : '0%' }}
            />
          </div>
        </div>
      </button>

      {open && (
        <div className="divide-y divide-gray-50 border-t border-gray-100">
          {group.items.map(item => {
            const xp = xpForItem(item);
            const isToggling = toggling === item.id;
            const justAwarded = xpToastItemId === item.id;
            return (
              <div key={item.id} className={`flex items-start gap-3 px-5 py-3.5 transition-colors ${item.completed ? 'bg-gray-50' : ''}`}>
                <button
                  onClick={() => onToggle(item)}
                  disabled={isToggling}
                  className={`mt-0.5 flex-shrink-0 transition-colors ${item.completed ? 'text-green-500 hover:text-gray-300' : 'text-gray-300 hover:text-green-500'} ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {item.completed
                    ? <CheckCircle className="w-5 h-5" />
                    : <Circle className="w-5 h-5" />
                  }
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${item.completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {item.description}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {item.estimated_minutes != null ? `~${item.estimated_minutes} min` : null}
                    {item.completed && item.completed_at && (
                      <span className="ml-2">done {format(new Date(item.completed_at), 'MMM d')}</span>
                    )}
                  </p>
                </div>
                <span className={`text-xs font-semibold flex-shrink-0 flex items-center gap-1 ${item.completed ? 'text-green-600' : 'text-amber-500'} ${justAwarded ? 'animate-bounce' : ''}`}>
                  {item.completed ? <CheckCircle className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                  {item.completed ? `+${xp} XP` : `+${xp} XP`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function HomeworkPage() {
  const { student, loading } = useStudentAuth();
  const [items,    setItems]    = useState<HWItem[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [xpToastItemId, setXpToastItemId] = useState<string | null>(null);
  const [xpToastAmount, setXpToastAmount] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch('/api/student-portal/homework/items');
    if (res.ok) {
      const d = await res.json();
      setItems(d.items ?? []);
    }
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (student) load();
  }, [student, load]);

  async function handleToggle(item: HWItem) {
    setToggling(item.id);
    const next = !item.completed;
    const res = await fetch(`/api/student-portal/homework/${item.id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: next }),
    });
    if (res.ok) {
      const d = await res.json();
      setItems(prev => prev.map(i =>
        i.id === item.id
          ? { ...i, completed: next, completed_at: next ? new Date().toISOString() : null }
          : i,
      ));
      if (next && d.xp_awarded > 0) {
        setXpToastItemId(item.id);
        setXpToastAmount(d.xp_awarded);
        setTimeout(() => setXpToastItemId(null), 2500);
      }
    }
    setToggling(null);
  }

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

  // ── Week buckets ──────────────────────────────────────────────────────────
  const now         = new Date();
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const lastWeekStart = subWeeks(thisWeekStart, 1);

  function getBucket(iso: string | null): 'this_week' | 'last_week' | 'older' {
    if (!iso) return 'older';
    const d = new Date(iso);
    if (d >= thisWeekStart) return 'this_week';
    if (d >= lastWeekStart) return 'last_week';
    return 'older';
  }

  const thisWeekItems = items.filter(i => getBucket(i.session_scheduled_at) === 'this_week');
  const lastWeekItems = items.filter(i => getBucket(i.session_scheduled_at) === 'last_week');
  const olderItems    = items.filter(i => getBucket(i.session_scheduled_at) === 'older');

  const thisWeekGroups = groupBySession(thisWeekItems);
  const lastWeekGroups = groupBySession(lastWeekItems);
  const olderGroups    = groupBySession(olderItems);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const thisWeekTotal     = thisWeekItems.length;
  const thisWeekCompleted = thisWeekItems.filter(i => i.completed).length;
  const thisWeekPct       = thisWeekTotal > 0 ? Math.round((thisWeekCompleted / thisWeekTotal) * 100) : 0;
  const totalXPEarned     = items.filter(i => i.completed).reduce((s, i) => s + xpForItem(i), 0);

  return (
    <StudentPortalLayout student={student}>
      {/* XP toast */}
      {xpToastItemId && (
        <div className="fixed top-6 right-6 z-50 bg-amber-500 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-bold animate-bounce">
          <Zap className="w-4 h-4" /> +{xpToastAmount} XP — Task done!
        </div>
      )}

      <div className="max-w-2xl space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Homework</h1>
          <p className="text-gray-500 text-sm mt-1">Check off tasks to earn XP — more time = more XP</p>
        </div>

        {/* Stats card */}
        <div className="card px-5 py-4 flex items-center gap-6">
          <div>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">This week</p>
            <p className="text-2xl font-black text-gray-900 mt-0.5">
              {thisWeekCompleted}<span className="text-gray-400 font-medium text-lg">/{thisWeekTotal}</span>
            </p>
            <p className="text-xs text-gray-500">{thisWeekTotal > 0 ? `${thisWeekPct}% complete` : 'No tasks yet'}</p>
          </div>
          <div className="w-px h-12 bg-gray-100" />
          <div>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">XP from homework</p>
            <p className="text-2xl font-black text-amber-600 mt-0.5">{totalXPEarned}</p>
            <p className="text-xs text-gray-500">total earned</p>
          </div>
          {thisWeekTotal > 0 && (
            <>
              <div className="w-px h-12 bg-gray-100" />
              <div className="flex-1">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${thisWeekPct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">{thisWeekPct}% this week</p>
              </div>
            </>
          )}
        </div>

        {/* Empty state */}
        {items.length === 0 && (
          <div className="card p-10 text-center">
            <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No homework items yet — they'll appear here after your tutor files a session report.</p>
          </div>
        )}

        {/* Week buckets */}
        {items.length > 0 && (
          <div className="space-y-6">
            <BucketSection title="This Week" groups={thisWeekGroups} defaultOpen={true}  toggling={toggling} onToggle={handleToggle} xpToastItemId={xpToastItemId} />
            <BucketSection title="Last Week" groups={lastWeekGroups} defaultOpen={false} toggling={toggling} onToggle={handleToggle} xpToastItemId={xpToastItemId} />
            <BucketSection title="Older"     groups={olderGroups}    defaultOpen={false} toggling={toggling} onToggle={handleToggle} xpToastItemId={xpToastItemId} />
          </div>
        )}
      </div>
    </StudentPortalLayout>
  );
}
