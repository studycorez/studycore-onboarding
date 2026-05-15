import type { SupabaseClient } from '@supabase/supabase-js';

// ── Level Thresholds ──────────────────────────────────────────────────────────

const LEVELS = [
  { level: 1, name: 'Hatchling', min: 0 },
  { level: 2, name: 'Scout',     min: 500 },
  { level: 3, name: 'Tracker',   min: 1500 },
  { level: 4, name: 'Hunter',    min: 3000 },
  { level: 5, name: 'Predator',  min: 5000 },
  { level: 6, name: 'Alpha',     min: 8000 },
  { level: 7, name: 'Legend',    min: 12000 },
] as const;

export function getLevelInfo(xp: number) {
  let current: typeof LEVELS[number] = LEVELS[0];
  for (const t of LEVELS) {
    if (xp >= t.min) current = t;
    else break;
  }
  const idx = LEVELS.findIndex(t => t.level === current.level);
  const next = LEVELS[idx + 1] ?? null;
  const prevMin = current.min;
  const nextMin = next?.min ?? null;
  const pct = nextMin != null
    ? Math.min(100, Math.round(((xp - prevMin) / (nextMin - prevMin)) * 100))
    : 100;
  return {
    level: current.level,
    name: current.name,
    xpInLevel: xp - prevMin,
    xpToNext: nextMin != null ? nextMin - xp : 0,
    nextName: next?.name ?? null,
    pct,
  };
}

export function getLevelName(level: number): string {
  return LEVELS.find(l => l.level === level)?.name ?? 'Hatchling';
}

// ── Badge Definitions ─────────────────────────────────────────────────────────

export const BADGE_DEFS = {
  first_session:      { label: 'First Session',      xp: 50,   icon: '🏆', description: 'Attended your first session' },
  perfect_attendance: { label: 'Perfect Attendance', xp: 200,  icon: '⭐', description: '4 weeks straight' },
  early_bird:         { label: 'Early Bird',         xp: 100,  icon: '🌅', description: 'Joined on time 10 times' },
  score_climber:      { label: 'Score Climber',      xp: 150,  icon: '📈', description: '50+ point improvement' },
  century_club:       { label: 'Century Club',       xp: 300,  icon: '💯', description: '100+ point improvement' },
  double_century:     { label: 'Double Century',     xp: 500,  icon: '🚀', description: '200+ point improvement' },
  goal_crusher:       { label: 'Goal Crusher',       xp: 1000, icon: '🎯', description: 'Reached your target score' },
  streak_master:      { label: 'Streak Master',      xp: 400,  icon: '🔥', description: '8 weeks straight' },
  homework_hero:      { label: 'Homework Hero',      xp: 75,   icon: '📚', description: 'Completed intake form' },
  team_player:        { label: 'Team Player',        xp: 200,  icon: '🤝', description: '10 sessions completed' },
  veteran:            { label: 'Veteran',            xp: 500,  icon: '🛡️', description: '25 sessions completed' },
  legend:             { label: 'Legend',             xp: 1000, icon: '👑', description: 'Reached Level 7' },
} as const;

export type BadgeKey = keyof typeof BADGE_DEFS;
export const ALL_BADGE_KEYS = Object.keys(BADGE_DEFS) as BadgeKey[];

// ── Avatar Config ─────────────────────────────────────────────────────────────

export const ANIMALS = [
  { name: 'Fox',      emoji: '🦊' },
  { name: 'Wolf',     emoji: '🐺' },
  { name: 'Eagle',    emoji: '🦅' },
  { name: 'Panda',    emoji: '🐼' },
  { name: 'Tiger',    emoji: '🐯' },
  { name: 'Owl',      emoji: '🦉' },
  { name: 'Dolphin',  emoji: '🐬' },
  { name: 'Cheetah',  emoji: '🐆' },
  { name: 'Bear',     emoji: '🐻' },
  { name: 'Falcon',   emoji: '🦅' },
  { name: 'Lion',     emoji: '🦁' },
  { name: 'Shark',    emoji: '🦈' },
  { name: 'Hawk',     emoji: '🐦' },
  { name: 'Leopard',  emoji: '🐅' },
  { name: 'Penguin',  emoji: '🐧' },
  { name: 'Rhino',    emoji: '🦏' },
  { name: 'Gorilla',  emoji: '🦍' },
  { name: 'Elephant', emoji: '🐘' },
  { name: 'Octopus',  emoji: '🐙' },
  { name: 'Dragon',   emoji: '🐉' },
];

export const COLORS = [
  { name: 'Purple', bg: 'bg-purple-500', hex: '#a855f7' },
  { name: 'Blue',   bg: 'bg-blue-500',   hex: '#3b82f6' },
  { name: 'Red',    bg: 'bg-red-500',    hex: '#ef4444' },
  { name: 'Green',  bg: 'bg-green-500',  hex: '#22c55e' },
  { name: 'Gold',   bg: 'bg-amber-400',  hex: '#fbbf24' },
  { name: 'Orange', bg: 'bg-orange-500', hex: '#f97316' },
  { name: 'Pink',   bg: 'bg-pink-500',   hex: '#ec4899' },
  { name: 'Teal',   bg: 'bg-teal-500',   hex: '#14b8a6' },
  { name: 'Silver', bg: 'bg-slate-400',  hex: '#94a3b8' },
  { name: 'Black',  bg: 'bg-slate-800',  hex: '#1e293b' },
];

export function getAnimalEmoji(name: string | null | undefined): string {
  if (!name) return '🦊';
  return ANIMALS.find(a => a.name.toLowerCase() === name.toLowerCase())?.emoji ?? '🦊';
}

export function getColorHex(name: string | null | undefined): string {
  if (!name) return '#a855f7';
  return COLORS.find(c => c.name.toLowerCase() === name.toLowerCase())?.hex ?? '#a855f7';
}

// ── Core XP / Badge Award Functions ──────────────────────────────────────────

/**
 * Award XP to a student atomically via Postgres stored procedure.
 * Pass a stable idempotencyKey to make the call safe to retry.
 * Returns whether XP was newly awarded and the student's updated totals.
 */
export async function awardXP(
  supabase: SupabaseClient,
  studentId: string,
  xpAmount: number,
  eventType: string,
  description: string,
  idempotencyKey?: string,
): Promise<{ awarded: boolean; newXP: number; newLevel: number }> {
  if (!idempotencyKey) {
    // Legacy callers: synthesize a key from timestamp.
    // Not truly idempotent, but at least uses the atomic path.
    // TODO: every caller should pass a real key.
    console.warn(`awardXP called without idempotencyKey for ${eventType}`);
    idempotencyKey = `${eventType}:${studentId}:${Date.now()}`;
  }

  const { data, error } = await supabase.rpc('award_xp_atomic', {
    p_student_id: studentId,
    p_xp_amount: xpAmount,
    p_event_type: eventType,
    p_description: description,
    p_idempotency_key: idempotencyKey,
  });

  if (error) throw new Error(`awardXP failed: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : data;
  return {
    awarded: row.awarded,
    newXP: row.new_xp,
    newLevel: row.new_level,
  };
}

/**
 * Award a badge to a student atomically via Postgres stored procedure.
 * No-ops if already earned. Also awards the badge's XP and updates xp_level.
 */
export async function awardBadge(
  supabase: SupabaseClient,
  studentId: string,
  badgeKey: BadgeKey,
): Promise<void> {
  const badge = BADGE_DEFS[badgeKey];

  const { data, error } = await supabase.rpc('award_badge_atomic', {
    p_student_id: studentId,
    p_badge_key: badgeKey,
    p_xp_amount: badge.xp,
    p_badge_label: badge.label,
  });

  if (error) throw new Error(`awardBadge failed for ${badgeKey}: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : data;

  // Recursive legend check (only if badge was newly awarded)
  if (row.awarded && row.new_level >= 7 && badgeKey !== 'legend'
      && !row.new_badges.includes('legend')) {
    await awardBadge(supabase, studentId, 'legend');
  }
}

/**
 * Check and award session-count badges (team_player, veteran).
 */
export async function checkSessionCountBadges(
  supabase: SupabaseClient,
  studentId: string,
): Promise<void> {
  const { count } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('status', 'completed');

  const n = count ?? 0;
  if (n >= 10) await awardBadge(supabase, studentId, 'team_player');
  if (n >= 25) await awardBadge(supabase, studentId, 'veteran');
}

/**
 * Check and award score improvement badges.
 * Pass the student's starting score (earliest progress entry or initial current_score)
 * and their latest score.
 */
export async function checkScoreBadges(
  supabase: SupabaseClient,
  studentId: string,
  currentScore: number,
  targetScore: number | null,
): Promise<void> {
  // Get earliest progress entry as starting score
  const { data: oldest } = await supabase
    .from('student_progress')
    .select('total_score')
    .eq('student_id', studentId)
    .order('recorded_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const startScore = oldest?.total_score ?? currentScore;
  const improvement = currentScore - startScore;

  if (improvement >= 50)  await awardBadge(supabase, studentId, 'score_climber');
  if (improvement >= 100) await awardBadge(supabase, studentId, 'century_club');
  if (improvement >= 200) await awardBadge(supabase, studentId, 'double_century');
  if (targetScore != null && currentScore >= targetScore) {
    await awardBadge(supabase, studentId, 'goal_crusher');
  }
}

/**
 * Update streak and award streak badges.
 * Returns updated streak count.
 */
export async function updateStreak(
  supabase: SupabaseClient,
  studentId: string,
): Promise<number> {
  const { data: student } = await supabase
    .from('students')
    .select('streak_weeks, last_session_week')
    .eq('id', studentId)
    .single();

  if (!student) return 0;

  // Current ISO week: "2024-W01"
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  const currentWeek = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

  if (student.last_session_week === currentWeek) {
    // Already counted this week
    return student.streak_weeks ?? 0;
  }

  // Compute previous week string
  const prevDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevStartOfYear = new Date(prevDate.getFullYear(), 0, 1);
  const prevWeekNum = Math.ceil(((prevDate.getTime() - prevStartOfYear.getTime()) / 86400000 + prevStartOfYear.getDay() + 1) / 7);
  const prevWeek = `${prevDate.getFullYear()}-W${String(prevWeekNum).padStart(2, '0')}`;

  let newStreak: number;
  if (student.last_session_week === prevWeek) {
    newStreak = (student.streak_weeks ?? 0) + 1;
  } else {
    newStreak = 1; // reset
  }

  await supabase.from('students').update({
    streak_weeks: newStreak,
    last_session_week: currentWeek,
  }).eq('id', studentId);

  // Streak badges
  if (newStreak >= 4) await awardBadge(supabase, studentId, 'perfect_attendance');
  if (newStreak >= 8) await awardBadge(supabase, studentId, 'streak_master');

  return newStreak;
}
