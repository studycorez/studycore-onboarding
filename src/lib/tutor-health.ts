// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = { from: (table: string) => any };

// Health only scores conduct from the day tutors were told the rules.
// Intentionally later than the payroll cutoff (2026-05-15).
const HEALTH_START = new Date('2026-05-21T00:00:00Z');
const ATTESTATION_START = new Date('2026-06-11T00:00:00Z');
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

export interface TutorHealthMetrics {
  tutor_id: string;
  window_start: Date;
  window_end: Date;
  sessions_count: number;
  no_show_count: number;
  no_show_rate: number;           // no_show_count / sessions_count
  reports_filed: number;
  reports_missing: number;        // completed + past 72hr + no report
  avg_filing_lag_hours: number | null;  // avg hours between scheduled_at and submitted_at
  avg_session_rating: number | null;    // avg sessions.tutor_rating (1–5)
  avg_engagement_rating: number | null; // avg session_reports.engagement_rating (1–5)
  avg_nps: number | null;               // avg nps_surveys.score (0–10) for tutor's students in window
  students_count: number;
  avg_score_improvement: number | null; // avg of (latest - earliest) total_score per student
  last_login_at: string | null;
  pending_attestations: number;
  attestation_rate: number | null;  // null if fewer than 3 attestation-eligible sessions
}

export interface TutorHealthWithName extends TutorHealthMetrics {
  tutor_name: string;
}

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

function computeAttestationMetrics(attestationSessions: any[]): { pending: number; rate: number | null } {
  const pending = attestationSessions.filter((s: any) => s.attestation_state === 'pending').length;

  const terminalStates = ['attended', 'student_no_show', 'tutor_no_show', 'cancelled', 'expired'];
  const terminal = attestationSessions.filter((s: any) => terminalStates.includes(s.attestation_state));

  if (terminal.length < 3) return { pending, rate: null };

  let onTime = 0;
  for (const s of terminal) {
    if (s.attestation_state === 'expired') continue; // expired = never attested
    if (s.attested_at) {
      const sessionEndMs = new Date(s.scheduled_at).getTime() + ((s.duration_minutes ?? 60) * 60 * 1000);
      const attestedMs = new Date(s.attested_at).getTime();
      if (attestedMs - sessionEndMs <= FORTY_EIGHT_HOURS_MS) {
        onTime++;
      }
    }
  }

  return { pending, rate: onTime / terminal.length };
}

function computeMetrics(
  tutorId: string,
  sessions: any[],
  reports: any[],
  npsData: any[],
  progressData: any[],
  attestationSessions: any[],
  lastLoginAt: string | null,
  windowStart: Date,
  windowEnd: Date,
): TutorHealthMetrics {
  const now = Date.now();
  const reportBySessionId = new Map(reports.map((r: any) => [r.session_id as string, r]));
  const completedSessions = sessions.filter((s: any) => s.status === 'completed');

  // no_show: report has tutor_attended='no_show' OR completed + past cutoff + no report
  let noShowCount = 0;
  for (const s of sessions) {
    const report = reportBySessionId.get(s.id);
    if (report?.tutor_attended === 'no_show') {
      noShowCount++;
    } else if (
      s.status === 'completed' &&
      !report &&
      now - new Date(s.scheduled_at).getTime() > SEVENTY_TWO_HOURS_MS
    ) {
      noShowCount++;
    }
  }

  // filing lag (hours from scheduled_at to submitted_at)
  const lagHours: number[] = [];
  for (const r of reports) {
    const session = sessions.find((s: any) => s.id === r.session_id);
    if (session && r.submitted_at) {
      const lag =
        (new Date(r.submitted_at).getTime() - new Date(session.scheduled_at).getTime()) /
        (1000 * 60 * 60);
      if (lag >= 0) lagHours.push(lag);
    }
  }

  const ratings = completedSessions
    .map((s: any) => s.tutor_rating)
    .filter((r: any): r is number => r != null);

  const engagements = reports
    .map((r: any) => r.engagement_rating)
    .filter((r: any): r is number => r != null);

  const studentIds = Array.from(
    new Set(completedSessions.map((s: any) => s.student_id as string))
  );

  const npsScores = npsData
    .filter((n: any) => studentIds.includes(n.student_id))
    .map((n: any) => n.score as number);

  const improvements: number[] = [];
  for (const sid of studentIds) {
    const pts = progressData.filter((p: any) => p.student_id === sid);
    if (pts.length < 2) continue;
    improvements.push(pts[pts.length - 1].total_score - pts[0].total_score);
  }

  const reportsMissing = completedSessions.filter(
    (s: any) =>
      !reportBySessionId.has(s.id) &&
      now - new Date(s.scheduled_at).getTime() > SEVENTY_TWO_HOURS_MS,
  ).length;

  return {
    tutor_id: tutorId,
    window_start: windowStart,
    window_end: windowEnd,
    sessions_count: sessions.length,
    no_show_count: noShowCount,
    no_show_rate: sessions.length > 0 ? noShowCount / sessions.length : 0,
    reports_filed: reports.length,
    reports_missing: reportsMissing,
    avg_filing_lag_hours:
      lagHours.length > 0 ? lagHours.reduce((a, b) => a + b, 0) / lagHours.length : null,
    avg_session_rating:
      ratings.length > 0
        ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
        : null,
    avg_engagement_rating:
      engagements.length > 0
        ? engagements.reduce((a: number, b: number) => a + b, 0) / engagements.length
        : null,
    avg_nps:
      npsScores.length > 0 ? npsScores.reduce((a, b) => a + b, 0) / npsScores.length : null,
    students_count: studentIds.length,
    avg_score_improvement:
      improvements.length > 0
        ? improvements.reduce((a, b) => a + b, 0) / improvements.length
        : null,
    last_login_at: lastLoginAt,
    pending_attestations: computeAttestationMetrics(attestationSessions).pending,
    attestation_rate: computeAttestationMetrics(attestationSessions).rate,
  };
}

/** Metrics for a single tutor — 4 DB queries. */
export async function getTutorHealthMetrics(
  tutorId: string,
  supabase: AnySupabase,
): Promise<TutorHealthMetrics> {
  const windowEnd = new Date();
  const rollingStart = new Date(windowEnd.getTime() - WINDOW_MS);
  const windowStart = rollingStart < HEALTH_START ? HEALTH_START : rollingStart;

  const { data: rawSessions } = await supabase
    .from('sessions')
    .select('id, student_id, status, tutor_rating, scheduled_at')
    .eq('tutor_id', tutorId)
    .gte('scheduled_at', windowStart.toISOString())
    .lte('scheduled_at', windowEnd.toISOString())
    .in('status', ['completed', 'scheduled', 'no_show_tutor', 'no_show_both']);

  const sessions: any[] = rawSessions ?? [];
  const sessionIds = sessions.map((s: any) => s.id as string);

  let reports: any[] = [];
  if (sessionIds.length > 0) {
    const { data } = await supabase
      .from('session_reports')
      .select('id, session_id, submitted_at, engagement_rating, tutor_attended')
      .in('session_id', sessionIds);
    reports = data ?? [];
  }

  const studentIds = Array.from(
    new Set(
      sessions
        .filter((s: any) => s.status === 'completed')
        .map((s: any) => s.student_id as string),
    ),
  );

  let npsData: any[] = [];
  let progressData: any[] = [];
  if (studentIds.length > 0) {
    const [{ data: nd }, { data: pd }] = await Promise.all([
      supabase
        .from('nps_surveys')
        .select('student_id, score')
        .in('student_id', studentIds)
        .not('score', 'is', null)
        .gte('sent_at', windowStart.toISOString()),
      supabase
        .from('student_progress')
        .select('student_id, total_score, recorded_at')
        .in('student_id', studentIds)
        .not('total_score', 'is', null)
        .order('recorded_at', { ascending: true }),
    ]);
    npsData = nd ?? [];
    progressData = pd ?? [];
  }

  const { data: tutor } = await supabase
    .from('tutors')
    .select('last_login_at')
    .eq('id', tutorId)
    .maybeSingle();

  const lastLoginAt = tutor?.last_login_at ?? null;

  const { data: attSessions } = await supabase
    .from('sessions')
    .select('id, tutor_id, attestation_state, scheduled_at, duration_minutes, attested_at')
    .eq('tutor_id', tutorId)
    .not('attestation_state', 'is', null)
    .gte('scheduled_at', ATTESTATION_START.toISOString());

  return computeMetrics(tutorId, sessions, reports, npsData, progressData, attSessions ?? [], lastLoginAt, windowStart, windowEnd);
}

/** Metrics for ALL active tutors — 5 DB queries total (batched). */
export async function getTutorHealthForAll(
  supabase: AnySupabase,
): Promise<TutorHealthWithName[]> {
  const windowEnd = new Date();
  const rollingStart = new Date(windowEnd.getTime() - WINDOW_MS);
  const windowStart = rollingStart < HEALTH_START ? HEALTH_START : rollingStart;

  const { data: tutors } = await supabase
    .from('tutors')
    .select('id, name, last_login_at')
    .is('archived_at', null)
    .order('name');

  const tutorList: { id: string; name: string; last_login_at: string | null }[] = tutors ?? [];
  if (!tutorList.length) return [];
  const tutorIds = tutorList.map((t) => t.id);

  const { data: rawSessions } = await supabase
    .from('sessions')
    .select('id, tutor_id, student_id, status, tutor_rating, scheduled_at')
    .in('tutor_id', tutorIds)
    .gte('scheduled_at', windowStart.toISOString())
    .lte('scheduled_at', windowEnd.toISOString())
    .in('status', ['completed', 'scheduled', 'no_show_tutor', 'no_show_both']);

  const allSessions: any[] = rawSessions ?? [];
  const allSessionIds = allSessions.map((s: any) => s.id as string);

  let allReports: any[] = [];
  if (allSessionIds.length > 0) {
    const { data } = await supabase
      .from('session_reports')
      .select('id, session_id, submitted_at, engagement_rating, tutor_attended')
      .in('session_id', allSessionIds);
    allReports = data ?? [];
  }

  const allStudentIds = Array.from(
    new Set(
      allSessions
        .filter((s: any) => s.status === 'completed')
        .map((s: any) => s.student_id as string),
    ),
  );

  let allNps: any[] = [];
  let allProgress: any[] = [];
  if (allStudentIds.length > 0) {
    const [{ data: nd }, { data: pd }] = await Promise.all([
      supabase
        .from('nps_surveys')
        .select('student_id, score')
        .in('student_id', allStudentIds)
        .not('score', 'is', null)
        .gte('sent_at', windowStart.toISOString()),
      supabase
        .from('student_progress')
        .select('student_id, total_score, recorded_at')
        .in('student_id', allStudentIds)
        .not('total_score', 'is', null)
        .order('recorded_at', { ascending: true }),
    ]);
    allNps = nd ?? [];
    allProgress = pd ?? [];
  }

  // Attestation sessions (since attestation launch, not windowed)
  const { data: rawAttSessions } = await supabase
    .from('sessions')
    .select('id, tutor_id, attestation_state, scheduled_at, duration_minutes, attested_at')
    .in('tutor_id', tutorIds)
    .not('attestation_state', 'is', null)
    .gte('scheduled_at', ATTESTATION_START.toISOString());

  const allAttSessions: any[] = rawAttSessions ?? [];

  return tutorList.map((tutor) => {
    const sessions = allSessions.filter((s: any) => s.tutor_id === tutor.id);
    const sessionIdSet = new Set(sessions.map((s: any) => s.id as string));
    const reports = allReports.filter((r: any) => sessionIdSet.has(r.session_id));
    const attSessions = allAttSessions.filter((s: any) => s.tutor_id === tutor.id);

    return {
      tutor_name: tutor.name,
      ...computeMetrics(
        tutor.id,
        sessions,
        reports,
        allNps,
        allProgress,
        attSessions,
        tutor.last_login_at,
        windowStart,
        windowEnd,
      ),
    };
  });
}
