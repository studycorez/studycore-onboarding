import { createClient } from '@supabase/supabase-js';
import { postToFlagsChannel } from '@/lib/slack';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function triggerAtRiskEscalation({
  studentId,
  studentName,
  tutorName,
  sessionId,
  reportId,
  engagementRating,
  concernsForParent,
  topicsCovered,
}: {
  studentId: string | null;
  studentName: string;
  tutorName: string;
  sessionId: string;
  reportId: string;
  engagementRating: number;
  concernsForParent: string | null;
  topicsCovered: string;
}) {
  if (!studentId) return;

  const supabase = makeSupabase();
  const flags: string[] = [];

  // Rule 1: Very low engagement on this report
  if (engagementRating <= 2) {
    const label = engagementRating === 1 ? 'Not engaged' : 'Low engagement';
    flags.push(`${label} (${engagementRating}/5 this session)`);
  }

  // Rule 2: Concern for parent filed
  if (concernsForParent?.trim()) {
    flags.push(`Tutor concern: "${concernsForParent.trim().slice(0, 100)}${concernsForParent.length > 100 ? '…' : ''}"`);
  }

  // Rule 3: Pattern — fetch last 3 reports, flag if all ≤ 3
  const { data: recentReports } = await supabase
    .from('session_reports')
    .select('engagement_rating, submitted_at')
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: false })
    .limit(3);

  if ((recentReports?.length ?? 0) >= 2) {
    const allLow = (recentReports ?? []).every(r => (r.engagement_rating ?? 5) <= 3);
    if (allLow) {
      flags.push(`Pattern: last ${recentReports!.length} reports all ≤ 3 engagement`);
    }
  }

  if (flags.length === 0) return;

  const reason = flags.join(' | ');

  // Mark student at-risk
  await supabase.from('students').update({
    at_risk: true,
    at_risk_reason: reason,
    at_risk_flagged_at: new Date().toISOString(),
  }).eq('id', studentId);

  // Queue an at-risk check-in
  await supabase.from('check_ins').insert({
    student_id:   studentId,
    student_name: studentName,
    type:         'at_risk',
    session_id:   sessionId,
    report_id:    reportId,
    status:       'pending',
    context: {
      tutor_name:          tutorName,
      flags,
      engagement_rating:   engagementRating,
      concerns_for_parent: concernsForParent || null,
      topics_covered:      topicsCovered,
    },
  });

  // Slack alert to flags channel
  const stars = '★'.repeat(engagementRating) + '☆'.repeat(5 - engagementRating);
  const lines = [
    `🚨 *At-Risk Alert — ${studentName}*`,
    `Tutor: ${tutorName} | Engagement: ${stars}`,
    ...flags.map(f => `• ${f}`),
  ];
  await postToFlagsChannel(lines.join('\n')).catch(() => {});
}
