import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Levenshtein distance ──────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

// ── Bot filter ────────────────────────────────────────────────────────────────

const BOT_PATTERNS = [
  /notetaker/i,
  /fireflies/i,
  /fathom/i,
  /otter\.ai/i,
  /\(bot\)/i,
];

function isBot(zoomName: string): boolean {
  return BOT_PATTERNS.some(rx => rx.test(zoomName));
}

// ── Name matching ─────────────────────────────────────────────────────────────

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function firstNameToken(s: string): string {
  return s.trim().toLowerCase().split(/\s+/)[0] ?? '';
}

function namesMatch(zoomName: string, targetName: string): boolean {
  if (!zoomName || !targetName) return false;
  if (isBot(zoomName)) return false;

  const z = zoomName.trim().toLowerCase();
  const t = targetName.trim().toLowerCase();

  // Signal 1: exact match
  if (z === t) return true;

  // Signal 2: first-name token match
  if (firstNameToken(z) === firstNameToken(t)) return true;

  // Signal 3: concatenated form with Levenshtein ≤ 2
  // (catches "hoonj" → "hoonjung", "nicolaidefreest" → "nicolaidefreest")
  const zNorm = normalizeName(z);
  const tNorm = normalizeName(t);
  if (zNorm === tNorm) return true;
  if (levenshtein(zNorm, tNorm) <= 2) return true;

  // Signal 4: bidirectional prefix match (min 4 chars to avoid false positives)
  // (catches "hoonj" → "hoonjung", "hoonjung1234" → "hoonjung")
  if (zNorm.length >= 4 && tNorm.length >= 4) {
    if (tNorm.startsWith(zNorm) || zNorm.startsWith(tNorm)) return true;
  }

  return false;
}

// ── Zoom token ────────────────────────────────────────────────────────────────

export async function getZoomAccessToken(): Promise<string> {
  const creds = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    { method: 'POST', headers: { Authorization: `Basic ${creds}` } }
  );
  if (!res.ok) throw new Error(`Zoom token error: ${await res.text()}`);
  const data = await res.json() as any;
  return data.access_token as string;
}

// ── Instance fetch ────────────────────────────────────────────────────────────

interface ZoomMeetingInstance {
  uuid: string;
  start_time: string;
}

async function fetchPastInstances(
  meetingId: string,
  token: string
): Promise<ZoomMeetingInstance[]> {
  const url = `https://api.zoom.us/v2/past_meetings/${meetingId}/instances`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Zoom instances error ${res.status}: ${await res.text()}`);
  const data = await res.json() as any;
  return (data.meetings ?? []) as ZoomMeetingInstance[];
}

function findClosestInstance(
  instances: ZoomMeetingInstance[],
  scheduledAt: string,
  windowHours: number = 2
): ZoomMeetingInstance | null {
  const target = new Date(scheduledAt).getTime();
  let closest: ZoomMeetingInstance | null = null;
  let minDelta = Infinity;
  for (const inst of instances) {
    const delta = Math.abs(new Date(inst.start_time).getTime() - target);
    if (delta < minDelta) { minDelta = delta; closest = inst; }
  }
  if (closest && minDelta <= windowHours * 60 * 60 * 1000) return closest;
  return null;
}

// ── Participant fetch (handles pagination, by UUID) ───────────────────────────

interface ZoomParticipant {
  id: string;
  name: string;
  user_email: string;
  duration: number; // seconds
}

async function fetchParticipantsByUUID(
  uuid: string,
  token: string
): Promise<ZoomParticipant[]> {
  const all: ZoomParticipant[] = [];
  let nextPageToken: string | undefined;

  // UUIDs containing + or / must be double URL-encoded
  const encodedUUID = encodeURIComponent(encodeURIComponent(uuid));

  do {
    const url = new URL(
      `https://api.zoom.us/v2/report/meetings/${encodedUUID}/participants`
    );
    url.searchParams.set('page_size', '300');
    if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 404) return []; // No data for this instance
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Zoom participants error ${res.status}: ${body}`);
    }

    const data = await res.json() as any;
    all.push(...(data.participants ?? []));
    nextPageToken = data.next_page_token || undefined;
  } while (nextPageToken);

  return all;
}

// ── Core sync function ────────────────────────────────────────────────────────

export interface AttendanceSyncResult {
  session_id: string;
  tutor_attended: boolean | null;
  student_attended: boolean | null;
  actual_runtime_minutes: number | null;
  skipped_reason?: string;
}

export async function syncSessionAttendance(
  sessionId: string
): Promise<AttendanceSyncResult> {
  // Fetch session with related tutor and student
  const { data: session, error: fetchErr } = await supabase
    .from('sessions')
    .select(
      'id, zoom_meeting_id, scheduled_at, duration_minutes, tutor:tutors(name, email), student:students(name, email, parent_name)'
    )
    .eq('id', sessionId)
    .single();

  if (fetchErr || !session) {
    throw new Error(`Failed to fetch session ${sessionId}: ${fetchErr?.message}`);
  }

  const result: AttendanceSyncResult = {
    session_id: sessionId,
    tutor_attended: null,
    student_attended: null,
    actual_runtime_minutes: null,
  };

  // No Zoom meeting ID — cannot sync
  if (!session.zoom_meeting_id) {
    result.skipped_reason = 'no_zoom_meeting_id';
    await supabase
      .from('sessions')
      .update({ zoom_attendance_synced_at: new Date().toISOString() })
      .eq('id', sessionId);
    return result;
  }

  const tutor   = (session as any).tutor   as { name: string; email: string } | null;
  const student = (session as any).student as { name: string; email: string; parent_name: string | null } | null;

  // Fetch Zoom credentials
  if (
    !process.env.ZOOM_CLIENT_ID ||
    !process.env.ZOOM_CLIENT_SECRET ||
    !process.env.ZOOM_ACCOUNT_ID
  ) {
    throw new Error('Zoom credentials not configured');
  }

  const token = await getZoomAccessToken();
  const meetingId = String(session.zoom_meeting_id);

  // ── Find the correct per-instance UUID ───────────────────────────────────
  const instances = await fetchPastInstances(meetingId, token);
  if (instances.length === 0) {
    result.skipped_reason = 'no_past_instance';
    await supabase
      .from('sessions')
      .update({ zoom_attendance_synced_at: new Date().toISOString() })
      .eq('id', sessionId);
    return result;
  }

  const matchedInstance = findClosestInstance(instances, session.scheduled_at as string);
  if (!matchedInstance) {
    result.skipped_reason = 'no_matching_instance';
    await supabase
      .from('sessions')
      .update({ zoom_attendance_synced_at: new Date().toISOString() })
      .eq('id', sessionId);
    return result;
  }

  const participants = await fetchParticipantsByUUID(matchedInstance.uuid, token);

  if (participants.length === 0) {
    result.skipped_reason = 'no_participants_found';
    await supabase
      .from('sessions')
      .update({ zoom_attendance_synced_at: new Date().toISOString() })
      .eq('id', sessionId);
    return result;
  }

  // ── Match tutor ──────────────────────────────────────────────────────────
  // Name-based matching since Zoom returns empty user_email for
  // unauthenticated participants (all of ours).
  if (tutor && tutor.name) {
    const tutorMatch = participants.some(p => namesMatch(p.name, tutor.name));
    result.tutor_attended = tutorMatch;
  } else {
    result.tutor_attended = null;
    result.skipped_reason = 'tutor_no_name';
  }

  // ── Match student ────────────────────────────────────────────────────────
  // Student may join via parent's account, so check parent_name too.
  if (student && (student.name || student.parent_name)) {
    const studentNames = [student.name, student.parent_name].filter(Boolean) as string[];
    const studentMatch = participants.some(p =>
      studentNames.some(n => namesMatch(p.name, n))
    );
    result.student_attended = studentMatch;
  } else {
    result.student_attended = null;
  }

  // ── Compute runtime ──────────────────────────────────────────────────────
  // Use the longest individual participant duration as a proxy for meeting
  // runtime. Not literally the meeting duration (would require a separate
  // /report/meetings/{id} call), but close enough for "show actual runtime"
  // display purposes.
  const maxDurationSec = participants.reduce(
    (max, p) => Math.max(max, p.duration ?? 0),
    0
  );
  result.actual_runtime_minutes = Math.round(maxDurationSec / 60);

  // ── Write back to DB ─────────────────────────────────────────────────────
  await supabase
    .from('sessions')
    .update({
      tutor_attended:            result.tutor_attended,
      student_attended:          result.student_attended,
      actual_runtime_minutes:    result.actual_runtime_minutes,
      zoom_attendance_synced_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  return result;
}
