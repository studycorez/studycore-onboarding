import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { subDays, subHours, addHours } from 'date-fns';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ── Known tutor email aliases not present in the tutors table ────────────────
// Maps alias email → tutor name to look up at sync start
const EMAIL_ALIASES: Record<string, string> = {
  'jrv67@cornell.edu': 'Joseph Valenti',
};

// Titles containing any of these strings (case-insensitive) are internal
// calls, not student sessions — skip them entirely.
const INTERNAL_TITLE_KEYWORDS = [
  'team meeting',
  'onboarding call',
  'training',
  'interview',
  'accepted:',
];

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function extractEmails(raw: unknown): string[] {
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

function extractNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const n = str((item as any).name) ?? str((item as any).display_name);
      if (n) names.push(n.toLowerCase());
    } else if (typeof item === 'string' && !item.includes('@')) {
      names.push(item.toLowerCase());
    }
  }
  return names;
}

function extractDurationMinutes(call: any): number | null {
  if (typeof call.duration_minutes === 'number' && call.duration_minutes > 0) return call.duration_minutes;
  if (typeof call.duration === 'number' && call.duration > 0) return Math.round(call.duration / 60);
  if (typeof call.duration_seconds === 'number' && call.duration_seconds > 0) return Math.round(call.duration_seconds / 60);
  if (typeof call.length === 'number' && call.length > 0) return Math.round(call.length / 60);
  return null;
}

function nameFuzzyMatch(tutorName: string, candidates: string[]): boolean {
  const lower = tutorName.toLowerCase().trim();
  if (!lower) return false;
  const tokens = lower.split(/\s+/).filter(t => t.length > 2);
  for (const c of candidates) {
    if (c.includes(lower) || lower.includes(c)) return true;
    for (const token of tokens) {
      if (c.includes(token)) return true;
    }
  }
  return false;
}

function isInternalCall(title: string | null): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return INTERNAL_TITLE_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Fathom API fetch (all pages) ──────────────────────────────────────────────

async function fetchFathomCalls(apiKey: string, createdAfter: string): Promise<any[]> {
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
        const params = new URLSearchParams({ created_after: createdAfter, limit: '100' });
        if (cursor) params.set('cursor', cursor);

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (endpoint.header === 'Authorization') {
          headers['Authorization'] = `Bearer ${apiKey}`;
        } else {
          headers[endpoint.header] = apiKey;
        }

        const res = await fetch(`${endpoint.url}?${params}`, { headers });

        if (!res.ok) {
          const body = await res.text();
          if (page === 1) console.warn(`[fathom-sync] ${endpoint.url} → ${res.status}: ${body.slice(0, 200)}`);
          break;
        }

        const json: any = await res.json();

        if (!firstItemLogged) {
          const preview =
            Array.isArray(json)           ? json[0] :
            Array.isArray(json?.data)     ? json.data[0] :
            Array.isArray(json?.calls)    ? json.calls[0] :
            Array.isArray(json?.meetings) ? json.meetings[0] :
            Array.isArray(json?.results)  ? json.results[0] :
            Array.isArray(json?.items)    ? json.items[0] : json;
          console.log('[fathom-sync] raw first call object:', JSON.stringify(preview, null, 2));
          firstItemLogged = true;
        }

        const items: any[] =
          Array.isArray(json)           ? json :
          Array.isArray(json?.data)     ? json.data :
          Array.isArray(json?.calls)    ? json.calls :
          Array.isArray(json?.meetings) ? json.meetings :
          Array.isArray(json?.results)  ? json.results :
          Array.isArray(json?.items)    ? json.items : [];

        allItems.push(...items);
        console.log(`[fathom-sync] page ${page}: ${items.length} calls (total: ${allItems.length})`);

        const nextCursor = json?.next_cursor ?? json?.nextCursor ?? json?.cursor ?? json?.next ?? undefined;
        if (!nextCursor || items.length === 0) break;
        cursor = nextCursor;
      }

      if (allItems.length > 0) break;
    } catch (err: any) {
      console.warn(`[fathom-sync] error hitting ${endpoint.url}:`, err.message);
    }
  }

  return allItems;
}

// ── Core sync ─────────────────────────────────────────────────────────────────

async function runSync(force: boolean) {
  const apiKey = process.env.FATHOM_API_KEY;
  if (!apiKey) {
    console.error('[fathom-sync] FATHOM_API_KEY is not set');
    return NextResponse.json({ ok: false, error: 'FATHOM_API_KEY is not set' }, { status: 500 });
  }

  const supabase = getSupabase();

  // ── Resolve email aliases to tutor IDs once at startup ───────────────────
  const aliasToTutorId: Record<string, string> = {};
  for (const [aliasEmail, tutorName] of Object.entries(EMAIL_ALIASES)) {
    const { data } = await supabase
      .from('tutors')
      .select('id')
      .ilike('name', tutorName)
      .maybeSingle();
    if (data?.id) {
      aliasToTutorId[aliasEmail] = data.id;
      console.log(`[fathom-sync] alias ${aliasEmail} → tutor ${data.id} (${tutorName})`);
    } else {
      console.warn(`[fathom-sync] alias ${aliasEmail} → no tutor found for "${tutorName}"`);
    }
  }

  const createdAfter = subDays(new Date(), 90).toISOString();
  console.log(`[fathom-sync] fetching calls after ${createdAfter} (force=${force})`);

  let calls: any[];
  try {
    calls = await fetchFathomCalls(apiKey, createdAfter);
  } catch (err: any) {
    console.error('[fathom-sync] fatal fetch error:', err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
  console.log(`[fathom-sync] total calls fetched: ${calls.length}`);

  let matched = 0, alreadyHadUrl = 0, noMatch = 0, skippedInternal = 0;
  const byStrategy: Record<string, number> = {
    s1_zoom_id: 0,
    s2_host_email: 0,
    s3_participant_tutor_email: 0,
    s4_participant_student_email: 0,
    s5_name_fuzzy: 0,
    s6_duration: 0,
    s7_same_day: 0,
  };

  for (const call of calls) {
    // ── Extract fields ────────────────────────────────────────────────────
    const recordingUrl: string | null =
      str(call.recording_url) ?? str(call.video_url) ?? str(call.share_url) ?? str(call.url) ?? null;
    const transcript: string | null =
      str(call.transcript) ?? str(call.summary) ?? null;

    if (!recordingUrl) { noMatch++; continue; }

    const recordingTitle: string | null =
      str(call.title) ?? str(call.name) ?? str(call.meeting_name) ?? null;

    // ── Skip internal/non-session recordings ─────────────────────────────
    if (isInternalCall(recordingTitle)) {
      skippedInternal++;
      console.log(`[fathom-sync] SKIPPED internal call: "${recordingTitle}"`);
      continue;
    }

    const startedAt: string | null =
      str(call.started_at) ?? str(call.created_at) ?? str(call.start_time) ?? null;

    const zoomMeetingId: string | null =
      str(call.zoom_meeting_id) ?? str(call.external_id) ?? str(call.meeting_id) ??
      str(call.integration_data?.zoom?.meeting_id) ?? null;

    const recordedByEmail: string | null =
      str(call.recorded_by?.email) ?? str(call.host_email) ?? null;

    const recordedByName: string | null =
      str(call.recorded_by?.name) ?? str(call.host_name) ?? null;

    const durationMin: number | null = extractDurationMinutes(call);

    const allParticipantRaw = [
      ...(Array.isArray(call.calendar_invitees) ? call.calendar_invitees : []),
      ...(Array.isArray(call.attendees)          ? call.attendees          : []),
      ...(Array.isArray(call.participants)        ? call.participants        : []),
    ];
    const participantEmails = extractEmails(allParticipantRaw);
    if (recordedByEmail) participantEmails.push(recordedByEmail);
    // Deduplicate
    const uniqueParticipantEmails = [...new Set(participantEmails)];

    const participantNames = extractNames(allParticipantRaw);
    if (recordedByName) participantNames.push(recordedByName.toLowerCase());
    if (recordingTitle) participantNames.push(recordingTitle.toLowerCase());

    const meetingTime = startedAt ? new Date(startedAt) : null;

    let sessionId: string | null = null;
    let matchMethod = '';
    const failReasons: string[] = [];

    // Helper: look up tutor ID by email (checks alias map first, then DB)
    async function emailToTutorId(email: string): Promise<string | null> {
      if (aliasToTutorId[email]) return aliasToTutorId[email];
      const { data } = await supabase.from('tutors').select('id').ilike('email', email).maybeSingle();
      return data?.id ?? null;
    }

    // ── S1: Exact zoom_meeting_id ─────────────────────────────────────────
    if (!sessionId && zoomMeetingId) {
      const { data: rows } = await supabase
        .from('sessions')
        .select('id, fathom_recording_url')
        .eq('zoom_meeting_id', zoomMeetingId)
        .limit(1);

      if (rows?.length) {
        if (!force && rows[0].fathom_recording_url) {
          alreadyHadUrl++;
          continue;
        }
        sessionId = rows[0].id;
        matchMethod = 's1_zoom_id';
      } else {
        failReasons.push(`s1: zoom_meeting_id ${zoomMeetingId} not in sessions`);
      }
    } else if (!zoomMeetingId) {
      failReasons.push('s1: no zoom_meeting_id on recording');
    }

    // ── S2: Host email = tutor email, ±4 h ───────────────────────────────
    if (!sessionId && recordedByEmail && meetingTime) {
      const windowStart = subHours(meetingTime, 4).toISOString();
      const windowEnd   = addHours(meetingTime, 4).toISOString();
      const tutorId = await emailToTutorId(recordedByEmail);

      if (!tutorId) {
        failReasons.push(`s2: host email ${recordedByEmail} not in tutors (not an alias either)`);
      } else {
        let q = supabase
          .from('sessions')
          .select('id, scheduled_at, fathom_recording_url')
          .eq('tutor_id', tutorId)
          .in('status', ['scheduled', 'completed'])
          .gte('scheduled_at', windowStart)
          .lte('scheduled_at', windowEnd)
          .order('scheduled_at');
        if (!force) q = q.is('fathom_recording_url', null);

        const { data: rows } = await q;
        if (rows?.length) {
          rows.sort((a, b) =>
            Math.abs(new Date(a.scheduled_at).getTime() - meetingTime.getTime()) -
            Math.abs(new Date(b.scheduled_at).getTime() - meetingTime.getTime()),
          );
          sessionId = rows[0].id;
          matchMethod = 's2_host_email';
        } else {
          failReasons.push(`s2: tutor ${recordedByEmail} found but no session in ±4h window`);
        }
      }
    } else if (!recordedByEmail) {
      failReasons.push('s2: no host email on recording');
    }

    // ── S3: Participant email = tutor email, ±4 h ─────────────────────────
    if (!sessionId && uniqueParticipantEmails.length > 0 && meetingTime) {
      const windowStart = subHours(meetingTime, 4).toISOString();
      const windowEnd   = addHours(meetingTime, 4).toISOString();
      let s3Found = false;

      for (const email of uniqueParticipantEmails) {
        if (email === recordedByEmail) continue; // already tried in S2
        const tutorId = await emailToTutorId(email);
        if (!tutorId) continue;

        let q = supabase
          .from('sessions')
          .select('id, scheduled_at, fathom_recording_url')
          .eq('tutor_id', tutorId)
          .in('status', ['scheduled', 'completed'])
          .gte('scheduled_at', windowStart)
          .lte('scheduled_at', windowEnd)
          .order('scheduled_at');
        if (!force) q = q.is('fathom_recording_url', null);

        const { data: rows } = await q;
        if (rows?.length) {
          rows.sort((a, b) =>
            Math.abs(new Date(a.scheduled_at).getTime() - meetingTime.getTime()) -
            Math.abs(new Date(b.scheduled_at).getTime() - meetingTime.getTime()),
          );
          sessionId = rows[0].id;
          matchMethod = `s3_participant_tutor_email(${email})`;
          s3Found = true;
          break;
        }
      }
      if (!s3Found) failReasons.push('s3: no participant email matched a tutor with session in ±4h');
    }

    // ── S4: Participant email = student email, ±4 h ───────────────────────
    if (!sessionId && uniqueParticipantEmails.length > 0 && meetingTime) {
      const windowStart = subHours(meetingTime, 4).toISOString();
      const windowEnd   = addHours(meetingTime, 4).toISOString();
      let s4Found = false;

      for (const email of uniqueParticipantEmails) {
        const { data: student } = await supabase
          .from('students')
          .select('id')
          .ilike('email', email)
          .maybeSingle();
        if (!student?.id) continue;

        let q = supabase
          .from('sessions')
          .select('id, scheduled_at, fathom_recording_url')
          .eq('student_id', student.id)
          .in('status', ['scheduled', 'completed'])
          .gte('scheduled_at', windowStart)
          .lte('scheduled_at', windowEnd)
          .order('scheduled_at');
        if (!force) q = q.is('fathom_recording_url', null);

        const { data: rows } = await q;
        if (rows?.length) {
          rows.sort((a, b) =>
            Math.abs(new Date(a.scheduled_at).getTime() - meetingTime.getTime()) -
            Math.abs(new Date(b.scheduled_at).getTime() - meetingTime.getTime()),
          );
          sessionId = rows[0].id;
          matchMethod = `s4_participant_student_email(${email})`;
          s4Found = true;
          break;
        }
      }
      if (!s4Found) failReasons.push('s4: no participant email matched a student with session in ±4h');
    }

    // ── S5: Tutor name fuzzy match, ±4 h ─────────────────────────────────
    if (!sessionId && participantNames.length > 0 && meetingTime) {
      const windowStart = subHours(meetingTime, 4).toISOString();
      const windowEnd   = addHours(meetingTime, 4).toISOString();

      let q = supabase
        .from('sessions')
        .select('id, scheduled_at, fathom_recording_url, tutor:tutors(id, name)')
        .in('status', ['scheduled', 'completed'])
        .gte('scheduled_at', windowStart)
        .lte('scheduled_at', windowEnd);
      if (!force) q = q.is('fathom_recording_url', null);

      const { data: candidateSessions } = await q;

      if (candidateSessions?.length) {
        const fuzzyMatch = candidateSessions.find(s => {
          const tutorName = str((s.tutor as any)?.name);
          return tutorName ? nameFuzzyMatch(tutorName, participantNames) : false;
        });
        if (fuzzyMatch) {
          sessionId = fuzzyMatch.id;
          const tName = str((fuzzyMatch.tutor as any)?.name) ?? 'unknown';
          matchMethod = `s5_name_fuzzy(${tName})`;
        } else {
          failReasons.push(`s5: ${candidateSessions.length} sessions in ±4h window but none matched participant names [${participantNames.slice(0, 3).join(', ')}]`);
        }
      } else {
        failReasons.push('s5: no sessions at all in ±4h window');
      }
    }

    // ── S6: Duration within ±15 min + time within ±2 h ───────────────────
    if (!sessionId && durationMin !== null && meetingTime) {
      const windowStart = subHours(meetingTime, 2).toISOString();
      const windowEnd   = addHours(meetingTime, 2).toISOString();

      let q = supabase
        .from('sessions')
        .select('id, scheduled_at, duration_minutes, fathom_recording_url')
        .in('status', ['scheduled', 'completed'])
        .gte('scheduled_at', windowStart)
        .lte('scheduled_at', windowEnd)
        .gte('duration_minutes', durationMin - 15)
        .lte('duration_minutes', durationMin + 15);
      if (!force) q = q.is('fathom_recording_url', null);

      const { data: rows } = await q;
      if (rows?.length) {
        rows.sort((a, b) =>
          Math.abs(new Date(a.scheduled_at).getTime() - meetingTime.getTime()) -
          Math.abs(new Date(b.scheduled_at).getTime() - meetingTime.getTime()),
        );
        sessionId = rows[0].id;
        matchMethod = `s6_duration(${durationMin}min)`;
      } else {
        failReasons.push(`s6: no session with duration ≈${durationMin}min in ±2h window`);
      }
    }

    // ── S7: Participant email = tutor email, same UTC calendar day ─────────
    // Lowest confidence — no time restriction, just same day.
    if (!sessionId && uniqueParticipantEmails.length > 0 && meetingTime) {
      const dayStart = new Date(meetingTime);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(meetingTime);
      dayEnd.setUTCHours(23, 59, 59, 999);
      let s7Found = false;

      for (const email of uniqueParticipantEmails) {
        const tutorId = await emailToTutorId(email);
        if (!tutorId) continue;

        let q = supabase
          .from('sessions')
          .select('id, scheduled_at, fathom_recording_url')
          .eq('tutor_id', tutorId)
          .in('status', ['scheduled', 'completed'])
          .gte('scheduled_at', dayStart.toISOString())
          .lte('scheduled_at', dayEnd.toISOString())
          .order('scheduled_at');
        if (!force) q = q.is('fathom_recording_url', null);

        const { data: rows } = await q;
        if (rows?.length) {
          rows.sort((a, b) =>
            Math.abs(new Date(a.scheduled_at).getTime() - meetingTime.getTime()) -
            Math.abs(new Date(b.scheduled_at).getTime() - meetingTime.getTime()),
          );
          sessionId = rows[0].id;
          matchMethod = `s7_same_day(${email})`;
          s7Found = true;
          break;
        }
      }
      if (!s7Found) failReasons.push('s7: no participant matched a tutor with session on same UTC day');
    }

    // ── No match ──────────────────────────────────────────────────────────
    if (!sessionId) {
      noMatch++;
      console.log(
        `[fathom-sync] NO MATCH call_id=${call.id ?? '?'} ` +
        `title="${recordingTitle ?? ''}" ` +
        `host=${recordedByEmail ?? '?'} ` +
        `participants=[${uniqueParticipantEmails.slice(0, 5).join(', ')}] ` +
        `startedAt=${startedAt ?? '?'} ` +
        `durationMin=${durationMin ?? '?'} ` +
        `zoomId=${zoomMeetingId ?? '?'} ` +
        `reasons=[${failReasons.join(' | ')}]`,
      );
      continue;
    }

    // ── Update session ────────────────────────────────────────────────────
    const updates: Record<string, unknown> = { fathom_recording_url: recordingUrl };
    if (transcript) updates.fathom_transcript = transcript;

    const { error } = await supabase.from('sessions').update(updates).eq('id', sessionId);

    if (error) {
      console.error(`[fathom-sync] update error session=${sessionId}: ${error.message}`);
      noMatch++;
    } else {
      matched++;
      const stratKey = matchMethod.split('(')[0] as keyof typeof byStrategy;
      if (stratKey in byStrategy) byStrategy[stratKey]++;
      console.log(`[fathom-sync] MATCHED session=${sessionId} method=${matchMethod} url=${recordingUrl}`);
    }
  }

  console.log(
    `[fathom-sync] done — fetched=${calls.length} matched=${matched} ` +
    `alreadyHadUrl=${alreadyHadUrl} noMatch=${noMatch} skippedInternal=${skippedInternal} ` +
    `force=${force} byStrategy=${JSON.stringify(byStrategy)}`,
  );
  return NextResponse.json({
    ok: true,
    callsFetched: calls.length,
    skippedInternal,
    matched,
    alreadyHadUrl,
    noMatch,
    force,
    byStrategy,
  });
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function GET() {
  return runSync(false);
}

export async function POST(req: NextRequest) {
  let force = false;
  try {
    const body = await req.json();
    force = !!body.force;
  } catch { /* no body — default force=false */ }
  return runSync(force);
}
