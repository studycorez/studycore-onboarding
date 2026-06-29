import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyStudentJWT, STUDENT_COOKIE_NAME } from '@/lib/student-auth';
import { getLevelName, getAnimalEmoji } from '@/lib/xp';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function GET(req: NextRequest) {
  const supabase = makeSupabase();
  const token = req.cookies.get(STUDENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyStudentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch all students with portal access (xp_points > 0 or has password set)
  const { data: students } = await supabase
    .from('students')
    .select('id, xp_points, xp_level, avatar_animal, avatar_color, battle_cry, streak_weeks, current_score')
    .is('merged_into_id', null)
    .not('portal_password_hash', 'is', null)
    .order('xp_points', { ascending: false });

  if (!students?.length) return NextResponse.json([]);

  // Fetch earliest progress entries for score improvement
  const ids = students.map(s => s.id);
  const { data: allProgress } = await supabase
    .from('student_progress')
    .select('student_id, total_score, recorded_at')
    .in('student_id', ids)
    .order('recorded_at', { ascending: true });

  // Build earliest score map
  const earliestScore: Record<string, number | null> = {};
  for (const p of allProgress ?? []) {
    if (earliestScore[p.student_id] === undefined) {
      earliestScore[p.student_id] = p.total_score;
    }
  }

  const leaderboard = students.map((s, idx) => {
    const start = earliestScore[s.id] ?? s.current_score;
    const improvement = s.current_score != null && start != null ? s.current_score - start : null;
    return {
      rank: idx + 1,
      isCurrentStudent: s.id === payload.studentId,
      animal: s.avatar_animal ?? 'Fox',
      emoji: getAnimalEmoji(s.avatar_animal ?? 'Fox'),
      color: s.avatar_color ?? 'Purple',
      displayName: `${s.avatar_color ?? 'Purple'} ${s.avatar_animal ?? 'Fox'}`,
      battleCry: s.battle_cry,
      level: s.xp_level ?? 1,
      levelName: getLevelName(s.xp_level ?? 1),
      xp: s.xp_points ?? 0,
      improvement,
      streak: s.streak_weeks ?? 0,
    };
  });

  return NextResponse.json(leaderboard);
}
