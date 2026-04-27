interface ZoomMeeting {
  id: number;
  join_url: string;
  start_url: string;
}

async function getAccessToken(): Promise<string> {
  const creds = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}` },
    }
  );
  if (!res.ok) throw new Error(`Zoom token error: ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

export async function createZoomMeeting(params: {
  topic: string;
  startTime: string; // ISO 8601
  durationMinutes: number;
  zoomUserId?: string;
}): Promise<ZoomMeeting | null> {
  if (!process.env.ZOOM_CLIENT_ID || !process.env.ZOOM_CLIENT_SECRET || !process.env.ZOOM_ACCOUNT_ID) {
    console.warn('Zoom credentials not configured — skipping meeting creation');
    return null;
  }
  try {
    const token = await getAccessToken();
    const userId = params.zoomUserId || 'me';
    const res = await fetch(`https://api.zoom.us/v2/users/${userId}/meetings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: params.topic,
        type: 2,
        start_time: params.startTime,
        duration: params.durationMinutes,
        settings: {
          host_video: true,
          participant_video: true,
          waiting_room: true,
          join_before_host: false,
        },
      }),
    });
    if (!res.ok) throw new Error(`Zoom meeting error: ${await res.text()}`);
    return res.json();
  } catch (err) {
    console.error('createZoomMeeting failed:', err);
    return null;
  }
}

export async function updateZoomMeeting(meetingId: string, params: {
  startTime: string; // ISO 8601
  durationMinutes: number;
}): Promise<boolean> {
  if (!process.env.ZOOM_CLIENT_ID) return false;
  try {
    const token = await getAccessToken();
    const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        start_time: params.startTime,
        duration: params.durationMinutes,
      }),
    });
    if (!res.ok) {
      console.error('updateZoomMeeting failed:', await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('updateZoomMeeting failed:', err);
    return false;
  }
}

export async function deleteZoomMeeting(meetingId: string): Promise<void> {
  if (!process.env.ZOOM_CLIENT_ID) return;
  try {
    const token = await getAccessToken();
    await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.error('deleteZoomMeeting failed:', err);
  }
}
