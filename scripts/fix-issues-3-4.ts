/**
 * Fixes Issue 3 (Santiago Perez hours) and Issue 4 (date shifts).
 * Also prints full details for Issue 2 conflicts so the user can decide.
 *
 * Usage: npx ts-node --project tsconfig.json scripts/fix-issues-3-4.ts
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

function localDt(utcIso: string, tz = 'America/New_York') {
  return new Date(utcIso).toLocaleString('en-US', {
    timeZone: tz, weekday: 'long', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

async function main() {
  const LINE = '═'.repeat(70);

  // ── Issue 2: Print conflict details ──────────────────────────────────────
  console.log(`\n${LINE}`);
  console.log('  ISSUE 2 — TUTOR DOUBLE-BOOKING DETAILS (display only)');
  console.log(LINE);

  const conflictPairs = [
    { label: 'Conflict A — Minju Kim / Susannah Rockers',
      ids: ['1e5f822f-e28e-4b22-a3cf-0c38e54ad640', '2386ba89-b55c-4668-b2de-73e51090ca5c'] },
    { label: 'Conflict B — Mazin Sihweil / Adhya & Isha Ganatra',
      ids: ['14f08d98-65e0-4e51-ada5-0e5fb1ade0a3', '4531e266-a97e-4143-9b19-8bf3a0b3dfa6'] },
    { label: 'Conflict C — Parth Patel / Javet Wongkaren',
      ids: ['23b432e4-8261-43c7-af23-c6a9a3ec4cf4', '7828b5c3-5ec3-4d30-8b38-50f2a84ff4f7'] },
  ];

  for (const { label, ids } of conflictPairs) {
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, student:students(name, timezone), tutor:tutors(name)')
      .in('id', ids)
      .order('scheduled_at');

    console.log(`\n  ${label}`);
    for (const s of sessions ?? []) {
      const student = (s as any).student;
      const tutor   = (s as any).tutor;
      const tz      = student?.timezone ?? 'America/New_York';
      const endMs   = new Date(s.scheduled_at).getTime() + s.duration_minutes * 60_000;
      const endTime = new Date(endMs).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
      console.log(`    Session: ${s.id.slice(0,8)}`);
      console.log(`    Student: ${student?.name}`);
      console.log(`    Tutor:   ${tutor?.name}`);
      console.log(`    Time:    ${localDt(s.scheduled_at, tz)} → ${endTime}  (${s.duration_minutes} min)`);
      console.log('');
    }
  }

  // ── Issue 3: Santiago Perez purchased_hours = 16 ─────────────────────────
  console.log(`\n${LINE}`);
  console.log('  ISSUE 3 — FIXING SANTIAGO PEREZ PURCHASED HOURS');
  console.log(LINE);

  const { data: santiago } = await supabase
    .from('students')
    .select('id, name, purchased_hours, used_hours')
    .ilike('name', '%Santiago Perez%')
    .single();

  if (!santiago) {
    console.log('  ✕  Could not find Santiago Perez');
  } else {
    console.log(`  Found: ${santiago.name} (${santiago.id.slice(0,8)})`);
    console.log(`  Before: purchased_hours = ${santiago.purchased_hours}, used_hours = ${santiago.used_hours}`);

    const { error } = await supabase
      .from('students')
      .update({ purchased_hours: 16 })
      .eq('id', santiago.id);

    if (error) {
      console.log(`  ✕  Update failed: ${error.message}`);
    } else {
      console.log('  ✓  purchased_hours updated to 16');
    }
  }

  // ── Issue 4: Shift Aarav and Chaitan +24 hours ────────────────────────────
  console.log(`\n${LINE}`);
  console.log('  ISSUE 4 — SHIFTING THURSDAY SESSIONS → FRIDAY (+24 h)');
  console.log(LINE);

  const shiftSessions = [
    { id: '41500186-70a8-48a5-9e83-ab2506780e01', name: 'Aarav Vasudevan' },
    { id: 'bfe77aba-4e9b-4a98-8fc8-e44fe34bf062', name: 'Chaitan Praveen'  },
  ];

  for (const { id, name } of shiftSessions) {
    const { data: s } = await supabase
      .from('sessions')
      .select('id, scheduled_at')
      .eq('id', id)
      .single();

    if (!s) {
      console.log(`  ✕  Session ${id.slice(0,8)} not found`);
      continue;
    }

    const oldAt  = s.scheduled_at as string;
    const newAt  = new Date(new Date(oldAt).getTime() + 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('sessions')
      .update({ scheduled_at: newAt })
      .eq('id', id);

    if (error) {
      console.log(`  ✕  Failed to shift ${name}: ${error.message}`);
    } else {
      console.log(`  ✓  ${name}`);
      console.log(`     Before: ${localDt(oldAt)}`);
      console.log(`     After:  ${localDt(newAt)}`);
    }
    console.log('');
  }

  console.log(`\n${'─'.repeat(70)}`);
  console.log('  Issues 3 and 4 complete. Issue 1 (Zoom) pending your go-ahead.');
  console.log('  Please review Issue 2 conflicts above and advise how to resolve.\n');
}

main().catch(console.error);
