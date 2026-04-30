/**
 * Fathom AI recording webhook
 *
 * Required environment variables:
 *   FATHOM_WEBHOOK_SECRET  — must match the secret configured in Fathom settings
 *
 * Point your Fathom webhook at: https://studycore-eight.vercel.app/api/webhooks/fathom
 *
 * This endpoint:
 * 1. Verifies the x-fathom-secret header
 * 2. Logs the full raw payload (so we can inspect Fathom's schema)
 * 3. Tries to match the recording to a session via:
 *    a. zoom_meeting_id match (most reliable if Fathom sends it)
 *    b. scheduled_at ±2 hours + tutor name fuzzy match (fallback)
 * 4. Writes the share URL to sessions.fathom_recording_url
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { subHours, addHours } from 'date-fns';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ts = new Date().toISOString();
  console.log('[fathom-webhook] received at', ts);

  // ── 1. Verify secret ──────────────────────────────────────────────────────
  const secret = process.env.FATHOM_WEBHOOK_SECRET;
  if (secret) {
    const header = req.headers.get('x-fathom-secret');
    if (!header || header !== secret) {
      console.warn('[fathom-webhook] 401 — bad or missing x-fathom-secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    console.warn('[fathom-webhook] FATHOM_WEBHOOK_SECRET not set — skipping auth check');
  }

  // ── 2. Parse & log raw payload ────────────────────────────────────────────
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch (err) {
    console.error('[fathom-webhook] Failed to parse JSON body:', err);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log('[fathom-webhook] RAW PAYLOAD:', JSON.stringify(payload, null, 2));

  // ── 3. Extract recording fields ───────────────────────────────────────────
  // Fathom's schema is not publicly finalized — we try multiple field paths.
  // After first real webhook, update this based on the logged payload above.
  const shareUrl: string | null =
    getString(payload, 'share_url') ??
    getString(payload, 'recording.share_url') ??
    getString(payload, 'recording_url') ??
    getString(payload, 'url') ??
    getNestedString(payload, ['recording', 'share_url']) ??
    getNestedString(payload, ['call', 'share_url']) ??
    null;

  const zoomMeetingId: string | null =
    getString(payload, 'zoom_meeting_id') ??
    getNestedString(payload, ['recording', 'zoom_meeting_id']) ??
    getNestedString(payload, ['call', 'zoom_meeting_id']) ??
    getNestedString(payload, ['meeting', 'id']) ??
    null;

  const meetingStartedAt: string | null =
    getString(payload, 'started_at') ??
    getNestedString(payload, ['recording', 'started_at']) ??
    getNestedString(payload, ['call', 'started_at']) ??
    getNestedString(payload, ['meeting', 'started_at']) ??
    null;

  // Attendee/participant names (for fuzzy tutor match)
  const attendeeNames: string[] = extractAttendeeNames(payload);

  console.log('[fathom-webhook] extracted — shareUrl=%s zoomMeetingId=%s startedAt=%s attendees=%s',
    shareUrl, zoomMeetingId, meetingStartedAt, attendeeNames.join(', '));

  if (!shareUrl) {
    console.error('[fathom-webhook] No share URL found in payload');
    return NextResponse.json({ error: 'No recording URL in payload' }, { status: 400 });
  }

  // ── 4. Match session ───────────────────────────────────────────────────────
  const supabase = getServiceClient();
  let sessionId: string | null = null;

  // Strategy A: zoom_meeting_id match
  if (zoomMeetingId) {
    const { data, error } = await supabase
      .from('sessions')
      .select('id')
      .eq('zoom_meeting_id', zoomMeetingId)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[fathom-webhook] zoom_meeting_id query error:', error.message);
    }
    if (data?.id) {
      sessionId = data.id;
      console.log('[fathom-webhook] Matched via zoom_meeting_id=%s → session=%s', zoomMeetingId, sessionId);
    }
  }

  // Strategy B: scheduled_at ±2h + tutor name fuzzy match
  if (!sessionId && meetingStartedAt) {
    const start = new Date(meetingStartedAt);
    const windowStart = subHours(start, 2).toISOString();
    const windowEnd   = addHours(start, 2).toISOString();

    const { data: candidates, error } = await supabase
      .from('sessions')
      .select('id, scheduled_at, tutor:tutors(name)')
      .gte('scheduled_at', windowStart)
      .lte('scheduled_at', windowEnd)
      .in('status', ['completed', 'scheduled']);

    if (error) {
      console.error('[fathom-webhook] window query error:', error.message);
    }

    if (candidates && candidates.length > 0) {
      if (candidates.length === 1) {
        // Only one session in window — safe to match
        sessionId = candidates[0].id;
        console.log('[fathom-webhook] Matched via time window (single result) → session=%s', sessionId);
      } else if (attendeeNames.length > 0) {
        // Multiple sessions in window — use tutor name fuzzy match
        for (const c of candidates) {
          const tutorName: string = ((c.tutor as any)?.name ?? '').toLowerCase();
          const hit = attendeeNames.some(a =>
            a.toLowerCase().includes(tutorName.split(' ')[0]) ||
            tutorName.includes(a.toLowerCase().split(' ')[0])
          );
          if (hit) {
            sessionId = c.id;
            console.log('[fathom-webhook] Matched via time+tutor fuzzy: tutor=%s → session=%s',
              (c.tutor as any)?.name, sessionId);
            break;
          }
        }
        if (!sessionId) {
          // Fallback: pick closest to meetingStartedAt
          candidates.sort((a, b) =>
            Math.abs(new Date(a.scheduled_at).getTime() - start.getTime()) -
            Math.abs(new Date(b.scheduled_at).getTime() - start.getTime())
          );
          sessionId = candidates[0].id;
          console.log('[fathom-webhook] Matched via time window (closest of %d) → session=%s',
            candidates.length, sessionId);
        }
      }
    }
  }

  if (!sessionId) {
    console.warn('[fathom-webhook] No session matched for shareUrl=%s', shareUrl);
    return NextResponse.json({ error: 'No matching session found' }, { status: 400 });
  }

  // ── 5. Update session ─────────────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from('sessions')
    .update({ fathom_recording_url: shareUrl })
    .eq('id', sessionId);

  if (updateErr) {
    console.error('[fathom-webhook] update error for session=%s: %s', sessionId, updateErr.message);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  console.log('[fathom-webhook] SUCCESS ts=%s session=%s fathom_url=%s', ts, sessionId, shareUrl);
  return NextResponse.json({ ok: true, session_id: sessionId });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getString(obj: Record<string, unknown>, key: string): string | null {
  const val = obj[key];
  return typeof val === 'string' && val ? val : null;
}

function getNestedString(obj: Record<string, unknown>, path: string[]): string | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === 'string' && cur ? cur : null;
}

function extractAttendeeNames(payload: Record<string, unknown>): string[] {
  const names: string[] = [];

  // Try common payload shapes
  const candidates = [
    payload['attendees'],
    payload['participants'],
    (payload['recording'] as any)?.['attendees'],
    (payload['recording'] as any)?.['participants'],
    (payload['call'] as any)?.['attendees'],
    (payload['call'] as any)?.['participants'],
    (payload['meeting'] as any)?.['attendees'],
    (payload['meeting'] as any)?.['participants'],
  ];

  for (const list of candidates) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === 'string') names.push(item);
      else if (typeof item === 'object' && item !== null) {
        const name = (item as any).name ?? (item as any).display_name ?? (item as any).email ?? '';
        if (name) names.push(String(name));
      }
    }
  }

  return names;
}
