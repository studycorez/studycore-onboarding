'use client';

import { useEffect, useState } from 'react';
import { useStudentAuth } from '@/hooks/useStudentAuth';
import StudentPortalLayout from '@/components/student-portal/StudentPortalLayout';
import { Trophy } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  isCurrentStudent: boolean;
  animal: string;
  emoji: string;
  color: string;
  displayName: string;
  battleCry: string | null;
  level: number;
  levelName: string;
  xp: number;
  improvement: number | null;
  streak: number;
}

const MEDAL = ['🥇', '🥈', '🥉'];

export default function LeaderboardPage() {
  const { student, loading } = useStudentAuth();
  const [entries, setEntries]     = useState<LeaderboardEntry[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    fetch('/api/student-portal/leaderboard')
      .then(r => r.ok ? r.json() : [])
      .then(data => { setEntries(data); setDataLoading(false); });
  }, []);

  if (loading || dataLoading) {
    return (
      <StudentPortalLayout student={null}>
        <div className="animate-pulse space-y-3 max-w-2xl">
          {[1,2,3,4,5].map(i => <div key={i} className="h-16 card rounded-xl" />)}
        </div>
      </StudentPortalLayout>
    );
  }

  return (
    <StudentPortalLayout student={student}>
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Trophy className="w-6 h-6 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Leaderboard</h1>
            <p className="text-gray-500 text-sm mt-0.5">Anonymous rankings by XP — everyone uses their avatar</p>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="card p-10 text-center text-gray-400">
            No students on the leaderboard yet.
          </div>
        ) : (
          <div className="card overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[40px_1fr_100px_80px_80px_60px] gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <div>#</div>
              <div>Student</div>
              <div>Level</div>
              <div className="text-right">XP</div>
              <div className="text-right">+Score</div>
              <div className="text-right">Streak</div>
            </div>

            <div className="divide-y divide-gray-50">
              {entries.map((e) => {
                const isTop3 = e.rank <= 3;
                const medal  = isTop3 ? MEDAL[e.rank - 1] : null;

                const rowCls = e.isCurrentStudent
                  ? 'bg-navy-50 border-l-4 border-navy-600'
                  : isTop3
                  ? 'bg-amber-50/50'
                  : '';

                const rankBg = e.rank === 1 ? 'bg-amber-400 text-white'
                  : e.rank === 2 ? 'bg-gray-300 text-gray-700'
                  : e.rank === 3 ? 'bg-orange-400 text-white'
                  : 'bg-gray-100 text-gray-500';

                return (
                  <div
                    key={e.rank}
                    className={`grid grid-cols-[40px_1fr_100px_80px_80px_60px] gap-2 px-4 py-3 items-center ${rowCls}`}
                  >
                    {/* Rank */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${rankBg}`}>
                      {medal ?? e.rank}
                    </div>

                    {/* Avatar + Name */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{e.emoji}</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 leading-tight">{e.displayName}</p>
                          {e.battleCry && (
                            <p className="text-xs text-gray-500 italic truncate max-w-[160px]">"{e.battleCry}"</p>
                          )}
                        </div>
                        {e.isCurrentStudent && (
                          <span className="text-xs bg-navy-100 text-navy-700 rounded-full px-2 py-0.5 font-semibold flex-shrink-0">You</span>
                        )}
                      </div>
                    </div>

                    {/* Level */}
                    <div className="text-xs text-gray-600">
                      <span className="font-semibold">Lvl {e.level}</span>
                      <span className="text-gray-400 block">{e.levelName}</span>
                    </div>

                    {/* XP */}
                    <div className="text-right text-sm font-bold text-amber-600">{e.xp.toLocaleString()}</div>

                    {/* Improvement */}
                    <div className="text-right text-sm font-semibold">
                      {e.improvement != null
                        ? <span className={e.improvement >= 0 ? 'text-green-600' : 'text-red-500'}>
                            {e.improvement >= 0 ? '+' : ''}{e.improvement}
                          </span>
                        : <span className="text-gray-300">—</span>
                      }
                    </div>

                    {/* Streak */}
                    <div className="text-right text-sm text-gray-600">
                      {e.streak > 0 ? `${e.streak}🔥` : <span className="text-gray-300">—</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </StudentPortalLayout>
  );
}
