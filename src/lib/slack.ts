/**
 * Slack notification helper for StudyCore.
 * Posts to the configured SLACK_WEBHOOK_URL (Slack Incoming Webhook).
 * Falls back silently if the env var is not set.
 */

export async function postToSlack(text: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return; // silently skip if not configured

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

export function buildStudentOnboardMessage(params: {
  name: string;
  email: string;
  grade?: number | null;
  targetScore?: number | null;
  source?: string | null;
}): string {
  const lines = [
    `🎓 *New Student Onboarded!*`,
    `• Name: ${params.name}`,
    `• Email: ${params.email}`,
    params.grade ? `• Grade: ${params.grade}` : null,
    params.targetScore ? `• Target SAT: ${params.targetScore}` : null,
    params.source ? `• Source: ${params.source}` : null,
  ].filter(Boolean) as string[];
  return lines.join('\n');
}

export function buildContractOnboardMessage(params: {
  studentName: string;
  tutorName: string;
  hourlyRate: number;
  contractId: string;
  appUrl: string;
}): string {
  return [
    `📝 *New Contract Created*`,
    `• Student: ${params.studentName}`,
    `• Tutor: ${params.tutorName}`,
    `• Rate: $${params.hourlyRate}/hr`,
    `• Contract: ${params.appUrl}/contracts/${params.contractId}`,
  ].join('\n');
}
