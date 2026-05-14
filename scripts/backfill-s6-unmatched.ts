/**
 * backfill-s6-unmatched.ts
 *
 * Dry-run (default) or commit backfill of S6 title-based matching against all
 * unresolved rows in fathom_unmatched_recordings.
 *
 * Columns output:
 *   recording_id | title | allowlist_decision | parsed_name | parse_strategy |
 *   candidates_count | candidate_names | sessions_found_count | session_ids | action
 *
 * Actions:
 *   WOULD_MATCH              — exactly 1 session found for assigned tutor in ±4h
 *   AMBIGUOUS                — 2+ sessions found for assigned tutor in ±4h
 *   NO_SESSION_FOR_CANDIDATE — student + tutor found, 0 sessions in ±4h
 *   NO_CANDIDATE             — title matched allowlist but no student found (or no assigned tutor)
 *   REJECTED_BY_ALLOWLIST    — title did not match any S6 regex
 *
 * Run (dry-run):
 *   npx ts-node --project tsconfig.scripts.json scripts/backfill-s6-unmatched.ts
 *
 * Run (commit):
 *   npx ts-node --project tsconfig.scripts.json scripts/backfill-s6-unmatched.ts --commit
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { subDays, subHours, addHours } from 'date-fns';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const COMMIT = process.argv.includes('--commit');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── S6 regex allowlist (mirrors route.ts exactly) ─────────────────────────────
const S6_TITLE_REGEXES: RegExp[] = [
  /^(.+?)['\u2019]s?\s+studycore(?:\s+\([^)]+\))?(?:\s+\w+)*\s+session/i,
  /^studycore\s+session\s+with\s+(.+)/i,
  /^(.+?)['\u2019]s?(?:\s+(?:\([^)]+\)|\w+))+\s+studycore(?:\s+\([^)]+\))?\s+session/i,
];

const PARSE_STRATEGY_LABELS = ['P1', 'P2', 'P3'];

function extractFirstNameFromTitle(title: string): { firstName: string; strategy: string } | null {
  for (let i = 0; i < S6_TITLE_REGEXES.length; i++) {
    const m = S6_TITLE_REGEXES[i].exec(title);
    if (m) {
      let name = m[1].trim();
      name = name.replace(/['\u2019]s$/i, '').replace(/['\u2019]$/i, '').trim();
      return { firstName: name.split(/\s+/)[0].toLowerCase(), strategy: PARSE_STRATEGY_LABELS[i] };
    }
  }
  return null;
}

// ── pickPrimaryRecording (mirrors route.ts for --commit path) ─────────────────
async function pickPrimaryRecording(sessionId: string): Promise<void> {
  const { data: recs } = await supabase
    .from('session_recordings')
    .select('id, fathom_recording_id, fathom_recording_url, duration_seconds, recording_start_time')
    .eq('session_id', sessionId);

  if (!recs || recs.length === 0) return;

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
}

async function main() {
  console.log(`\n=== S6 Backfill Dry-Run${COMMIT ? ' [COMMIT MODE]' : ''} ===\n`);

  // Fetch all unresolved unmatched recordings
  const { data: unmatched, error } = await supabase
    .from('fathom_unmatched_recordings')
    .select('*')
    .eq('resolved', false)
    .order('last_seen_at', { ascending: false });

  if (error) { console.error('Error fetching unmatched recordings:', error.message); process.exit(1); }
  const rows = unmatched ?? [];
  console.log(`Unresolved rows fetched: ${rows.length}\n`);

  type Action = 'WOULD_MATCH' | 'AMBIGUOUS' | 'NO_SESSION_FOR_CANDIDATE' | 'NO_CANDIDATE' | 'REJECTED_BY_ALLOWLIST';

  interface ResultRow {
    recording_id: string;
    title: string;
    allowlist_decision: 'PASS' | 'REJECT';
    parsed_name: string;
    parse_strategy: string;
    candidates_count: number;
    candidate_names: string;
    sessions_found_count: number;
    session_ids: string;
    action: Action;
  }

  const results: ResultRow[] = [];
  const counts: Record<Action, number> = {
    WOULD_MATCH:              0,
    AMBIGUOUS:                0,
    NO_SESSION_FOR_CANDIDATE: 0,
    NO_CANDIDATE:             0,
    REJECTED_BY_ALLOWLIST:    0,
  };

  for (const rec of rows) {
    const recordingId = String(rec.fathom_recording_id ?? rec.id);
    const title = rec.title ?? '';

    // ── Allowlist check ──────────────────────────────────────────────────────
    const parsed = title ? extractFirstNameFromTitle(title) : null;

    if (!parsed) {
      results.push({
        recording_id: recordingId,
        title,
        allowlist_decision: 'REJECT',
        parsed_name: '',
        parse_strategy: '',
        candidates_count: 0,
        candidate_names: '',
        sessions_found_count: 0,
        session_ids: '',
        action: 'REJECTED_BY_ALLOWLIST',
      });
      counts.REJECTED_BY_ALLOWLIST++;
      continue;
    }

    const { firstName, strategy } = parsed;

    // ── Student lookup ───────────────────────────────────────────────────────
    const { data: studentRows } = await supabase
      .from('students')
      .select('id, name')
      .ilike('name', `${firstName}%`);

    const candidates = studentRows ?? [];

    if (candidates.length === 0) {
      results.push({
        recording_id: recordingId,
        title,
        allowlist_decision: 'PASS',
        parsed_name: firstName,
        parse_strategy: strategy,
        candidates_count: 0,
        candidate_names: '',
        sessions_found_count: 0,
        session_ids: '',
        action: 'NO_CANDIDATE',
      });
      counts.NO_CANDIDATE++;
      continue;
    }

    // ── Assigned tutor lookup (use first candidate, mirroring route.ts limit(1)) ─
    const matchedStudent = candidates[0];
    let assignedTutorId: string | null = null;
    let assignedTutorSource: string | null = null;

    // Tier 1: signed contract
    const { data: contractRows } = await supabase
      .from('contracts')
      .select('tutor_id')
      .eq('student_id', matchedStudent.id)
      .eq('status', 'signed')
      .order('signed_at', { ascending: false })
      .limit(1);
    const contract = contractRows?.[0] ?? null;

    if (contract?.tutor_id) {
      assignedTutorId = contract.tutor_id;
      assignedTutorSource = 'contract';
    } else {
      // Tier 2: session frequency
      const sinceDate = subDays(new Date(), 90).toISOString();
      const { data: recentSessions } = await supabase
        .from('sessions')
        .select('tutor_id')
        .eq('student_id', matchedStudent.id)
        .not('tutor_id', 'is', null)
        .gte('scheduled_at', sinceDate)
        .in('status', ['scheduled', 'completed']);

      if (recentSessions && recentSessions.length > 0) {
        const freq: Record<string, number> = {};
        for (const r of recentSessions) {
          if (r.tutor_id) freq[r.tutor_id] = (freq[r.tutor_id] ?? 0) + 1;
        }
        const topEntry = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
        if (topEntry) {
          assignedTutorId = topEntry[0];
          assignedTutorSource = 'session_frequency';
        }
      }
    }

    if (!assignedTutorId) {
      results.push({
        recording_id: recordingId,
        title,
        allowlist_decision: 'PASS',
        parsed_name: firstName,
        parse_strategy: strategy,
        candidates_count: candidates.length,
        candidate_names: candidates.map((c: any) => c.name).join('; '),
        sessions_found_count: 0,
        session_ids: '',
        action: 'NO_CANDIDATE',
      });
      counts.NO_CANDIDATE++;
      continue;
    }

    // ── Session window lookup ────────────────────────────────────────────────
    const startedAt = rec.started_at ? new Date(rec.started_at) : null;

    if (!startedAt) {
      results.push({
        recording_id: recordingId,
        title,
        allowlist_decision: 'PASS',
        parsed_name: firstName,
        parse_strategy: strategy,
        candidates_count: candidates.length,
        candidate_names: candidates.map((c: any) => c.name).join('; '),
        sessions_found_count: 0,
        session_ids: `no_started_at(source=${assignedTutorSource})`,
        action: 'NO_SESSION_FOR_CANDIDATE',
      });
      counts.NO_SESSION_FOR_CANDIDATE++;
      continue;
    }

    const windowStart = subHours(startedAt, 4).toISOString();
    const windowEnd   = addHours(startedAt, 4).toISOString();

    const { data: sessionRows } = await supabase
      .from('sessions')
      .select('id, scheduled_at')
      .eq('student_id', matchedStudent.id)
      .not('tutor_id', 'is', null)
      .eq('tutor_id', assignedTutorId)
      .in('status', ['scheduled', 'completed'])
      .gte('scheduled_at', windowStart)
      .lte('scheduled_at', windowEnd)
      .order('scheduled_at');

    const sessionCount = sessionRows?.length ?? 0;
    const sessionIdList = (sessionRows ?? []).map((s: any) => s.id).join('; ');

    let action: Action;
    if (sessionCount === 1) {
      action = 'WOULD_MATCH';
    } else if (sessionCount > 1) {
      action = 'AMBIGUOUS';
    } else {
      action = 'NO_SESSION_FOR_CANDIDATE';
    }
    counts[action]++;

    results.push({
      recording_id: recordingId,
      title,
      allowlist_decision: 'PASS',
      parsed_name: firstName,
      parse_strategy: strategy,
      candidates_count: candidates.length,
      candidate_names: candidates.map((c: any) => c.name).join('; '),
      sessions_found_count: sessionCount,
      session_ids: sessionIdList || `(none, tutor=${assignedTutorId} source=${assignedTutorSource})`,
      action,
    });

    // ── Commit path ──────────────────────────────────────────────────────────
    if (COMMIT && action === 'WOULD_MATCH' && sessionRows?.length === 1) {
      const sessionId = sessionRows[0].id;

      // Check for existing row to detect re-attribution
      const { data: existingRow } = await supabase
        .from('session_recordings')
        .select('session_id')
        .eq('fathom_recording_id', rec.fathom_recording_id)
        .maybeSingle();
      const oldSessionId: string | null = existingRow?.session_id ?? null;

      await supabase.from('session_recordings').upsert({
        session_id:            sessionId,
        fathom_recording_id:   rec.fathom_recording_id,
        fathom_recording_url:  rec.fathom_share_url,
        fathom_share_url:      rec.fathom_share_url,
        recording_start_time:  rec.started_at,
        recording_end_time:    null,
        match_method:          `s6_title_tutor_match(${firstName})`,
        is_primary:            false,
      }, { onConflict: 'fathom_recording_id' });

      // Clean up old session if recording moved
      if (oldSessionId && oldSessionId !== sessionId) {
        const { data: oldSession } = await supabase
          .from('sessions').select('id').eq('id', oldSessionId).maybeSingle();
        if (oldSession) {
          const { data: remaining } = await supabase
            .from('session_recordings').select('id').eq('session_id', oldSessionId).limit(1);
          if (remaining && remaining.length > 0) {
            await pickPrimaryRecording(oldSessionId);
          } else {
            await supabase.from('sessions')
              .update({ fathom_recording_url: null, fathom_transcript: null })
              .eq('id', oldSessionId);
          }
        }
      }

      await pickPrimaryRecording(sessionId);

      // Mark unmatched row resolved
      await supabase
        .from('fathom_unmatched_recordings')
        .update({ resolved: true, resolved_session_id: sessionId })
        .eq('fathom_recording_id', rec.fathom_recording_id)
        .eq('resolved', false);

      console.log(`  COMMITTED: recording_id=${recordingId} → session_id=${sessionId}`);
    }
  }

  // ── Print table ──────────────────────────────────────────────────────────────
  console.log('\n' + [
    'recording_id',
    'title',
    'allowlist_decision',
    'parsed_name',
    'parse_strategy',
    'candidates_count',
    'candidate_names',
    'sessions_found_count',
    'session_ids',
    'action',
  ].join('\t'));

  for (const r of results) {
    console.log([
      r.recording_id,
      r.title.slice(0, 60).replace(/\t/g, ' '),
      r.allowlist_decision,
      r.parsed_name,
      r.parse_strategy,
      r.candidates_count,
      r.candidate_names.slice(0, 60),
      r.sessions_found_count,
      r.session_ids.slice(0, 80),
      r.action,
    ].join('\t'));
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n── Per-action summary ──────────────────────────────────────');
  console.log(`  WOULD_MATCH              : ${counts.WOULD_MATCH}`);
  console.log(`  AMBIGUOUS                : ${counts.AMBIGUOUS}`);
  console.log(`  NO_SESSION_FOR_CANDIDATE : ${counts.NO_SESSION_FOR_CANDIDATE}`);
  console.log(`  NO_CANDIDATE             : ${counts.NO_CANDIDATE}`);
  console.log(`  REJECTED_BY_ALLOWLIST    : ${counts.REJECTED_BY_ALLOWLIST}`);
  console.log(`  Total                    : ${results.length}`);

  // ── CSV export ───────────────────────────────────────────────────────────────
  const outputDir = path.resolve(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const suffix = COMMIT ? 'commit' : 'dryrun';
  const csvPath = path.resolve(outputDir, `s6-backfill-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`);

  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const headers: (keyof ResultRow)[] = [
    'recording_id', 'title', 'allowlist_decision', 'parsed_name', 'parse_strategy',
    'candidates_count', 'candidate_names', 'sessions_found_count', 'session_ids', 'action',
  ];
  const csvRows = [
    headers.join(','),
    ...results.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n');

  fs.writeFileSync(csvPath, csvRows, 'utf8');
  console.log(`\nCSV exported → ${csvPath} (${results.length} rows)`);
  console.log(`\n=== S6 Backfill ${COMMIT ? 'Commit' : 'Dry-Run'} complete ===`);
}

main().catch(err => { console.error(err); process.exit(1); });
