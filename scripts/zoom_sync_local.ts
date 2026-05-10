import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getZoomToken(): Promise<string> {
  const creds = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    { method: 'POST', headers: { Authorization: `Basic ${creds}` } }
  );
  if (!res.ok) throw new Error(`Zoom token error: ${await res.text()}`);
  return ((await res.json()) as any).access_token as string;
}

async function getZoomUserId(token: string): Promise<string> {
  const res = await fetch('https://api.zoom.us/v2/users/me', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Could not fetch Zoom user: ${await res.text()}`);
  return ((await res.json()) as any).id as string;
}

function normName(s: string): string {
  return s.replace(/[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
}

function extractStudentName(topic: string): string {
  let t = topic.replace(/[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g,"'").trim();
  t = t.replace(/'s\b.*/i,'').trim();
  t = t.replace(/\s*(&|–|-)\s.*/i,'').trim();
  t = t.replace(/\bwith\b.*/i,'').trim();
  t = t.replace(/\b(sat|prep|session|tutoring|class|review|practice|test|math|reading|writing)\b.*/i,'').trim();
  return t;
}

interface Student { id: string; name: string; email: string }

function matchStudentByName(extracted: string, students: Student[]): Student | null {
  const n = normName(extracted);
  if (!n) return null;
  const exact = students.find(s => normName(s.name) === n);
  if (exact) return exact;
  const contains = students.find(s => {
    const sn = normName(s.name);
    return sn.split(' ').includes(n) || n.includes(sn);
  });
  if (contains) return contains;
  const parts = n.split(' ');
  const first = parts[0];
  const partialLast = parts.slice(1).join(' ');
  if (partialLast) {
    const pm = students.find(s => {
      const sp = normName(s.name).split(' ');
      return sp[0] === first && sp.slice(1).join(' ').startsWith(partialLast);
    });
    if (pm) return pm;
  }
  const firstOnly = students.filter(s => normName(s.name).split(' ')[0] === first);
  if (firstOnly.length === 1) return firstOnly[0];
  return null;
}

async function fetchParticipantEmails(token: string, meetingId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.zoom.us/v2/report/meetings/${meetingId}/participants?page_size=100`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return [];
    const data = await res.json() as any;
    return (data.participants ?? []).map((p: any) => (p.user_email ?? p.email ?? '').toLowerCase().trim()).filter(Boolean);
  } catch { return []; }
}

async function main() {
  const token = await getZoomToken();
  const userId = await getZoomUserId(token);
  console.log(`Zoom user ID: ${userId}`);

  // Fetch meetings from past 6 months
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const slices: { from: string; to: string }[] = [];
  const cursor = new Date(sixMonthsAgo);
  while (cursor < now) {
    const from = cursor.toISOString().slice(0,10);
    cursor.setMonth(cursor.getMonth() + 1);
    const to = (cursor < now ? cursor : now).toISOString().slice(0,10);
    slices.push({ from, to });
  }

  const meetings: any[] = [];
  for (const { from, to } of slices) {
    let nextPageToken = '';
    do {
      const url = new URL(`https://api.zoom.us/v2/report/users/${userId}/meetings`);
      url.searchParams.set('from', from);
      url.searchParams.set('to', to);
      url.searchParams.set('page_size', '300');
      if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { console.error(`API error ${res.status} for ${from}→${to}`); break; }
      const data = await res.json() as any;
      meetings.push(...(data.meetings ?? []));
      nextPageToken = data.next_page_token ?? '';
    } while (nextPageToken);
  }

  console.log(`\nFetched ${meetings.length} Zoom meetings from past 6 months`);

  const { data: students } = await supabase.from('students').select('id, name, email');
  const studentList: Student[] = students ?? [];

  let matchedById = 0, matchedByName = 0, matchedByEmail = 0;
  const unmatched: { topic: string; startTime: string; duration: number }[] = [];

  for (const meeting of meetings) {
    const meetingId = String(meeting.id);
    const topic: string = meeting.topic ?? '';
    const startTime: string = meeting.start_time ?? '';
    const duration: number = meeting.duration ?? 0;

    // 1. Match by zoom_meeting_id
    const { data: byId } = await supabase.from('sessions').select('id, status').eq('zoom_meeting_id', meetingId).maybeSingle();
    if (byId) {
      const updates: Record<string, unknown> = {};
      if (duration) updates.duration_minutes = duration;
      if (byId.status !== 'completed') updates.status = 'completed';
      if (Object.keys(updates).length > 0) await supabase.from('sessions').update(updates).eq('id', byId.id);
      matchedById++;
      continue;
    }

    // 2. Match by name
    const extracted = extractStudentName(topic);
    const nameMatch = extracted ? matchStudentByName(extracted, studentList) : null;
    if (nameMatch && startTime) {
      const { data: candidates } = await supabase.from('sessions').select('id, scheduled_at, status').eq('student_id', nameMatch.id).is('zoom_meeting_id', null);
      if (candidates && candidates.length > 0) {
        const meetingMs = new Date(startTime).getTime();
        const closest = candidates.reduce((b, s) => Math.abs(new Date(s.scheduled_at).getTime() - meetingMs) < Math.abs(new Date(b.scheduled_at).getTime() - meetingMs) ? s : b);
        if (Math.abs(new Date(closest.scheduled_at).getTime() - meetingMs) / 3600000 <= 4) {
          await supabase.from('sessions').update({ zoom_meeting_id: meetingId, status: 'completed', ...(duration ? { duration_minutes: duration } : {}) }).eq('id', closest.id);
          matchedByName++;
          continue;
        }
      }
    }

    // 3. Match by email
    const emails = await fetchParticipantEmails(token, meetingId);
    const emailMatch = emails.length > 0 ? studentList.find(s => emails.includes(s.email.toLowerCase())) ?? null : null;
    if (emailMatch && startTime) {
      const { data: candidates } = await supabase.from('sessions').select('id, scheduled_at, status').eq('student_id', emailMatch.id).is('zoom_meeting_id', null);
      if (candidates && candidates.length > 0) {
        const meetingMs = new Date(startTime).getTime();
        const closest = candidates.reduce((b, s) => Math.abs(new Date(s.scheduled_at).getTime() - meetingMs) < Math.abs(new Date(b.scheduled_at).getTime() - meetingMs) ? s : b);
        if (Math.abs(new Date(closest.scheduled_at).getTime() - meetingMs) / 3600000 <= 4) {
          await supabase.from('sessions').update({ zoom_meeting_id: meetingId, status: 'completed', ...(duration ? { duration_minutes: duration } : {}) }).eq('id', closest.id);
          matchedByEmail++;
          continue;
        }
      }
    }

    unmatched.push({ topic: topic || '(no topic)', startTime, duration });
  }

  console.log('\n=== ZOOM SYNC RESULTS ===');
  console.log(`Meetings found (last 6 months): ${meetings.length}`);
  console.log(`Matched by zoom_meeting_id:     ${matchedById}  (already linked, updated status/duration)`);
  console.log(`Newly linked by student name:   ${matchedByName}`);
  console.log(`Newly linked by email:          ${matchedByEmail}`);
  console.log(`Total newly synced:             ${matchedByName + matchedByEmail}`);
  console.log(`Unmatched:                      ${unmatched.length}`);

  if (unmatched.length > 0) {
    console.log('\nUnmatched Zoom meetings (no corresponding session row):');
    for (const u of unmatched.slice(0, 20)) {
      console.log(`  [${u.startTime.slice(0,10)}] "${u.topic}" (${u.duration}min)`);
    }
    if (unmatched.length > 20) console.log(`  ... and ${unmatched.length - 20} more`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
