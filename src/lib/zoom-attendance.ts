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
  const data = await res.json();
  return data.access_token as string;
}

// ── Participant fetch (handles pagination) ────────────────────────────────────

interface ZoomParticipant {
  id: string;
  name: string;
  user_email: string;
  duration: number; // seconds
}

async function fetchAllParticipants(
  meetingId: string,
  token: string
): Promise<ZoomParticipant[]> {
  const all: ZoomParticipant[] = [];
  let nextPageToken: string | undefined;

  do {
    const url = new URL(
      `https://api.zoom.us/v2/report/meetings/${meetingId}/participants`
    );
    url.searchParams.set('page_size', '300');
    if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 404) return []; // No past instances — not an error
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Zoom participants error ${res.status}: ${body}`);
    }

    const data = await res.json();
    all.push(...(data.participants ?? []));
    nextPageToken = data.next_page_token || undefined;
  } while (nextPageToken);

  return all;
}

// ── Name matching ─────────────────────────────────────────────────────────────

function nameMatches(zoomName: string, targetName: string): boolean {
  const a = zoomName.trim().toLowerCase();
  const b = targetName.trim().toLowerCase();
  if (a === b) return true;
  // Allow up to 2 edit-distance (handles typos / truncation)
  return levenshtein(a, b) < 3;
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
      'id, zoom_meeting_id, scheduled_at, duration_minutes, tutor:tutors(name, email), student:students(name, email)'
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
  const student = (session as any).student as { name: string; email: string } | null;

  // Fetch Zoom credentials
  if (
    !process.env.ZOOM_CLIENT_ID ||
    !process.env.ZOOM_CLIENT_SECRET ||
    !process.env.ZOOM_ACCOUNT_ID
  ) {
    throw new Error('Zoom credentials not configured');
  }

  const token = await getZoomAccessToken();
  const participants = await fetchAllParticipants(
    String(session.zoom_meeting_id),
    token
  );

  if (participants.length === 0) {
    // 404 was handled in fetchAllParticipants (returns []). No past instance or truly empty.
    result.skipped_reason = 'no_participants_found';
    await supabase
      .from('sessions')
      .update({ zoom_attendance_synced_at: new Date().toISOString() })
      .eq('id', sessionId);
    return result;
  }

  // ── Match tutor ──────────────────────────────────────────────────────────
  // Email-only match for tutor — fuzzy name matching is too loose for
  // short names and could mis-attribute attendance ($0 pay decisions need
  // to be precise).
  if (tutor) {
    const tutorEmail = (tutor.email ?? '').toLowerCase();
    if (!tutorEmail) {
      // No email on file — can't reliably match. Leave as null for admin review.
      result.tutor_attended = null;
      result.skipped_reason = 'tutor_no_email';
    } else {
      const tutorMatch = participants.some(p =>
        (p.user_email ?? '').toLowerCase() === tutorEmail
      );
      result.tutor_attended = tutorMatch;
    }
  }

  // ── Match student ────────────────────────────────────────────────────────
  if (student) {
    const studentEmail = (student.email ?? '').toLowerCase();
    const studentMatch = participants.some(p => {
      if (studentEmail && p.user_email.toLowerCase() === studentEmail) return true;
      return nameMatches(p.name, student.name);
    });
    result.student_attended = studentMatch;
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
      tutor_attended:           result.tutor_attended,
      student_attended:         result.student_attended,
      actual_runtime_minutes:   result.actual_runtime_minutes,
      zoom_attendance_synced_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  return result;
}
