/**
 * audit-fathom-matches.ts
 *
 * Audits the state of Fathom recording matches in the database.
 *
 * Reports:
 *   1. Summary counts (sessions with recordings, total recordings, primary mismatch)
 *   2. Sessions where sessions.fathom_recording_url doesn't match the is_primary=true
 *      row in session_recordings (i.e., the two tables are out of sync)
 *   3. All unresolved unmatched recordings in fathom_unmatched_recordings,
 *      exported to scripts/output/fathom-unmatched-<date>.csv
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/audit-fathom-matches.ts
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

function isoNow() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  console.log('\n=== Fathom Match Audit ===\n');

  // ── 1. Sessions with at least one recording ────────────────────────────────
  const { data: recordingsRaw, error: recErr } = await supabase
    .from('session_recordings')
    .select('id, session_id, fathom_recording_url, duration_seconds, is_primary, match_method, created_at');

  if (recErr) { console.error('Error fetching session_recordings:', recErr.message); process.exit(1); }
  const recordings = recordingsRaw ?? [];

  const sessionIds = new Set(recordings.map(r => r.session_id));
  const totalRecordings = recordings.length;
  const primaryRecordings = recordings.filter(r => r.is_primary);
  const sessionsWithMultiple = Object.entries(
    recordings.reduce<Record<string, number>>((acc, r) => {
      acc[r.session_id] = (acc[r.session_id] ?? 0) + 1;
      return acc;
    }, {}),
  ).filter(([, count]) => count > 1);

  console.log(`Sessions with ≥1 recording : ${sessionIds.size}`);
  console.log(`Total recording rows        : ${totalRecordings}`);
  console.log(`Sessions with >1 recording  : ${sessionsWithMultiple.length}`);
  console.log(`Primary recordings set      : ${primaryRecordings.length}`);
  console.log();

  // ── 2. Primary mismatch: sessions.fathom_recording_url ≠ primary row ──────
  console.log('Checking sessions.fathom_recording_url vs primary recording rows…');

  // Fetch sessions that have a fathom_recording_url
  const { data: sessionsRaw, error: sessErr } = await supabase
    .from('sessions')
    .select('id, fathom_recording_url, tutor:tutors(name), student:students(name), scheduled_at')
    .not('fathom_recording_url', 'is', null);

  if (sessErr) { console.error('Error fetching sessions:', sessErr.message); process.exit(1); }
  const sessionsWithUrl = sessionsRaw ?? [];

  const primaryBySession = new Map(primaryRecordings.map(r => [r.session_id, r.fathom_recording_url]));

  interface MismatchRow {
    session_id: string;
    scheduled_at: string;
    tutor: string;
    student: string;
    session_url: string;
    primary_recording_url: string | null;
    issue: string;
  }

  const mismatches: MismatchRow[] = [];

  for (const s of sessionsWithUrl) {
    const primaryUrl = primaryBySession.get(s.id);
    if (primaryUrl === undefined) {
      // session has fathom_recording_url but no row in session_recordings at all
      mismatches.push({
        session_id: s.id,
        scheduled_at: s.scheduled_at,
        tutor: (s.tutor as any)?.name ?? '—',
        student: (s.student as any)?.name ?? '—',
        session_url: s.fathom_recording_url,
        primary_recording_url: null,
        issue: 'no_session_recordings_row',
      });
    } else if (primaryUrl !== s.fathom_recording_url) {
      mismatches.push({
        session_id: s.id,
        scheduled_at: s.scheduled_at,
        tutor: (s.tutor as any)?.name ?? '—',
        student: (s.student as any)?.name ?? '—',
        session_url: s.fathom_recording_url,
        primary_recording_url: primaryUrl,
        issue: 'url_mismatch',
      });
    }
  }

  // Also check for sessions that have a primary row but no sessions.fathom_recording_url
  const sessionIdsWithUrl = new Set(sessionsWithUrl.map(s => s.id));
  for (const [sid, url] of primaryBySession) {
    if (!sessionIdsWithUrl.has(sid)) {
      mismatches.push({
        session_id: sid,
        scheduled_at: '—',
        tutor: '—',
        student: '—',
        session_url: '',
        primary_recording_url: url,
        issue: 'primary_row_but_no_session_url',
      });
    }
  }

  if (mismatches.length === 0) {
    console.log('✅ No mismatches — sessions.fathom_recording_url is in sync with session_recordings.\n');
  } else {
    console.log(`⚠️  ${mismatches.length} mismatch(es) found:\n`);
    for (const m of mismatches) {
      console.log(`  [${m.issue}] ${m.tutor} → ${m.student} | ${m.scheduled_at.slice(0, 10)}`);
      console.log(`    session URL : ${m.session_url || '(none)'}`);
      console.log(`    primary row : ${m.primary_recording_url ?? '(none)'}`);
    }
    console.log();
  }

  // ── 3. Strategy breakdown ─────────────────────────────────────────────────
  const byCounted: Record<string, number> = {};
  for (const r of recordings) {
    const m = r.match_method ?? 'unknown';
    byCounted[m] = (byCounted[m] ?? 0) + 1;
  }
  console.log('Recordings by match_method:');
  for (const [method, count] of Object.entries(byCounted).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${method.padEnd(35)} ${count}`);
  }
  console.log();

  // ── 4. Unmatched recordings export ────────────────────────────────────────
  const { data: unmatchedRaw, error: umErr } = await supabase
    .from('fathom_unmatched_recordings')
    .select('*')
    .eq('resolved', false)
    .order('last_seen_at', { ascending: false });

  if (umErr) { console.error('Error fetching unmatched recordings:', umErr.message); process.exit(1); }
  const unmatched = unmatchedRaw ?? [];

  console.log(`Unresolved unmatched recordings: ${unmatched.length}`);

  const byCategory: Record<string, number> = {};
  for (const u of unmatched) {
    const c = u.category ?? 'unknown';
    byCategory[c] = (byCategory[c] ?? 0) + 1;
  }
  for (const [cat, count] of Object.entries(byCategory)) {
    console.log(`  ${cat.padEnd(40)} ${count}`);
  }

  if (unmatched.length > 0) {
    const outputDir = path.resolve(__dirname, 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const csvPath = path.resolve(outputDir, `fathom-unmatched-${isoNow()}.csv`);
    const headers = [
      'fathom_recording_id', 'category', 'title', 'host_email',
      'participant_emails', 'started_at', 'fathom_share_url',
      'no_match_reasons', 'last_seen_at',
    ];

    const escape = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      const s = Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };

    const rows = [
      headers.join(','),
      ...unmatched.map(u =>
        headers.map(h => escape((u as any)[h])).join(',')
      ),
    ].join('\n');

    fs.writeFileSync(csvPath, rows, 'utf8');
    console.log(`\nCSV exported → ${csvPath}`);
  }

  console.log('\n=== Audit complete ===\n');
}

main().catch(err => { console.error(err); process.exit(1); });
