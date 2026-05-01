// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = { from: (table: string) => any };

export interface TutorScoreResult {
  composite: number;          // 0–100
  sessionRating: number;      // 0–100
  studentProgress: number;    // 0–100
  consistency: number;        // 0–100
  parentSatisfaction: number; // 0–100
  calculatedAt: string;
}

/**
 * Batch-compute performance scores for one or more tutors with just 3 DB queries.
 */
export async function calculateAllTutorScores(
  tutorIds: string[],
  supabase: AnySupabase,
): Promise<Record<string, TutorScoreResult>> {
  if (!tutorIds.length) return {};
  const now = new Date().toISOString();

  // 1. All relevant sessions for these tutors
  const { data: rawSessions } = await supabase
    .from('sessions')
    .select('tutor_id, student_id, status, tutor_rating')
    .in('tutor_id', tutorIds)
    .in('status', ['completed', 'cancelled', 'no_show_tutor', 'no_show_both']);
  const sessions: any[] = rawSessions ?? [];

  // 2. Student IDs from completed sessions
  const completedStudentIds = Array.from(
    new Set(sessions.filter((s: any) => s.status === 'completed').map((s: any) => s.student_id as string))
  );

  let allProgress: any[] = [];
  let allNPS: any[] = [];
  if (completedStudentIds.length) {
    const [progRes, npsRes] = await Promise.all([
      supabase
        .from('student_progress')
        .select('student_id, total_score, recorded_at')
        .in('student_id', completedStudentIds)
        .not('total_score', 'is', null)
        .order('recorded_at', { ascending: true }),
      supabase
        .from('nps_surveys')
        .select('student_id, score')
        .in('student_id', completedStudentIds)
        .not('score', 'is', null),
    ]);
    allProgress = progRes.data ?? [];
    allNPS = npsRes.data ?? [];
  }

  const result: Record<string, TutorScoreResult> = {};

  for (const tutorId of tutorIds) {
    const ts = sessions.filter((s: any) => s.tutor_id === tutorId);
    const completedTs = ts.filter((s: any) => s.status === 'completed');

    // ── Session Rating: avg tutor_rating (1–5) → 0–100 ──
    const ratings = completedTs
      .map((s: any) => s.tutor_rating)
      .filter((r: any): r is number => r != null);
    const sessionRating =
      ratings.length > 0
        ? Math.round(((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) - 1) / 4 * 100)
        : 50;

    // ── Student Progress ──
    const myStudentIds = Array.from(new Set(completedTs.map((s: any) => s.student_id as string)));
    const progressScores: number[] = [];
    for (const sid of myStudentIds) {
      const pts = allProgress.filter((p: any) => p.student_id === sid);
      if (pts.length < 2) continue;
      const improvement = pts[pts.length - 1].total_score - pts[0].total_score;
      progressScores.push(improvement <= 0 ? 0 : Math.min(100, (improvement / 300) * 100));
    }
    const studentProgress =
      progressScores.length > 0
        ? Math.round(progressScores.reduce((a, b) => a + b, 0) / progressScores.length)
        : 50;

    // ── Consistency: completed / (completed + no_show_tutor + cancelled) ──
    const completed = completedTs.length;
    const noShow = ts.filter((s: any) => s.status === 'no_show_tutor').length;
    const cancelled = ts.filter((s: any) => s.status === 'cancelled').length;
    const denom = completed + noShow + cancelled;
    const consistency = denom > 0 ? Math.round((completed / denom) * 100) : 50;

    // ── Parent Satisfaction: avg NPS (0–10) → 0–100 ──
    const myNPS = allNPS.filter((n: any) => (myStudentIds as string[]).includes(n.student_id));
    const parentSatisfaction =
      myNPS.length > 0
        ? Math.round((myNPS.reduce((a: number, n: any) => a + n.score, 0) / myNPS.length) * 10)
        : 50;

    const composite = Math.round(
      0.25 * sessionRating +
      0.25 * studentProgress +
      0.25 * consistency +
      0.25 * parentSatisfaction,
    );

    result[tutorId] = {
      composite,
      sessionRating,
      studentProgress,
      consistency,
      parentSatisfaction,
      calculatedAt: now,
    };
  }

  return result;
}

export async function calculateTutorScore(
  tutorId: string,
  supabase: AnySupabase,
): Promise<TutorScoreResult> {
  const all = await calculateAllTutorScores([tutorId], supabase);
  return all[tutorId];
}
