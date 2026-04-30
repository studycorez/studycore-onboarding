/**
 * Executes Conflict A, B resolutions and then bulk Zoom creation (Issue 1).
 *
 * Conflict A — Minju Kim / Susannah Rockers:
 *   - Cancel 2 conflicting sessions
 *   - Create 4 new sessions + Zoom meetings
 *
 * Conflict B — Mazin Sihweil / Adhya & Isha Ganatra:
 *   - Cancel 2 conflicting sessions
 *   - Set both students status = 'refunded'
 *
 * Conflict C — Parth Patel / Javet Wongkaren:
 *   - No action
 *
 * Issue 1 — Bulk Zoom creation:
 *   - All remaining scheduled sessions with null zoom_meeting_id
 *   - Batches of 10
 *
 * Usage: npx ts-node --project tsconfig.json scripts/fix-conflicts-and-zoom.ts
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── Zoom helpers (inline, same logic as src/lib/zoom.ts) ─────────────────────

interface ZoomMeeting {
  id: number;
  join_url: string;
  start_url: string;
}

async function getZoomToken(): Promise<string> {
  const creds = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    { method: 'POST', headers: { Authorization: `Basic ${creds}` } },
  );
  if (!res.ok) throw new Error(`Zoom token error: ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

async function createZoomMeeting(params: {
  topic: string;
  startTime: string;
  durationMinutes: number;
  zoomUserId?: string;
}): Promise<ZoomMeeting | null> {
  if (!process.env.ZOOM_CLIENT_ID || !process.env.ZOOM_CLIENT_SECRET || !process.env.ZOOM_ACCOUNT_ID) {
    console.warn('  ⚠  Zoom credentials not configured — skipping');
    return null;
  }
  try {
    const token = await getZoomToken();
    const userId = params.zoomUserId ?? 'me';
    const res = await fetch(`https://api.zoom.us/v2/users/${userId}/meetings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: params.topic,
        type: 2,
        start_time: params.startTime,
        duration: params.durationMinutes,
        settings: { host_video: true, participant_video: true, waiting_room: true, join_before_host: false },
      }),
    });
    if (!res.ok) throw new Error(`Zoom meeting error: ${await res.text()}`);
    return res.json();
  } catch (err) {
    console.error('  ✕  createZoomMeeting failed:', err);
    return null;
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

const LINE  = '═'.repeat(70);
const line  = '─'.repeat(70);

async function main() {

  // ══════════════════════════════════════════════════════════════════════════
  // CONFLICT A — Minju Kim / Susannah Rockers
  // ══════════════════════════════════════════════════════════════════════════
  console.log(`\n${LINE}`);
  console.log('  CONFLICT A — MINJU KIM / SUSANNAH ROCKERS');
  console.log(LINE);

  // 1. Cancel the two conflicting sessions
  const conflictA_ids = [
    '1e5f822f-2a75-4c39-93eb-27871a13f207',
    '2386ba89-1d50-4fa8-8f86-fb50c6e7aea2',
  ];
  for (const id of conflictA_ids) {
    const { error } = await supabase.from('sessions').update({ status: 'cancelled' }).eq('id', id);
    if (error) console.log(`  ✕  Failed to cancel ${id.slice(0,8)}: ${error.message}`);
    else       console.log(`  ✓  Cancelled session ${id.slice(0,8)}`);
  }

  // 2. Look up Susannah Rockers' student_id
  const { data: susannah } = await supabase
    .from('students')
    .select('id, name')
    .ilike('name', '%Susannah Rockers%')
    .single();

  if (!susannah) {
    console.log('  ✕  Could not find Susannah Rockers — aborting Conflict A new sessions');
  } else {
    console.log(`  Found student: ${susannah.name} (${susannah.id.slice(0,8)})`);

    // 3. Look up Minju Kim's tutor_id and zoom_user_id
    const { data: minju } = await supabase
      .from('tutors')
      .select('id, name, zoom_user_id')
      .ilike('name', '%Minju Kim%')
      .single();

    if (!minju) {
      console.log('  ✕  Could not find Minju Kim — aborting new sessions');
    } else {
      console.log(`  Found tutor:   ${minju.name} (${minju.id.slice(0,8)}) zoom_user_id=${minju.zoom_user_id ?? '—'}`);

      // 4. Create 4 new sessions (all EDT = UTC−4)
      const newSessions = [
        { label: 'Apr 30 8:50 AM EDT',  utc: '2026-04-30T12:50:00Z', mins: 60 },
        { label: 'May 12 5:00 PM EDT',  utc: '2026-05-12T21:00:00Z', mins: 60 },
        { label: 'May 30 1:00 PM EDT',  utc: '2026-05-30T17:00:00Z', mins: 60 },
        { label: 'Jun  2 6:30 PM EDT',  utc: '2026-06-02T22:30:00Z', mins: 60 },
      ];

      console.log(`\n  Creating 4 new sessions for Susannah Rockers / Minju Kim...`);
      for (const ns of newSessions) {
        // Create Zoom meeting first
        const zoom = await createZoomMeeting({
          topic: `StudyCore: Susannah Rockers & Minju Kim`,
          startTime: ns.utc,
          durationMinutes: ns.mins,
          zoomUserId: minju.zoom_user_id ?? undefined,
        });

        const { data: inserted, error: insErr } = await supabase
          .from('sessions')
          .insert({
            student_id:       susannah.id,
            tutor_id:         minju.id,
            scheduled_at:     ns.utc,
            duration_minutes: ns.mins,
            status:           'scheduled',
            zoom_meeting_id:  zoom ? String(zoom.id)       : null,
            zoom_join_url:    zoom ? zoom.join_url          : null,
            zoom_host_url:    zoom ? zoom.start_url         : null,
          })
          .select('id')
          .single();

        if (insErr) {
          console.log(`  ✕  ${ns.label}: insert failed — ${insErr.message}`);
        } else {
          const zoomStatus = zoom ? `Zoom ${zoom.id}` : 'no Zoom';
          console.log(`  ✓  ${ns.label}  →  session ${inserted!.id.slice(0,8)}  (${zoomStatus})`);
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONFLICT B — Mazin Sihweil / Adhya & Isha Ganatra
  // ══════════════════════════════════════════════════════════════════════════
  console.log(`\n${LINE}`);
  console.log('  CONFLICT B — MAZIN SIHWEIL / ADHYA & ISHA GANATRA');
  console.log(LINE);

  // 1. Cancel the two conflicting sessions
  const conflictB_ids = [
    '14f08d98-7e35-4fcc-9c0a-b42d672af016',
    '4531e266-918c-4c78-96cc-1e27044de519',
  ];
  for (const id of conflictB_ids) {
    const { error } = await supabase.from('sessions').update({ status: 'cancelled' }).eq('id', id);
    if (error) console.log(`  ✕  Failed to cancel ${id.slice(0,8)}: ${error.message}`);
    else       console.log(`  ✓  Cancelled session ${id.slice(0,8)}`);
  }

  // 2. Set Adhya Ganatra and Isha Ganatra status = 'refunded'
  const refundStudents = ['Adhya Ganatra', 'Isha Ganatra'];
  for (const name of refundStudents) {
    const { data: student } = await supabase
      .from('students')
      .select('id, name, status')
      .ilike('name', `%${name.split(' ')[0]}%${name.split(' ')[1] ? ' ' + name.split(' ')[1] : ''}%`)
      .single();

    if (!student) {
      // Try broader search
      const { data: students } = await supabase
        .from('students')
        .select('id, name, status')
        .ilike('name', `%${name.split(' ')[0]}%`);

      const match = (students ?? []).find(s => s.name.toLowerCase().includes(name.split(' ')[1]?.toLowerCase() ?? ''));
      if (!match) {
        console.log(`  ✕  Could not find student: ${name}`);
        continue;
      }

      const { error } = await supabase.from('students').update({ status: 'refunded' }).eq('id', match.id);
      if (error) console.log(`  ✕  Failed to refund ${match.name}: ${error.message}`);
      else       console.log(`  ✓  Set ${match.name} (${match.id.slice(0,8)}) status → refunded`);
    } else {
      const { error } = await supabase.from('students').update({ status: 'refunded' }).eq('id', student.id);
      if (error) console.log(`  ✕  Failed to refund ${student.name}: ${error.message}`);
      else       console.log(`  ✓  Set ${student.name} (${student.id.slice(0,8)}) status → refunded  (was: ${student.status})`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONFLICT C — Parth Patel / Javet Wongkaren — NO ACTION
  // ══════════════════════════════════════════════════════════════════════════
  console.log(`\n${LINE}`);
  console.log('  CONFLICT C — PARTH PATEL / JAVET WONGKAREN — no action');
  console.log(LINE);
  console.log('  ✓  Keeping both sessions as-is');

  // ══════════════════════════════════════════════════════════════════════════
  // ISSUE 1 — BULK ZOOM CREATION
  // ══════════════════════════════════════════════════════════════════════════
  console.log(`\n${LINE}`);
  console.log('  ISSUE 1 — BULK ZOOM CREATION (missing zoom_meeting_id)');
  console.log(LINE);

  const now = new Date().toISOString();

  const { data: sessions, error: sessErr } = await supabase
    .from('sessions')
    .select(`
      id, scheduled_at, duration_minutes, tutor_id,
      student:students(name),
      tutor:tutors(name, zoom_user_id)
    `)
    .eq('status', 'scheduled')
    .gte('scheduled_at', now)
    .is('zoom_meeting_id', null)
    .order('scheduled_at');

  if (sessErr || !sessions) {
    console.log(`  ✕  Failed to fetch sessions: ${sessErr?.message}`);
    return;
  }

  console.log(`  Found ${sessions.length} scheduled session(s) without a Zoom meeting ID.\n`);

  if (sessions.length === 0) {
    console.log('  ✅  Nothing to do.');
    return;
  }

  const BATCH = 10;
  let created = 0;
  let failed  = 0;

  for (let i = 0; i < sessions.length; i += BATCH) {
    const batch = sessions.slice(i, i + BATCH);
    await Promise.all(batch.map(async (s, bi) => {
      const n        = i + bi + 1;
      const student  = (s as any).student;
      const tutor    = (s as any).tutor;
      const topic    = `StudyCore: ${student?.name ?? 'Student'} & ${tutor?.name ?? 'Tutor'}`;

      console.log(`  [${n}/${sessions.length}]  Creating Zoom for session ${s.id.slice(0,8)}  (${topic})`);

      const zoom = await createZoomMeeting({
        topic,
        startTime: s.scheduled_at,
        durationMinutes: s.duration_minutes ?? 60,
        zoomUserId: tutor?.zoom_user_id ?? undefined,
      });

      if (!zoom) {
        console.log(`           ✕  Zoom creation failed — session ${s.id.slice(0,8)}`);
        failed++;
        return;
      }

      const { error: upErr } = await supabase
        .from('sessions')
        .update({
          zoom_meeting_id: String(zoom.id),
          zoom_join_url:   zoom.join_url,
          zoom_host_url:   zoom.start_url,
        })
        .eq('id', s.id);

      if (upErr) {
        console.log(`           ✕  DB update failed for ${s.id.slice(0,8)}: ${upErr.message}`);
        failed++;
      } else {
        console.log(`           ✓  Zoom ${zoom.id} saved`);
        created++;
      }
    }));

    // Small pause between batches to respect rate limits
    if (i + BATCH < sessions.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n${line}`);
  console.log(`  Issue 1 complete: ${created} Zoom meetings created, ${failed} failed.`);
  console.log(`${line}\n`);
}

main().catch(console.error);
