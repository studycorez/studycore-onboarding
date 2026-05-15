/**
 * For the 10 DIVERGED_RISKY groups (fathom_recording_url on non-earliest row),
 * show all distinct URLs, their session_recordings metadata, and which URL each
 * tiebreaker strategy would select.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/audit-risky-url-tiebreak.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// The 10 risky groups from Part C full-population scan.
// Format: { canonicalId, duplicateIds[], groupKey }
const RISKY_GROUPS = [
  {
    groupKey: '37119113…|ceb2d979…|2026-04-19T13:00:55',
    canonicalId: '29f55457-1964-4f53-8d79-ef9287b4a751',
    allIds: ['29f55457-1964-4f53-8d79-ef9287b4a751', 'e657cb93-44eb-4841-b396-e6bf61c4ff30', '37acf290-4654-4e78-aace-706cab4afb5b'],
  },
  {
    groupKey: '3a306435…|c342d623…|2026-04-12T15:29:19',
    canonicalId: 'd06378e8-2910-486a-8c79-660eac08cdf5',
    allIds: ['d06378e8-2910-486a-8c79-660eac08cdf5', '1d9cec30-8063-4598-86e2-94a2d0163ea5', '2d51864f-1e38-420e-b17e-3d8366398ce4'],
  },
  {
    groupKey: '4deddced…|ce8d0198…|2026-05-03T23:00:48',
    canonicalId: 'ef152522-7059-4742-a1bf-58fe637156fe',
    allIds: ['ef152522-7059-4742-a1bf-58fe637156fe', 'aa4d8365-d7ab-4ded-8d47-6f771678a66e'],
  },
  {
    groupKey: '69c26aa5…|5e4e04c8…|2026-05-09T17:55:50',
    canonicalId: '03f04723-c57a-4bf8-bca7-4c405e3158a8',
    allIds: ['03f04723-c57a-4bf8-bca7-4c405e3158a8', 'ad4e2cd2-4fd3-41b9-baa5-dcbf856ee5d6'],
  },
  {
    groupKey: 'a8fb76de…|01f5aaed…|2026-05-03T19:45:09',
    canonicalId: '3e6af597-b0f6-4498-a5a2-2f44973b2228',
    allIds: ['3e6af597-b0f6-4498-a5a2-2f44973b2228', 'e5fb2540-616d-4b61-ac1c-ef281903d37a'],
  },
  {
    groupKey: 'ade57827…|01f5aaed…|2026-05-03T16:59:40',
    canonicalId: '94db14a2-87e9-4108-bc65-388c95dfa684',
    allIds: ['94db14a2-87e9-4108-bc65-388c95dfa684', '6053d701-876c-4a53-9470-17899df3733d'],
  },
  {
    groupKey: 'b494c7b6…|ceb2d979…|2026-03-29T21:09:22',
    canonicalId: 'e48cb9e1-af3a-4544-8dd9-90f92b4ca0e6',
    allIds: ['e48cb9e1-af3a-4544-8dd9-90f92b4ca0e6', 'c242b6c9-3dfe-4dc0-8e5a-6f82b8068613'],
  },
  {
    groupKey: 'caff4571…|5e4e04c8…|2026-03-30T00:01:38',
    canonicalId: 'd3917cbd-e37c-429b-a888-ed9c9a0d4043',
    allIds: ['d3917cbd-e37c-429b-a888-ed9c9a0d4043', '2ae52483-f146-4ace-9c8b-4f746a860918'],
  },
  {
    groupKey: 'd0e01dcd…|3f2ab4fe…|2026-04-12T21:58:10',
    canonicalId: '26bc3133-fd36-4021-b913-2dcfc9056eb1',
    allIds: ['26bc3133-fd36-4021-b913-2dcfc9056eb1', '89b8c269-73d2-4693-b409-b9bd2279ec8f', 'df9ec651-6c4c-4705-9b98-dccefed18e7c', 'd582d7ac-bc45-4afa-a956-4f6b888700a7'],
  },
  {
    groupKey: 'dbb62f7b…|50c91410…|2026-04-27T20:32:39',
    canonicalId: 'd77015d0-8e6d-4c51-a354-6938967247f4',
    allIds: ['d77015d0-8e6d-4c51-a354-6938967247f4', '6bd1f7e6-45c4-4030-955e-4d31cf57192e', '4046e371-e9e5-4a01-9639-3bd482042209'],
  },
];

type SessionRow = { id: string; created_at: string; fathom_recording_url: string | null };
type RecordingRow = {
  id: string;
  session_id: string;
  fathom_recording_url: string;
  fathom_recording_id: number;
  is_primary: boolean;
  duration_seconds: number | null;
  match_method: string | null;
};

function shortUrl(url: string | null): string {
  if (!url) return 'NULL';
  const m = url.match(/\/([^/]+)$/);
  return m ? `…/${m[1]}` : url.slice(-30);
}

async function main() {
  console.log('Fetching session rows and session_recordings for 10 risky groups…\n');

  const allIds = RISKY_GROUPS.flatMap(g => g.allIds);

  // Fetch session rows
  const { data: sessionRows, error: sErr } = await supabase
    .from('sessions')
    .select('id, created_at, fathom_recording_url')
    .in('id', allIds);
  if (sErr) { console.error('sessions error:', sErr.message); process.exit(1); }

  const sessionMap = new Map<string, SessionRow>(
    (sessionRows ?? []).map(r => [r.id, r as SessionRow])
  );

  // Fetch session_recordings (by session_id)
  const { data: recRows, error: rErr } = await supabase
    .from('session_recordings')
    .select('id, session_id, fathom_recording_url, fathom_recording_id, is_primary, duration_seconds, match_method')
    .in('session_id', allIds);
  if (rErr) { console.error('session_recordings error:', rErr.message); process.exit(1); }

  // Index recordings by session_id (one session can have multiple recordings)
  const recBySession = new Map<string, RecordingRow[]>();
  for (const r of (recRows ?? []) as RecordingRow[]) {
    if (!recBySession.has(r.session_id)) recBySession.set(r.session_id, []);
    recBySession.get(r.session_id)!.push(r);
  }

  console.log('══════════════════════════════════════════════════════════════════════════════════');
  console.log('URL TIEBREAKER ANALYSIS — 10 DIVERGED_RISKY GROUPS');
  console.log('══════════════════════════════════════════════════════════════════════════════════\n');

  const summary: {
    group: string;
    distinctUrls: number;
    conflict: boolean;
    pickedA: string;
    pickedB: string;
    pickedC: string;
    pickedD: string;
    allAgree: boolean;
  }[] = [];

  for (const g of RISKY_GROUPS) {
    console.log(`Group: ${g.groupKey}`);
    console.log(`Canonical session ID: ${g.canonicalId}`);
    console.log('');

    // Collect all non-null URLs across the group, with metadata
    interface UrlEntry {
      url: string;
      sessionId: string;
      sessionCreatedAt: string;
      recordings: RecordingRow[];
      isPrimary: boolean | null;
      maxDuration: number | null;
    }

    const urlEntries: UrlEntry[] = [];
    for (const sid of g.allIds) {
      const sess = sessionMap.get(sid);
      const url = sess?.fathom_recording_url ?? null;
      const recs = recBySession.get(sid) ?? [];

      if (url) {
        const existing = urlEntries.find(e => e.url === url);
        if (existing) {
          // Same URL already seen — merge recording info
          existing.recordings.push(...recs);
          if (recs.some(r => r.is_primary)) existing.isPrimary = true;
          const maxDur = recs.reduce((m, r) => Math.max(m, r.duration_seconds ?? 0), 0);
          if (maxDur > (existing.maxDuration ?? 0)) existing.maxDuration = maxDur;
        } else {
          const primaryRec = recs.find(r => r.is_primary) ?? null;
          const maxDur = recs.length > 0
            ? recs.reduce((m, r) => Math.max(m, r.duration_seconds ?? 0), 0)
            : null;
          urlEntries.push({
            url,
            sessionId: sid,
            sessionCreatedAt: sess?.created_at ?? '',
            recordings: recs,
            isPrimary: primaryRec ? true : (recs.length > 0 ? false : null),
            maxDuration: maxDur,
          });
        }
      }

      // Also check if any session_recordings rows exist that have a URL not on the session row itself
      for (const rec of recs) {
        const recUrl = rec.fathom_recording_url;
        if (recUrl && !urlEntries.find(e => e.url === recUrl)) {
          urlEntries.push({
            url: recUrl,
            sessionId: sid,
            sessionCreatedAt: sess?.created_at ?? '',
            recordings: [rec],
            isPrimary: rec.is_primary,
            maxDuration: rec.duration_seconds ?? null,
          });
        }
      }
    }

    // Also check for session_recordings on ALL sessions in group (including canonical)
    const allRecsInGroup: RecordingRow[] = g.allIds.flatMap(sid => recBySession.get(sid) ?? []);

    // Print URL table
    console.log(`  Distinct non-null fathom_recording_url values: ${urlEntries.length}`);
    console.log('');
    for (const e of urlEntries) {
      const recCount = allRecsInGroup.filter(r => r.fathom_recording_url === e.url).length;
      const primaryRecs = allRecsInGroup.filter(r => r.fathom_recording_url === e.url && r.is_primary);
      const maxDur = allRecsInGroup
        .filter(r => r.fathom_recording_url === e.url)
        .reduce((m, r) => Math.max(m, r.duration_seconds ?? 0), 0);

      console.log(`  URL: ${shortUrl(e.url)}`);
      console.log(`    Full: ${e.url}`);
      console.log(`    On session: ${e.sessionId} (created ${e.sessionCreatedAt.slice(0, 19)})`);
      console.log(`    session_recordings rows: ${recCount}`);
      console.log(`    is_primary=true rows: ${primaryRecs.length}  max duration_seconds: ${maxDur || 'n/a (no recording row)'}`);
    }
    console.log('');

    // Determine picks for each strategy
    const distinctUrls = [...new Set(urlEntries.map(e => e.url))];
    const conflict = distinctUrls.length > 1;

    // Strategy A: URL on session_recordings row where is_primary=true
    let pickedA = 'NONE';
    {
      const primaryRec = allRecsInGroup.find(r => r.is_primary && r.fathom_recording_url);
      if (primaryRec) pickedA = shortUrl(primaryRec.fathom_recording_url);
      else pickedA = 'NO is_primary row';
    }

    // Strategy B: URL with longest duration_seconds in session_recordings
    let pickedB = 'NONE';
    {
      const withDuration = allRecsInGroup.filter(r => r.fathom_recording_url && r.duration_seconds != null);
      if (withDuration.length > 0) {
        withDuration.sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0));
        pickedB = shortUrl(withDuration[0].fathom_recording_url);
      } else {
        pickedB = 'NO duration data';
      }
    }

    // Strategy C: URL on the most recent created_at session row
    let pickedC = 'NONE';
    {
      const withUrl = g.allIds
        .map(sid => sessionMap.get(sid))
        .filter(s => s?.fathom_recording_url)
        .sort((a, b) => ((b?.created_at ?? '') > (a?.created_at ?? '') ? 1 : -1));
      if (withUrl.length > 0) pickedC = shortUrl(withUrl[0]!.fathom_recording_url);
    }

    // Strategy D: arbitrary (first non-null)
    const pickedD = urlEntries.length > 0 ? shortUrl(urlEntries[0].url) + ' (+ WARN)' : 'NONE';

    const allAgree = distinctUrls.length <= 1;

    console.log(`  Strategy picks:`);
    console.log(`    (a) is_primary in session_recordings : ${pickedA}`);
    console.log(`    (b) longest duration_seconds         : ${pickedB}`);
    console.log(`    (c) most recent session created_at   : ${pickedC}`);
    console.log(`    (d) arbitrary first non-null         : ${pickedD}`);
    console.log(`  URL conflict (>1 distinct URL)?        : ${conflict ? '⚠️  YES' : '✅ NO — all rows agree'}`);
    console.log('');

    summary.push({
      group: g.groupKey,
      distinctUrls: distinctUrls.length,
      conflict,
      pickedA,
      pickedB,
      pickedC,
      pickedD,
      allAgree,
    });

    console.log('─'.repeat(80));
    console.log('');
  }

  // Summary table
  console.log('══════════════════════════════════════════════════════════════════════════════════');
  console.log('SUMMARY TABLE');
  console.log('══════════════════════════════════════════════════════════════════════════════════');
  console.log('Group                              | URLs | Conflict | (a)Primary | (b)Duration | (c)Recent | AllAgree');
  console.log('─'.repeat(110));
  for (const s of summary) {
    const g = s.group.slice(0, 34).padEnd(34);
    console.log(
      `${g} | ${String(s.distinctUrls).padEnd(4)} | ${(s.conflict ? '⚠️ YES' : '✅ NO ').padEnd(8)} | ` +
      `${s.pickedA.slice(0, 12).padEnd(12)} | ${s.pickedB.slice(0, 13).padEnd(13)} | ${s.pickedC.slice(0, 10).padEnd(10)} | ${s.allAgree ? '✅ YES' : '⚠️ NO'}`
    );
  }
  console.log('─'.repeat(110));

  const conflictCount = summary.filter(s => s.conflict).length;
  console.log(`\n Groups with >1 distinct URL (true conflict): ${conflictCount}`);
  console.log(`  Groups where all non-null URLs agree      : ${summary.length - conflictCount}`);
}

main().catch(e => { console.error(e); process.exit(1); });
