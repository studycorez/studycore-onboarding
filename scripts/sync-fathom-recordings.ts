/**
 * Fallback sync: pull recent Fathom meetings and attach any unmatched recordings
 * to sessions that don't already have a fathom_recording_url.
 *
 * Uses the same matching logic as the webhook:
 *   1. recorded_by.email → tutors.email → sessions with that tutor ±3 h
 *   2. calendar_invitees[].email → students.email → sessions for that student ±3 h
 *
 * Read-only on Fathom; writes only fathom_recording_url to sessions.
 *
 * Usage:
 *   # Dry run — print matches but don't write:
 *   npx tsx --env-file=.env.local scripts/sync-fathom-recordings.ts --dry-run
 *
 *   # Live run:
 *   npx tsx --env-file=.env.local scripts/sync-fathom-recordings.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { subHours, addHours, subDays } from 'date-fns';

const DRY_RUN = process.argv.includes('--dry-run');
const DAYS_BACK = 7;
const BASE_URL  = 'https://api.fathom.ai/external/v1';

const FATHOM_API_KEY = process.env.FATHOM_API_KEY;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── Fathom API helpers ────────────────────────────────────────────────────────

async function fetchMeetings(createdAfter: string, cursor?: string): Promise<any[]> {
  const params = new URLSearchParams({ created_after: createdAfter });
  if (cursor) params.set('cursor', cursor);

  const res = await fetch(`${BASE_URL}/meetings?${params}`, {
    headers: { 'X-Api-Key': FATHOM_API_KEY! },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fathom GET /meetings failed (${res.status}): ${body}`);
  }
  const json: any = await res.json();
  // API returns { data: [...], next_cursor?: string }
  const items: any[] = json.data ?? json ?? [];
  const nextCursor: string | undefined = json.next_cursor ?? json.nextCursor;

  if (nextCursor) {
    const more = await fetchMeetings(createdAfter, nextCursor);
    return [...items, ...more];
  }
  return items;
}

// ── Session matching (mirrors webhook logic) ─────────────────────────────────

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

async function matchSession(meeting: any): Promise<{ sessionId: string; method: string } | null> {
  const shareUrl        = str(meeting.share_url) ?? str(meeting.url);
  const createdAt       = str(meeting.created_at) ?? str(meeting.started_at);
  const recordedByEmail = str(meeting.recorded_by?.email);
  const invitees        = extractInviteeEmails(meeting.calendar_invitees);

  if (!shareUrl || !createdAt) return null;

  const meetingTime = new Date(createdAt);
  const windowStart = subHours(meetingTime, 3).toISOString();
  const windowEnd   = addHours(meetingTime, 3).toISOString();

  // Strategy A: tutor email
  if (recordedByEmail) {
    const { data: tutor } = await supabase
      .from('tutors')
      .select('id')
      .ilike('email', recordedByEmail)
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
          Math.abs(new Date(a.scheduled_at).getTime() - meetingTime.getTime()) -
          Math.abs(new Date(b.scheduled_at).getTime() - meetingTime.getTime()),
        );
        return { sessionId: sessions[0].id, method: `tutor-email(${recordedByEmail})` };
      }
    }
  }

  // Strategy B: invitee emails → student
  for (const email of invitees) {
    const { data: student } = await supabase
      .from('students')
      .select('id')
      .ilike('email', email)
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
        Math.abs(new Date(a.scheduled_at).getTime() - meetingTime.getTime()) -
        Math.abs(new Date(b.scheduled_at).getTime() - meetingTime.getTime()),
      );
      return { sessionId: sessions[0].id, method: `invitee-email(${email})` };
    }
  }

  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const HR = '─'.repeat(60);
  console.log(`\n${HR}`);
  console.log('  Fathom Recording Sync');
  console.log(`${HR}`);
  console.log(`  Lookback:  ${DAYS_BACK} days`);
  if (DRY_RUN) console.log('  *** DRY RUN — no DB writes ***');
  console.log(`${HR}\n`);

  if (!FATHOM_API_KEY) {
    console.error('Missing FATHOM_API_KEY in .env.local / Vercel env vars');
    process.exit(1);
  }

  const createdAfter = subDays(new Date(), DAYS_BACK).toISOString();
  console.log(`Fetching meetings after ${createdAfter}…`);

  const meetings = await fetchMeetings(createdAfter);
  console.log(`Fetched ${meetings.length} meeting(s) from Fathom.\n`);

  let matched = 0, alreadyHad = 0, noMatch = 0, errors = 0;

  for (const meeting of meetings) {
    const shareUrl  = str(meeting.share_url) ?? str(meeting.url) ?? '(no url)';
    const title     = str(meeting.title) ?? '(no title)';
    const createdAt = str(meeting.created_at) ?? '?';

    // Check if the matched session already has a URL
    const match = await matchSession(meeting);

    if (!match) {
      console.log(`  ✗ no match   "${title}" at ${createdAt}`);
      noMatch++;
      continue;
    }

    // Check current value on session
    const { data: session } = await supabase
      .from('sessions')
      .select('id, fathom_recording_url')
      .eq('id', match.sessionId)
      .single();

    if (session?.fathom_recording_url) {
      console.log(`  ⏭  already   "${title}" → session ${match.sessionId} (already has URL)`);
      alreadyHad++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [dry] match  "${title}" → session ${match.sessionId} via ${match.method}`);
      matched++;
      continue;
    }

    const { error } = await supabase
      .from('sessions')
      .update({ fathom_recording_url: shareUrl })
      .eq('id', match.sessionId);

    if (error) {
      console.error(`  ✗ error      "${title}" → session ${match.sessionId}: ${error.message}`);
      errors++;
    } else {
      console.log(`  ✅ matched    "${title}" → session ${match.sessionId} via ${match.method}`);
      matched++;
    }
  }

  console.log(`\n${HR}`);
  console.log('  SUMMARY');
  console.log(HR);
  console.log(`  Meetings fetched:   ${meetings.length}`);
  console.log(`  Matched & updated:  ${matched}`);
  console.log(`  Already had URL:    ${alreadyHad}`);
  console.log(`  No match found:     ${noMatch}`);
  if (errors > 0) console.log(`  Errors:             ${errors}`);
  if (DRY_RUN) console.log('\n  *** DRY RUN — no DB writes ***');
  console.log(`${HR}\n`);
}

main().catch(err => {
  console.error('\nFatal error:', err.message ?? err);
  process.exit(1);
});
