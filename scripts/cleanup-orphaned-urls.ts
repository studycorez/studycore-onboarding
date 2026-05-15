/**
 * cleanup-orphaned-urls.ts
 *
 * One-time cleanup: finds all sessions where sessions.fathom_recording_url is
 * set but has no is_primary=true row in session_recordings (orphaned URL state
 * left by recording re-attributions before cleanupOrphanedSessionUrl existed).
 *
 * For each orphaned session:
 *   - If session_recordings has remaining rows → re-run pickPrimaryRecording
 *   - If session_recordings is empty → NULL fathom_recording_url + fathom_transcript
 *   - If session row is gone → log and skip
 *
 * Outputs: scripts/output/orphaned-sessions-cleanup-<date>.csv
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/cleanup-orphaned-urls.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Mirror of pickPrimaryRecording from route.ts (same 3-tier sort)
async function pickPrimaryRecording(sessionId: string): Promise<string | null> {
  const { data: recs } = await supabase
    .from('session_recordings')
    .select('id, fathom_recording_id, fathom_recording_url, duration_seconds, recording_start_time')
    .eq('session_id', sessionId);

  if (!recs || recs.length === 0) return null;

  const sorted = [...recs].sort((a: any, b: any) => {
    const aP = a.fathom_recording_id < 0 ? 1 : 0;
    const bP = b.fathom_recording_id < 0 ? 1 : 0;
    if (aP !== bP) return aP - bP;
    const da = Math.max(0, a.duration_seconds ?? 0);
    const db = Math.max(0, b.duration_seconds ?? 0);
    if (db !== da) return db - da;
    const ta = a.recording_start_time ? new Date(a.recording_start_time).getTime() : Infinity;
    const tb = b.recording_start_time ? new Date(b.recording_start_time).getTime() : Infinity;
    return ta - tb;
  });

  const primary = sorted[0] as any;
  await supabase.from('session_recordings').update({ is_primary: false }).eq('session_id', sessionId);
  await supabase.from('session_recordings').update({ is_primary: true }).eq('id', primary.id);
  await supabase.from('sessions').update({ fathom_recording_url: primary.fathom_recording_url }).eq('id', sessionId);
  return primary.fathom_recording_url;
}

async function main() {
  console.log('\n=== Orphaned URL Cleanup ===\n');

  // Fetch all sessions with fathom_recording_url
  const sessionsWithUrl: any[] = [];
  let sPage = 0;
  while (true) {
    const { data: batch } = await supabase
      .from('sessions')
      .select('id, fathom_recording_url, fathom_transcript, tutor:tutors(name), student:students(name), scheduled_at')
      .not('fathom_recording_url', 'is', null)
      .range(sPage * 1000, sPage * 1000 + 999);
    if (!batch || batch.length === 0) break;
    sessionsWithUrl.push(...batch);
    if (batch.length < 1000) break;
    sPage++;
  }

  // Fetch all primary rows
  const { data: primaryRows } = await supabase
    .from('session_recordings')
    .select('session_id')
    .eq('is_primary', true);
  const sessionsWithPrimary = new Set((primaryRows ?? []).map((r: any) => r.session_id));

  // Find orphaned: have URL but no is_primary row
  const orphaned = sessionsWithUrl.filter(s => !sessionsWithPrimary.has(s.id));
  console.log(`Sessions with fathom_recording_url:  ${sessionsWithUrl.length}`);
  console.log(`Sessions with is_primary row:        ${sessionsWithPrimary.size}`);
  console.log(`Orphaned (URL but no primary):       ${orphaned.length}`);

  type ResultRow = {
    session_id: string;
    student_name: string;
    tutor_name: string;
    scheduled_at: string;
    old_fathom_recording_url: string;
    new_state: 'url_nulled_no_recordings' | 'url_replaced_with_remaining_recording' | 'session_deleted';
  };

  const results: ResultRow[] = [];
  let nulled = 0, replaced = 0, deleted = 0;

  for (const s of orphaned) {
    const sessionId = s.id;
    const oldUrl = s.fathom_recording_url;

    // Check if session still exists (it's in our list so it does, but verify)
    const { data: sessionCheck } = await supabase
      .from('sessions')
      .select('id')
      .eq('id', sessionId)
      .maybeSingle();

    if (!sessionCheck) {
      deleted++;
      results.push({
        session_id: sessionId,
        student_name: (s.student as any)?.name ?? '—',
        tutor_name: (s.tutor as any)?.name ?? '—',
        scheduled_at: s.scheduled_at,
        old_fathom_recording_url: oldUrl,
        new_state: 'session_deleted',
      });
      continue;
    }

    // Check remaining recordings
    const { data: remaining } = await supabase
      .from('session_recordings')
      .select('id')
      .eq('session_id', sessionId)
      .limit(1);

    if (remaining && remaining.length > 0) {
      await pickPrimaryRecording(sessionId);
      replaced++;
      results.push({
        session_id: sessionId,
        student_name: (s.student as any)?.name ?? '—',
        tutor_name: (s.tutor as any)?.name ?? '—',
        scheduled_at: s.scheduled_at,
        old_fathom_recording_url: oldUrl,
        new_state: 'url_replaced_with_remaining_recording',
      });
    } else {
      await supabase.from('sessions').update({ fathom_recording_url: null, fathom_transcript: null }).eq('id', sessionId);
      nulled++;
      results.push({
        session_id: sessionId,
        student_name: (s.student as any)?.name ?? '—',
        tutor_name: (s.tutor as any)?.name ?? '—',
        scheduled_at: s.scheduled_at,
        old_fathom_recording_url: oldUrl,
        new_state: 'url_nulled_no_recordings',
      });
    }
  }

  console.log(`\nResults:`);
  console.log(`  url_replaced_with_remaining_recording: ${replaced}`);
  console.log(`  url_nulled_no_recordings:              ${nulled}`);
  console.log(`  session_deleted:                       ${deleted}`);
  console.log(`  Total cleaned:                         ${results.length}`);

  // Export CSV
  const outputDir = path.resolve(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const csvPath = path.resolve(outputDir, `orphaned-sessions-cleanup-${new Date().toISOString().slice(0, 10)}.csv`);

  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const headers = ['session_id', 'student_name', 'tutor_name', 'scheduled_at', 'old_fathom_recording_url', 'new_state'];
  const rows = [
    headers.join(','),
    ...results.map(r => headers.map(h => escape((r as any)[h])).join(',')),
  ].join('\n');

  fs.writeFileSync(csvPath, rows, 'utf8');
  console.log(`\nCSV exported → ${csvPath} (${results.length} rows)`);
  console.log('\n=== Cleanup complete ===');
}

main().catch(err => { console.error(err); process.exit(1); });
