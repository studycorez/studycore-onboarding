/**
 * Slack notification helper for StudyCore.
 * Posts to the configured SLACK_WEBHOOK_URL (Slack Incoming Webhook).
 * Falls back silently if the env var is not set.
 */

export async function notifyEmailSent(params: {
  type: string;       // e.g. "📅 Booking confirmation", "⏰ 24hr reminder"
  to: string;         // primary recipient email
  studentName?: string;
  tutorName?: string;
  sessionDate?: string; // pre-formatted date string or extra context label
}): Promise<void> {
  const url = process.env.SLACK_EMAIL_LOG_WEBHOOK_URL;
  if (!url) return;
  const parts: string[] = [`${params.type} → \`${params.to}\``];
  if (params.studentName) parts.push(`Student: ${params.studentName}`);
  if (params.tutorName)   parts.push(`Tutor: ${params.tutorName}`);
  if (params.sessionDate) parts.push(params.sessionDate);
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: parts.join(' | ') }),
  }).catch(() => {}); // non-blocking — never throw
}

export async function postToSlack(text: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return; // silently skip if not configured

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

/**
 * Post a message using the Slack Bot Token (chat.postMessage).
 * Falls back to SLACK_WEBHOOK_URL if bot token is not configured.
 * Silently no-ops if neither is available.
 */
export async function postSlackNotification(text: string, channel?: string): Promise<void> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (botToken) {
    const ch = channel ?? process.env.SLACK_GAMEPLAN_CHANNEL ?? 'client-alerts';
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: ch, text }),
    }).catch(() => {});
  } else if (webhookUrl) {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).catch(() => {});
  }
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
