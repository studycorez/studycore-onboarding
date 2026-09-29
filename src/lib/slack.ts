export async function postToSlack(text: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch { /* non-blocking */ }
}

export async function postToSchedulingChannel(text: string): Promise<void> {
  const token   = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_SCHEDULING_CHANNEL;
  if (!token || !channel) return;
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel, text }),
    });
  } catch { /* non-blocking */ }
}

export async function postToFlagsChannel(text: string): Promise<void> {
  const token   = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_TQC_FLAGS_CHANNEL;
  if (!token || !channel) return;
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel, text }),
    });
  } catch { /* non-blocking */ }
}
