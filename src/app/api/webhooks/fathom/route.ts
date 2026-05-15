/**
 * Fathom AI recording webhook
 *
 * Required environment variables (add to Vercel → Settings → Environment Variables):
 *   FATHOM_API_KEY          — Fathom API key (for the sync script; not used by this route)
 *   FATHOM_WEBHOOK_SECRET   — The `secret` returned when you registered the webhook via
 *                             scripts/register-fathom-webhook.ts (starts with whsec_…)
 *
 * Webhook URL to register in Fathom:
 *   https://studycore-eight.vercel.app/api/webhooks/fathom
 *
 * This endpoint:
 * 1. Verifies the HMAC-SHA256 signature from Fathom's svix-style headers
 * 2. Logs the full raw payload
 * 3. Tries to match the recording to a session:
 *    a. Tutor email match: recorded_by.email → tutors.email → sessions with that tutor_id ±3 h
 *    b. Attendee email match: calendar_invitees[].email → students.email → sessions for that student ±3 h
 * 4. Writes share_url to sessions.fathom_recording_url
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';
import { subHours, addHours } from 'date-fns';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export const dynamic = 'force-dynamic';

// ── Signature verification (Fathom uses svix webhook standard) ───────────────
function verifySignature(
  rawBody: string,
  secret: string,
  msgId: string | null,
  msgTimestamp: string | null,
  msgSignature: string | null,
): boolean {
  if (!msgId || !msgTimestamp || !msgSignature) return false;

  // Reject messages older than 5 minutes
  const ts = parseInt(msgTimestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  // secret is prefixed with "whsec_" and base64-encoded
  let keyBytes: Buffer;
  try {
    const base64Part = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    keyBytes = Buffer.from(base64Part, 'base64');
  } catch {
    return false;
  }

  const toSign = `${msgId}.${msgTimestamp}.${rawBody}`;
  const expected = createHmac('sha256', keyBytes).update(toSign).digest('base64');

  // Fathom sends "v1,<base64sig>" — check each signature in the header
  for (const sig of msgSignature.split(' ')) {
    const parts = sig.split(',');
    const b64 = parts[parts.length - 1];
    try {
      if (timingSafeEqual(Buffer.from(expected), Buffer.from(b64))) return true;
    } catch {
      // length mismatch — skip
    }
  }
  return false;
}

export async function POST(req: NextRequest) {
  const ts = new Date().toISOString();
  console.log('[fathom-webhook] received at', ts);

  // ── 1. Read raw body (needed for HMAC verification) ──────────────────────
  const rawBody = await req.text();

  // ── 2. Verify signature ──────────────────────────────────────────────────
  const secret = process.env.FATHOM_WEBHOOK_SECRET;
  if (secret) {
    const msgId        = req.headers.get('webhook-id');
    const msgTimestamp = req.headers.get('webhook-timestamp');
    const msgSignature = req.headers.get('webhook-signature');

    if (!verifySignature(rawBody, secret, msgId, msgTimestamp, msgSignature)) {
      console.warn('[fathom-webhook] 401 — signature verification failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    console.warn('[fathom-webhook] FATHOM_WEBHOOK_SECRET not set — skipping signature check');
  }

  // ── 3. Parse & log raw payload ───────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.error('[fathom webhook] Failed to parse JSON body');
    return NextResponse.json({ ok: false, error: 'Invalid JSON' });
  }

  console.log('[fathom webhook] payload:', JSON.stringify(body, null, 2));

  // ── 4. Extract fields from Fathom's payload ──────────────────────────────
  // Fathom sends events with a `call` object and/or a `data` wrapper.
  const call = body['call'] as Record<string, unknown> | undefined;
  const data: Record<string, unknown> =
    (body['data'] as Record<string, unknown>) ?? body;

  // Recording URL — check all known locations in priority order
  const recordingUrl: string | null =
    str(call?.['recording_url']) ??
    str(body['recording_url']) ??
    str(call?.['video_url']) ??
    str(body['video_url']) ??
    str(call?.['share_url']) ??
    str(body['share_url']) ??
    str(data['share_url']) ??
    str(data['url']) ??
    null;

  // Zoom meeting ID — check all known locations
  const zoomMeetingId: string | null =
    str(call?.['external_id']) ??
    str(call?.['meeting_id']) ??
    str(body['external_id']) ??
    str(data['zoom_meeting_id']) ??
    str(data['meeting_id']) ??
    str(data['meetingId']) ??
    null;

  // Transcript (present on `transcript` event type)
  const transcript: string | null =
    str(body['transcript']) ??
    str(call?.['transcript']) ??
    null;

  const createdAt: string | null =
    str(call?.['created_at']) ??
    str(data['created_at']) ??
    str(data['started_at']) ??
    null;

  const recordedByEmail: string | null =
    str((call?.['recorded_by'] as any)?.email) ??
    str((data['recorded_by'] as any)?.email) ??
    null;

  const invitees: string[] = extractInviteeEmails(
    call?.['calendar_invitees'] ?? data['calendar_invitees'],
  );

  const eventType: string = str(body['type']) ?? str(body['event']) ?? 'unknown';

  console.log(
    '[fathom webhook] type=%s recordingUrl=%s zoomMeetingId=%s transcript=%s createdAt=%s recordedByEmail=%s invitees=[%s]',
    eventType,
    recordingUrl ?? '(none)',
    zoomMeetingId ?? '(none)',
    transcript ? `${transcript.length} chars` : '(none)',
    createdAt ?? '(none)',
    recordedByEmail ?? '(none)',
    invitees.join(', '),
  );

  // If we have neither a recording URL nor a transcript, nothing to store
  if (!recordingUrl && !transcript) {
    console.warn('[fathom webhook] No recording URL or transcript in payload — acknowledging without action');
    return NextResponse.json({ ok: true, action: 'noop' });
  }

  // ── 5. Match session ─────────────────────────────────────────────────────
  const supabase = getServiceClient();
  let sessionId: string | null = null;
  let matchMethod = '';

  const meetingTime = createdAt ? new Date(createdAt) : null;
  const windowStart = meetingTime ? subHours(meetingTime, 3).toISOString() : null;
  const windowEnd   = meetingTime ? addHours(meetingTime, 3).toISOString() : null;

  // Strategy 0: direct zoom_meeting_id match
  if (!sessionId && zoomMeetingId) {
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('zoom_meeting_id', zoomMeetingId)
      .limit(1);

    if (sessions && sessions.length > 0) {
      sessionId = sessions[0].id;
      matchMethod = `zoom-meeting-id(${zoomMeetingId})`;
    }
  }

  // Strategy A: tutor email → tutor_id → sessions ±3 h
  // Show archived tutors here — Fathom webhook links historical recordings to sessions; must resolve archived tutor IDs
  if (!sessionId && recordedByEmail && windowStart && windowEnd) {
    const { data: tutor } = await supabase
      .from('tutors')
      .select('id')
      .ilike('email', recordedByEmail.toLowerCase())
      .maybeSingle();

    if (tutor?.id) {
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, scheduled_at')
        .eq('tutor_id', tutor.id)
        .in('status', ['scheduled', 'completed'])
        .gte('scheduled_at', windowStart)
        .lte('scheduled_at', windowEnd)
        .order('scheduled_at');

      if (sessions && sessions.length > 0) {
        sessions.sort((a, b) =>
          Math.abs(new Date(a.scheduled_at).getTime() - meetingTime!.getTime()) -
          Math.abs(new Date(b.scheduled_at).getTime() - meetingTime!.getTime()),
        );
        sessionId = sessions[0].id;
        matchMethod = `tutor-email(${recordedByEmail})`;
      }
    }
  }

  // Strategy B: calendar_invitee emails → student email → sessions ±3 h
  if (!sessionId && invitees.length > 0 && windowStart && windowEnd) {
    for (const email of invitees) {
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .ilike('email', email.toLowerCase())
        .maybeSingle();

      if (!student?.id) continue;

      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, scheduled_at')
        .eq('student_id', student.id)
        .in('status', ['scheduled', 'completed'])
        .gte('scheduled_at', windowStart)
        .lte('scheduled_at', windowEnd)
        .order('scheduled_at');

      if (sessions && sessions.length > 0) {
        sessions.sort((a, b) =>
          Math.abs(new Date(a.scheduled_at).getTime() - meetingTime!.getTime()) -
          Math.abs(new Date(b.scheduled_at).getTime() - meetingTime!.getTime()),
        );
        sessionId = sessions[0].id;
        matchMethod = `invitee-email(${email})`;
        break;
      }
    }
  }

  if (!sessionId) {
    console.warn('[fathom webhook] No session matched — acknowledging without update');
    return NextResponse.json({ ok: true, action: 'unmatched' });
  }

  // ── 6. Update session ────────────────────────────────────────────────────
  const updates: Record<string, unknown> = {};
  if (recordingUrl) updates['fathom_recording_url'] = recordingUrl;
  if (transcript)   updates['fathom_transcript']    = transcript;

  const { error: updateErr } = await supabase
    .from('sessions')
    .update(updates)
    .eq('id', sessionId);

  if (updateErr) {
    console.error('[fathom webhook] update error session=%s: %s', sessionId, updateErr.message);
    // Still return 200 so Fathom does not retry
    return NextResponse.json({ ok: false, error: updateErr.message });
  }

  console.log('[fathom webhook] SUCCESS ts=%s type=%s method=%s session=%s url=%s transcript=%s',
    ts, eventType, matchMethod, sessionId, recordingUrl ?? '(none)', transcript ? 'yes' : 'no');
  return NextResponse.json({ ok: true, session_id: sessionId, match_method: matchMethod });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
