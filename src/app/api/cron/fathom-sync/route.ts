import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { subDays, subMinutes, addMinutes } from 'date-fns';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function extractInviteeEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const emails: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.includes('@')) {
      emails.push(item.toLowerCase());
    } else if (item && typeof item === 'object') {
      const e = str((item as any).email);
      if (e && e.includes('@')) emails.push(e.toLowerCase());
    }
  }
  return emails;
}

// ── Fathom API fetch (paginated) ──────────────────────────────────────────────

async function fetchFathomCalls(apiKey: string, createdAfter: string): Promise<any[]> {
  // Try the primary endpoint first, fall back to alternate if it 404s
  const endpoints = [
    { url: 'https://api.fathom.ai/external/v1/meetings', header: 'X-Api-Key' },
    { url: 'https://fathom.video/api/v1/calls',          header: 'Authorization' },
  ];

  let allItems: any[] = [];
  let firstItemLogged = false;

  for (const endpoint of endpoints) {
    try {
      let cursor: string | undefined;
      let page = 0;

      while (true) {
        page++;
        const params = new URLSearchParams({ created_after: createdAfter });
        if (cursor) params.set('cursor', cursor);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (endpoint.header === 'Authorization') {
          headers['Authorization'] = `Bearer ${apiKey}`;
        } else {
          headers[endpoint.header] = apiKey;
        }

        const res = await fetch(`${endpoint.url}?${params}`, { headers });

        if (!res.ok) {
          const body = await res.text();
          if (page === 1) {
            console.warn(`[fathom-sync] ${endpoint.url} returned ${res.status}: ${body.slice(0, 200)}`);
          }
          break; // try next endpoint
        }

        const json: any = await res.json();

        // Log raw shape of first item ever seen
        if (!firstItemLogged) {
          const preview =
            Array.isArray(json)    ? json[0] :
            Array.isArray(json?.data)     ? json.data[0] :
            Array.isArray(json?.calls)    ? json.calls[0] :
            Array.isArray(json?.meetings) ? json.meetings[0] :
            Array.isArray(json?.results)  ? json.results[0] :
            Array.isArray(json?.items)    ? json.items[0] :
            json;
          console.log('[fathom-sync] raw first call object:', JSON.stringify(preview, null, 2));
          firstItemLogged = true;
        }

        // Defensively extract the array from any response shape
        const items: any[] =
          Array.isArray(json)           ? json :
          Array.isArray(json?.data)     ? json.data :
          Array.isArray(json?.calls)    ? json.calls :
          Array.isArray(json?.meetings) ? json.meetings :
          Array.isArray(json?.results)  ? json.results :
          Array.isArray(json?.items)    ? json.items :
          [];

        allItems.push(...items);
        console.log(`[fathom-sync] page ${page}: ${items.length} calls (total ${allItems.length})`);

        cursor = json?.next_cursor ?? json?.nextCursor ?? json?.cursor ?? undefined;
        if (!cursor || items.length === 0) break;
      }

      if (allItems.length > 0) break; // got data from this endpoint, stop
    } catch (err: any) {
      console.warn(`[fathom-sync] error hitting ${endpoint.url}:`, err.message);
    }
  }

  return allItems;
}

// ── Core sync logic (shared by cron and manual trigger) ───────────────────────

export async function runFathomSync(): Promise<{
  callsFetched: number;
  matched: number;
  alreadyHadUrl: number;
  noMatch: number;
}> {
  const apiKey = process.env.FATHOM_API_KEY;
  if (!apiKey) throw new Error('FATHOM_API_KEY is not set');

  const supabase = getSupabase();
  const createdAfter = subDays(new Date(), 7).toISOString();

  console.log(`[fathom-sync] fetching calls after ${createdAfter}`);
  const calls = await fetchFathomCalls(apiKey, createdAfter);
  console.log(`[fathom-sync] total calls fetched: ${calls.length}`);

  let matched = 0, alreadyHadUrl = 0, noMatch = 0;

  for (const call of calls) {
    // Extract recording URL from all known field names
    const recordingUrl: string | null =
      str(call.recording_url) ??
      str(call.video_url) ??
      str(call.share_url) ??
      str(call.url) ??
      null;

    // Extract transcript
    const transcript: string | null =
      str(call.transcript) ??
      str(call.summary) ??   // some providers call it summary
      null;

    if (!recordingUrl) {
      noMatch++;
      continue;
    }

    // Extract start time for time-based matching
    const startedAt: string | null =
      str(call.started_at) ??
      str(call.created_at) ??
      str(call.start_time) ??
      null;

    // Extract Zoom meeting ID for direct match
    const zoomMeetingId: string | null =
      str(call.zoom_meeting_id) ??
      str(call.external_id) ??
      str(call.meeting_id) ??
      str(call.integration_data?.zoom?.meeting_id) ??
      null;

    const recordedByEmail: string | null =
      str(call.recorded_by?.email) ??
      str(call.host_email) ??
      null;

    const invitees = extractInviteeEmails(call.calendar_invitees ?? call.attendees);

    let sessionId: string | null = null;
    let matchMethod = '';

    // ── Strategy 0: direct zoom_meeting_id match ──────────────────────────
    if (!sessionId && zoomMeetingId) {
      const { data: rows } = await supabase
        .from('sessions')
        .select('id, fathom_recording_url')
        .eq('zoom_meeting_id', zoomMeetingId)
        .limit(1);

      if (rows && rows.length > 0) {
        if (rows[0].fathom_recording_url) {
          alreadyHadUrl++;
          continue;
        }
        sessionId = rows[0].id;
        matchMethod = `zoom-id(${zoomMeetingId})`;
      }
    }

    // ── Strategy 1: time window via tutor email (±30 min) ─────────────────
    if (!sessionId && recordedByEmail && startedAt) {
      const meetingTime = new Date(startedAt);
      const windowStart = subMinutes(meetingTime, 30).toISOString();
      const windowEnd   = addMinutes(meetingTime, 30).toISOString();

      const { data: tutor } = await supabase
        .from('tutors')
        .select('id')
        .ilike('email', recordedByEmail)
        .maybeSingle();

      if (tutor?.id) {
        const { data: rows } = await supabase
          .from('sessions')
          .select('id, scheduled_at, fathom_recording_url')
          .eq('tutor_id', tutor.id)
          .is('fathom_recording_url', null)
          .in('status', ['scheduled', 'completed'])
          .gte('scheduled_at', windowStart)
          .lte('scheduled_at', windowEnd)
          .order('scheduled_at');

        if (rows && rows.length > 0) {
          rows.sort((a, b) =>
            Math.abs(new Date(a.scheduled_at).getTime() - meetingTime.getTime()) -
            Math.abs(new Date(b.scheduled_at).getTime() - meetingTime.getTime()),
          );
          sessionId = rows[0].id;
          matchMethod = `tutor-email(${recordedByEmail})`;
        }
      }
    }

    // ── Strategy 2: time window via invitee/student email (±30 min) ───────
    if (!sessionId && invitees.length > 0 && startedAt) {
      const meetingTime = new Date(startedAt);
      const windowStart = subMinutes(meetingTime, 30).toISOString();
      const windowEnd   = addMinutes(meetingTime, 30).toISOString();

      for (const email of invitees) {
        const { data: student } = await supabase
          .from('students')
          .select('id')
          .ilike('email', email)
          .maybeSingle();

        if (!student?.id) continue;

        const { data: rows } = await supabase
          .from('sessions')
          .select('id, scheduled_at, fathom_recording_url')
          .eq('student_id', student.id)
          .is('fathom_recording_url', null)
          .in('status', ['scheduled', 'completed'])
          .gte('scheduled_at', windowStart)
          .lte('scheduled_at', windowEnd)
          .order('scheduled_at');

        if (rows && rows.length > 0) {
          rows.sort((a, b) =>
            Math.abs(new Date(a.scheduled_at).getTime() - meetingTime.getTime()) -
            Math.abs(new Date(b.scheduled_at).getTime() - meetingTime.getTime()),
          );
          sessionId = rows[0].id;
          matchMethod = `invitee-email(${email})`;
          break;
        }
      }
    }

    if (!sessionId) {
      noMatch++;
      console.log(`[fathom-sync] no match for call id=${call.id ?? '?'} startedAt=${startedAt ?? '?'}`);
      continue;
    }

    // ── Update session ─────────────────────────────────────────────────────
    const updates: Record<string, unknown> = { fathom_recording_url: recordingUrl };
    if (transcript) updates.fathom_transcript = transcript;

    const { error } = await supabase
      .from('sessions')
      .update(updates)
      .eq('id', sessionId);

    if (error) {
      console.error(`[fathom-sync] update error session=${sessionId}: ${error.message}`);
      noMatch++;
    } else {
      matched++;
      console.log(`[fathom-sync] matched session=${sessionId} method=${matchMethod} url=${recordingUrl}`);
    }
  }

  console.log(`[fathom-sync] done — fetched=${calls.length} matched=${matched} alreadyHadUrl=${alreadyHadUrl} noMatch=${noMatch}`);
  return { callsFetched: calls.length, matched, alreadyHadUrl, noMatch };
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const result = await runFathomSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[fathom-sync] fatal error:', err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// Also accept POST for manual triggers from the admin UI
export async function POST(req: NextRequest) {
  // Verify it's an internal call in production (Vercel cron header or no secret check needed for admin UI)
  return GET();
}
