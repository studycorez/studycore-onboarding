import { createClient } from '@supabase/supabase-js';
import { postSlackNotification } from '@/lib/slack';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const TYPE_LABELS: Record<string, string> = {
  first_session: 'Post-Session 1 Check-in',
  '3_session':   'Post-Session 3 Check-in',
  weekly:        'Weekly Sync',
  phase:         'Phase Check-in (Practice Test)',
};

export async function triggerCheckIns({
  sessionId,
  reportId,
  studentId,
  tutorId,
  practiceTestCompleted,
  practiceTestType,
  practiceTestScore,
  topicsCovered,
  engagementRating,
  concernsForParent,
}: {
  sessionId: string;
  reportId: string;
  studentId: string | null;
  tutorId: string;
  practiceTestCompleted: boolean;
  practiceTestType?: string | null;
  practiceTestScore?: number | null;
  topicsCovered: string;
  engagementRating: number;
  concernsForParent: string | null;
}) {
  if (!studentId) return;

  const supabase = makeSupabase();

  // Fetch student and tutor names in parallel
  const [{ data: student }, { data: tutor }] = await Promise.all([
    supabase.from('students').select('name').eq('id', studentId).maybeSingle(),
    supabase.from('tutors').select('name').eq('id', tutorId).maybeSingle(),
  ]);

  const studentName = (student as any)?.name ?? 'Unknown Student';
  const tutorName   = (tutor as any)?.name   ?? 'Unknown Tutor';

  // Count total submitted reports for this student
  const { count: reportCount } = await supabase
    .from('session_reports')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId);

  const totalReports = reportCount ?? 1;

  // Determine which types to create
  const typesToCreate: string[] = [];

  if (totalReports === 1) {
    const { count: existing } = await supabase
      .from('check_ins').select('id', { count: 'exact', head: true })
      .eq('student_id', studentId).eq('type', 'first_session');
    if ((existing ?? 0) === 0) typesToCreate.push('first_session');
  }

  if (totalReports === 3) {
    const { count: existing } = await supabase
      .from('check_ins').select('id', { count: 'exact', head: true })
      .eq('student_id', studentId).eq('type', '3_session');
    if ((existing ?? 0) === 0) typesToCreate.push('3_session');
  }

  // Weekly: max one per student per 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: recentWeekly } = await supabase
    .from('check_ins').select('id', { count: 'exact', head: true })
    .eq('student_id', studentId).eq('type', 'weekly')
    .gte('created_at', sevenDaysAgo);
  if ((recentWeekly ?? 0) === 0) typesToCreate.push('weekly');

  // Phase: every practice test completion triggers one
  if (practiceTestCompleted) typesToCreate.push('phase');

  if (typesToCreate.length === 0) return;

  const context = {
    tutor_name:        tutorName,
    session_count:     totalReports,
    topics_covered:    topicsCovered,
    engagement_rating: engagementRating,
    concerns_for_parent: concernsForParent || null,
    ...(practiceTestCompleted && {
      practice_test_type:  practiceTestType  ?? null,
      practice_test_score: practiceTestScore ?? null,
    }),
  };

  await supabase.from('check_ins').insert(
    typesToCreate.map(type => ({
      student_id:   studentId,
      student_name: studentName,
      type,
      session_id:   sessionId,
      report_id:    reportId,
      context,
      status: 'pending',
    }))
  );

  // Slack alert per type
  const channel = process.env.SLACK_SSC_CHANNEL ?? 'ssc-dashboard';
  for (const type of typesToCreate) {
    const stars = '★'.repeat(engagementRating) + '☆'.repeat(5 - engagementRating);
    const lines: string[] = [
      `📞 *${TYPE_LABELS[type]}* — ${studentName}`,
      `Tutor: ${tutorName} | Sessions: ${totalReports} | Engagement: ${stars}`,
    ];
    if (topicsCovered) lines.push(`Topics: ${topicsCovered.slice(0, 120)}${topicsCovered.length > 120 ? '…' : ''}`);
    if (concernsForParent) lines.push(`⚠️ Concern: ${concernsForParent.slice(0, 100)}`);
    if (type === 'phase' && practiceTestScore) {
      const testLabel =
        practiceTestType === 'full'  ? 'Full SAT' :
        practiceTestType === 'math'  ? 'Math Section' :
        practiceTestType === 'rw'    ? 'R&W Section' : 'Practice Test';
      lines.push(`📊 ${testLabel}: *${practiceTestScore}*`);
    }
    await postSlackNotification(lines.join('\n'), channel).catch(() => {});
  }
}
