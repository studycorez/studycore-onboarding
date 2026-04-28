'use client';

import { useStudentAuth } from '@/hooks/useStudentAuth';
import StudentPortalLayout from '@/components/student-portal/StudentPortalLayout';
import { BADGE_DEFS, ALL_BADGE_KEYS } from '@/lib/xp';
import { Lock, Award } from 'lucide-react';

export default function BadgesPage() {
  const { student, loading } = useStudentAuth();

  if (loading) {
    return (
      <StudentPortalLayout student={null}>
        <div className="animate-pulse grid grid-cols-3 gap-4 max-w-2xl">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-32 card rounded-xl" />
          ))}
        </div>
      </StudentPortalLayout>
    );
  }

  if (!student) return null;

  const earned = new Set(student.badges ?? []);
  const earnedCount = earned.size;
  const totalCount  = ALL_BADGE_KEYS.length;

  return (
    <StudentPortalLayout student={student}>
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Badge Collection</h1>
            <p className="text-gray-500 text-sm mt-1">
              {earnedCount} of {totalCount} badges earned
            </p>
          </div>
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
            <Award className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-bold text-amber-700">{earnedCount}/{totalCount}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div
              className="h-2.5 rounded-full bg-amber-400 transition-all"
              style={{ width: `${Math.round((earnedCount / totalCount) * 100)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {ALL_BADGE_KEYS.map(key => {
            const badge = BADGE_DEFS[key];
            const isEarned = earned.has(key);

            return (
              <div
                key={key}
                className={`card p-4 flex flex-col items-center text-center transition-all ${
                  isEarned
                    ? 'bg-gradient-to-b from-amber-50 to-white border-amber-200'
                    : 'opacity-60 grayscale'
                }`}
              >
                <div className={`relative w-14 h-14 rounded-full flex items-center justify-center text-2xl mb-3 ${
                  isEarned ? 'bg-amber-100' : 'bg-gray-100'
                }`}>
                  {isEarned ? (
                    badge.icon
                  ) : (
                    <>
                      <span className="opacity-30">{badge.icon}</span>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Lock className="w-5 h-5 text-gray-400" />
                      </div>
                    </>
                  )}
                </div>
                <p className={`text-sm font-semibold leading-tight mb-1 ${isEarned ? 'text-amber-800' : 'text-gray-400'}`}>
                  {badge.label}
                </p>
                <p className={`text-xs leading-tight ${isEarned ? 'text-amber-600' : 'text-gray-400'}`}>
                  {badge.description}
                </p>
                <p className={`text-xs font-bold mt-2 ${isEarned ? 'text-amber-700' : 'text-gray-400'}`}>
                  +{badge.xp} XP
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </StudentPortalLayout>
  );
}
