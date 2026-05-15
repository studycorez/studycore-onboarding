/**
 * Spot-check DB state post-dedup.
 * A: Canonical with 3 consolidated recordings
 * B: URL-merge session (canonical whose fathom_url was null before dedup)
 * C: Already done in post-dedup-mary-review.ts — skipped here
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Row = Record<string, any>;

function pad(s: any, n: number): string { return String(s ?? '').padEnd(n); }
function lpad(s: any, n: number): string { return String(s ?? '').padStart(n); }
function hr(n: number): string { return '─'.repeat(n); }

async function main() {

  // ── SPOT-CHECK A: Find a canonical that has 3 recordings (consolidated) ───
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('SPOT-CHECK A: Canonical session with consolidated recordings');
  console.log('══════════════════════════════════════════════════════════════\n');

  // Fetch all recordings, group by session_id, find one with 3+
  let page = 0;
  const allRecs: Row[] = [];
  while (true) {
    const { data, error } = await supabase
      .from('session_recordings')
      .select('id, session_id, fathom_recording_id, fathom_recording_url, is_primary, duration_seconds, match_method')
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    allRecs.push(...data);
    if (data.length < 1000) break;
    page++;
  }

  const recsBySession = new Map<string, Row[]>();
  for (const r of allRecs) {
    if (!recsBySession.has(r.session_id)) recsBySession.set(r.session_id, []);
    recsBySession.get(r.session_id)!.push(r);
  }

  // Find a session with exactly 3 recordings (confirmed consolidation happened)
  const consolidatedSessionId = [...recsBySession.entries()]
    .filter(([, recs]) => recs.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)[0]?.[0];

  if (!consolidatedSessionId) {
    console.log('  ⚠️  No session with 3+ recordings found.');
  } else {
    const recs = recsBySession.get(consolidatedSessionId)!;
    const { data: sessRows } = await supabase
      .from('sessions')
      .select('id, student_id, tutor_id, scheduled_at, status, duration_minutes, fathom_recording_url, created_at')
      .eq('id', consolidatedSessionId)
      .limit(1);

    const session = sessRows?.[0];
    const { data: studentRows } = await supabase.from('students').select('id, name').eq('id', session?.student_id ?? '').limit(1);
    const studentName = studentRows?.[0]?.name ?? session?.student_id;

    console.log('  sessions row:');
    console.log(`    id               : ${session?.id}`);
    console.log(`    student          : ${studentName}`);
    console.log(`    scheduled_at     : ${session?.scheduled_at}`);
    console.log(`    status           : ${session?.status}`);
    console.log(`    duration_minutes : ${session?.duration_minutes}`);
    console.log(`    fathom_url       : ${session?.fathom_recording_url ?? 'null'}`);

    console.log(`\n  session_recordings (${recs.length} rows — all pointing to this canonical):`);
    console.log('  ' + hr(100));
    console.log('  ' + pad('rec_id (short)', 14) + pad('fathom_rec_id', 18) + pad('is_primary', 12) + pad('dur_s', 8) + pad('method', 14) + 'url (tail-30)');
    console.log('  ' + hr(100));
    for (const r of recs.sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))) {
      const urlTail = r.fathom_recording_url?.slice(-30) ?? 'null';
      const primaryStr = r.is_primary ? '✅ TRUE ' : 'false  ';
      console.log('  ' + pad(r.id.slice(0, 8) + '…', 14) + lpad(r.fathom_recording_id, 16) + '  ' + pad(primaryStr, 10) + lpad(r.duration_seconds ?? '—', 8) + '  ' + pad(r.match_method ?? '—', 12) + '  ' + urlTail);
    }

    const primaryRec = recs.find(r => r.is_primary);
    const primaryCount = recs.filter(r => r.is_primary).length;
    const urlMatch = primaryRec?.fathom_recording_url === session?.fathom_recording_url;
    console.log(`\n  is_primary count              : ${primaryCount}  ${primaryCount === 1 ? '✅' : '❌ should be 1'}`);
    console.log(`  sessions.url matches primary  : ${urlMatch ? '✅ YES' : '❌ NO — MISMATCH'}`);
  }

  // ── SPOT-CHECK B: URL-merge session — find canonical where URL was merged ──
  // We know from the execute: canonical d77015d0… (Arnav Mishra, 2026-04-27)
  // Find it by student name + scheduled_at
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('SPOT-CHECK B: URL-merge session (Arnav Mishra, 2026-04-27)');
  console.log('  Before dedup: canonical had null fathom_url; URL lived on dup.');
  console.log('  After dedup: URL merged from duplicate via is_primary recording.');
  console.log('══════════════════════════════════════════════════════════════\n');

  // Look up Arnav Mishra
  const { data: arnavStudent } = await supabase.from('students').select('id, name').ilike('name', 'Arnav%').limit(3);
  console.log(`  Students matching "Arnav%": ${arnavStudent?.map(s => s.name).join(', ') ?? 'none'}`);

  if (arnavStudent && arnavStudent.length > 0) {
    for (const student of arnavStudent) {
      // Find their sessions around 2026-04-27
      const { data: arnavSessions } = await supabase
        .from('sessions')
        .select('id, student_id, scheduled_at, status, fathom_recording_url, created_at')
        .eq('student_id', student.id)
        .gte('scheduled_at', '2026-04-27T00:00:00')
        .lte('scheduled_at', '2026-04-28T00:00:00');

      if (!arnavSessions || arnavSessions.length === 0) continue;

      for (const sess of arnavSessions) {
        const { data: sessRecs } = await supabase
          .from('session_recordings')
          .select('id, fathom_recording_id, fathom_recording_url, is_primary, duration_seconds, match_method')
          .eq('session_id', sess.id);

        console.log(`\n  sessions row — ${student.name}:`);
        console.log(`    id               : ${sess.id}`);
        console.log(`    scheduled_at     : ${sess.scheduled_at}`);
        console.log(`    status           : ${sess.status}`);
        console.log(`    fathom_url (NOW) : ${sess.fathom_recording_url ?? '⚠️ still null'}`);
        console.log(`    fathom_url (PRE) : null  (was null before dedup — URL was on duplicate row)`);

        console.log(`\n  session_recordings (${sessRecs?.length ?? 0} rows):`);
        console.log('  ' + hr(100));
        console.log('  ' + pad('rec_id (short)', 14) + pad('fathom_rec_id', 18) + pad('is_primary', 12) + pad('dur_s', 8) + pad('method', 14) + 'url (tail-35)');
        console.log('  ' + hr(100));
        for (const r of (sessRecs ?? []).sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))) {
          const urlTail = r.fathom_recording_url?.slice(-35) ?? 'null';
          const primaryStr = r.is_primary ? '✅ TRUE ' : 'false  ';
          console.log('  ' + pad(r.id.slice(0, 8) + '…', 14) + lpad(r.fathom_recording_id, 16) + '  ' + pad(primaryStr, 10) + lpad(r.duration_seconds ?? '—', 8) + '  ' + pad(r.match_method ?? '—', 12) + '  ' + urlTail);
        }

        const primaryRec = (sessRecs ?? []).find(r => r.is_primary);
        const urlMatch = primaryRec?.fathom_recording_url === sess.fathom_recording_url;
        const primaryCount = (sessRecs ?? []).filter(r => r.is_primary).length;
        console.log(`\n  is_primary count              : ${primaryCount}  ${primaryCount === 1 ? '✅' : '❌ should be 1'}`);
        console.log(`  sessions.url matches primary  : ${urlMatch ? '✅ YES' : '❌ NO — MISMATCH'}`);
      }
    }
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('SPOT-CHECKS A + B COMPLETE.');
  console.log('══════════════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error(e); process.exit(1); });
