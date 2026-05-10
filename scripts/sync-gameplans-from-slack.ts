/**
 * sync-gameplans-from-slack.ts
 *
 * Fetches all PDF game plans from #client-alerts Slack channel,
 * matches each to a student, uploads to Supabase, and runs AI extraction.
 *
 * Usage:
 *   npx tsx scripts/sync-gameplans-from-slack.ts --dry-run
 *   npx tsx scripts/sync-gameplans-from-slack.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

config({ path: resolve(process.cwd(), '.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN!;
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!SLACK_TOKEN) throw new Error('SLACK_BOT_TOKEN is not set');
if (!SUPA_URL || !SUPA_KEY) throw new Error('Supabase env vars missing');

const supabase = createClient(SUPA_URL, SUPA_KEY);
const anthropic = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;

// ── Files to explicitly skip (wrong match confirmed during dry run) ────────────
const SKIP_FILES = new Set([
  'Sara_Kalangi_SAT_Game_Plan.pdf', // different Sara than Sara Abdelrahman
]);

// ── Slack helpers ──────────────────────────────────────────────────────────────

async function slackGet(method: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`https://slack.com/api/${method}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${SLACK_TOKEN}` },
  });
  const json = await res.json() as any;
  if (!json.ok) throw new Error(`Slack ${method} error: ${json.error}`);
  return json;
}

async function findChannelId(name: string): Promise<string> {
  let cursor = '';
  while (true) {
    const params: Record<string, string> = { types: 'public_channel,private_channel', limit: '200' };
    if (cursor) params.cursor = cursor;
    const data = await slackGet('conversations.list', params);
    const match = (data.channels as any[]).find(
      (c: any) => c.name === name || c.name === name.replace('#', ''),
    );
    if (match) return match.id;
    cursor = data.response_metadata?.next_cursor ?? '';
    if (!cursor) break;
  }
  throw new Error(`Channel "${name}" not found — make sure the bot is invited to it`);
}

interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  url_private_download: string;
  permalink: string;
}

interface SlackMessage {
  ts: string;
  text: string;
  files?: SlackFile[];
}

async function fetchAllMessages(channelId: string): Promise<SlackMessage[]> {
  const all: SlackMessage[] = [];
  let cursor = '';
  let page = 0;
  while (true) {
    page++;
    const params: Record<string, string> = { channel: channelId, limit: '200' };
    if (cursor) params.cursor = cursor;
    const data = await slackGet('conversations.history', params);
    all.push(...(data.messages as SlackMessage[]));
    process.stdout.write(`\r  Fetched ${all.length} messages (page ${page})...`);
    cursor = data.response_metadata?.next_cursor ?? '';
    if (!cursor) break;
  }
  console.log();
  return all;
}

async function downloadFile(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Student matching ───────────────────────────────────────────────────────────

interface Student {
  id: string;
  name: string;
  status: string;
  game_plan_url: string | null;
}

function normalizeForMatch(s: string): string {
  // Decode URL encoding, strip apostrophes/punctuation, lowercase
  try { s = decodeURIComponent(s); } catch {}
  return s.toLowerCase().replace(/[^a-z]/g, '');
}

/** Clean and tokenize a filename into name-candidate tokens. */
function tokensFromFilename(filename: string): string[] {
  // Decode URL encoding first (e.g. %20 → space, %E2%80%99 → apostrophe)
  let decoded = filename;
  try { decoded = decodeURIComponent(filename); } catch {}

  return decoded
    .replace(/\.pdf$/i, '')
    .replace(/[''`]/g, ' ')          // apostrophes → space so "Vishnu's" → "Vishnu s"
    .split(/[_\-\s&()+]+/)           // split on common separators including &
    .map(t => t.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(t => t.length > 1);
}

/** Extract student name(s) from nearby message text. Returns array (usually 1, sometimes 2 for shared plans). */
function namesFromText(text: string): string[] {
  const patterns = [
    /student\s+names?\s*:\s*\*?([^*\n<]+)\*?/gi,
    /student\s*:\s*\*?([^*\n<]+)\*?/gi,
    /name\s*:\s*\*?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\*?/gi,
    /•\s*Name\s*:\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/gi,
  ];
  const found: string[] = [];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      // The raw match may contain "Jose and Ali- twins" → split on " and ", "&", ","
      const raw = m[1].trim();
      const parts = raw.split(/\s+and\s+|\s*&\s*|\s*,\s*/i)
        .map(p => p.replace(/[-–]\s*\w+$/, '').trim()) // strip suffixes like "- twins"
        .filter(p => p.length > 1);
      found.push(...parts);
    }
  }
  // Deduplicate
  return [...new Set(found)];
}

/** Detect if this PDF is shared by multiple students (e.g. "Maaz & Rauha's SAT Prep Game Plan.pdf"). */
function multiStudentTargets(filename: string, messageText: string): string[] | null {
  // Decode filename
  let decoded = filename;
  try { decoded = decodeURIComponent(filename); } catch {}
  const base = decoded.replace(/\.pdf$/i, '');

  // Check for "&" or "and" between two name-looking tokens at the start of filename
  const multiRe = /^([A-Za-z]+)\s*[&]\s*([A-Za-z]+)/;
  const m = base.match(multiRe);
  if (m) return [m[1], m[2]];

  // Check message text for multiple students
  const names = namesFromText(messageText);
  if (names.length >= 2) return names;

  return null;
}

const STOP_WORDS = new Set([
  'sat', 'act', 'game', 'plan', 'gameplan', 'study', 'core', 'studycore',
  'tutor', 'prep', 'pdf', 'the', 'and', 'for', 'new', 'report', 'final',
  'updated', 'v2', 'v3', 'custom', 'copy', 'hr', '16h', '22hr', '24hr',
  '28hr', 'studycoreplan', 'ss', 'docx', 'is', 'on',
]);

function matchScore(student: Student, queryTokens: string[], candidateNames: string[]): number {
  const sNorm = normalizeForMatch(student.name);
  const sParts = student.name.toLowerCase().split(/\s+/);

  let score = 0;

  for (const token of queryTokens) {
    if (!STOP_WORDS.has(token) && token.length > 1) {
      if (sNorm.includes(token)) score += 2;
      if (sParts[0] === token) score += 3;  // first name exact
      if (sParts[sParts.length - 1] === token) score += 2;  // last name
    }
  }

  for (const candidateName of candidateNames) {
    const cNorm = normalizeForMatch(candidateName);
    if (cNorm === sNorm) { score += 20; break; }  // exact full name
    const cParts = candidateName.toLowerCase().split(/\s+/);
    for (const cp of cParts) {
      if (sParts.includes(cp) && cp.length > 2) score += 5;
    }
    // Partial: candidate first name == student first name
    if (cParts[0] && sParts[0] === cParts[0] && cParts[0].length > 2) score += 4;
  }

  return score;
}

function findBestMatch(
  students: Student[],
  queryTokens: string[],
  candidateNames: string[],
  minScore = 4,
): { student: Student; score: number; method: string } | null {
  const nameTokens = queryTokens.filter(t => !STOP_WORDS.has(t));

  const scored = students.map(s => ({
    student: s,
    score: matchScore(s, nameTokens, candidateNames),
  })).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < minScore) return null;

  const method = candidateNames.length > 0 &&
    candidateNames.some(cn =>
      normalizeForMatch(cn).includes(normalizeForMatch(best.student.name.split(' ')[0]))
    ) ? 'message_text' : 'filename';

  return { student: best.student, score: best.score, method };
}

/** Supabase fuzzy search for a name fragment across ALL statuses. */
async function fuzzySearchDB(namePart: string): Promise<Student[]> {
  const { data } = await supabase
    .from('students')
    .select('id, name, status, game_plan_url')
    .ilike('name', `%${namePart}%`);
  return (data ?? []) as Student[];
}

// ── AI extraction ──────────────────────────────────────────────────────────────

interface Extracted {
  hours: number | null;
  target_score: number | null;
  test_date: string | null;
  weak_areas: string[] | null;
  reasoning: string;
}

async function extractFromPDF(pdfBuffer: Buffer): Promise<Extracted | null> {
  if (!anthropic) {
    process.stdout.write(' [no ANTHROPIC_API_KEY — skipped]');
    return null;
  }
  const base64 = pdfBuffer.toString('base64');
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        } as any,
        {
          type: 'text',
          text: 'This is a StudyCore SAT/ACT tutoring game plan PDF. Extract the following:\n1. Total tutoring hours (look for "X hours per week for Y weeks", "total X hours", session counts × duration, etc.)\n2. Target SAT/ACT score (look for "goal score", "target score", "achieve X", "reach X", etc.)\n3. Test date (look for a specific SAT/ACT test date; format as YYYY-MM-DD if found)\n4. Weak areas (list subject areas needing improvement such as Math, Reading, Writing, Grammar, Algebra, etc.)\n\nRespond with ONLY a JSON object: {"hours": number|null, "target_score": number|null, "test_date": "YYYY-MM-DD"|null, "weak_areas": string[]|null, "reasoning": string}',
        },
      ],
    }],
  });

  const raw = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(jsonStr) as Extracted;
  } catch {
    console.log(`\n    ⚠️  Could not parse AI response: ${raw.slice(0, 100)}`);
    return null;
  }
}

// ── Upload to Supabase storage ─────────────────────────────────────────────────

async function uploadAndProcess(
  student: Student,
  pdfBuffer: Buffer,
  filename: string,
): Promise<{ signedUrl: string; extracted: Extracted | null }> {
  const path = `student-${student.id}/gameplan.pdf`;
  const { error } = await supabase.storage
    .from('game-plans')
    .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const TTL = 60 * 60 * 24 * 365 * 5; // 5 years
  const { data: signed } = await supabase.storage.from('game-plans').createSignedUrl(path, TTL);
  if (!signed?.signedUrl) throw new Error('Could not create signed URL');
  const signedUrl = signed.signedUrl;

  await supabase.from('students').update({
    game_plan_url: signedUrl,
    game_plan_uploaded_at: new Date().toISOString(),
  }).eq('id', student.id);

  process.stdout.write('     🤖 Running AI extraction...');
  const extracted = await extractFromPDF(pdfBuffer);
  console.log();

  if (extracted) {
    const payload: Record<string, any> = {};
    if (typeof extracted.hours === 'number' && !isNaN(extracted.hours)) payload.purchased_hours = extracted.hours;
    if (typeof extracted.target_score === 'number' && !isNaN(extracted.target_score)) payload.target_score = extracted.target_score;
    if (extracted.test_date && /^\d{4}-\d{2}-\d{2}$/.test(extracted.test_date)) payload.test_date = extracted.test_date;
    if (Array.isArray(extracted.weak_areas) && extracted.weak_areas.length) payload.weak_areas = extracted.weak_areas;
    if (Object.keys(payload).length > 0) {
      await supabase.from('students').update(payload).eq('id', student.id);
    }
    console.log(`        → hrs=${extracted.hours ?? '?'} target=${extracted.target_score ?? '?'} date=${extracted.test_date ?? '?'} weak=[${extracted.weak_areas?.join(', ') ?? '—'}]`);
  }

  return { signedUrl, extracted: extracted ?? null };
}

// ── Result types ───────────────────────────────────────────────────────────────

type Action = 'uploaded' | 'skipped_explicitly' | 'skipped_has_plan' | 'needs_manual' | 'error';

interface Result {
  filename: string;
  matchedStudents: string[];
  action: Action;
  extracted?: Partial<Extracted>;
  error?: string;
  note?: string;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  Slack → Supabase Game Plan Sync  ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  // Load ALL students (active + completed + any status) so completed ones aren't excluded
  const { data: students, error: stuErr } = await supabase
    .from('students')
    .select('id, name, status, game_plan_url')
    .in('status', ['active', 'completed', 'inactive', 'paused', 'lead']);
  if (stuErr) throw new Error(`Failed to load students: ${stuErr.message}`);
  console.log(`  Loaded ${students!.length} students from Supabase (all statuses)`);

  const CHANNEL_NAME = process.env.SLACK_GAMEPLAN_CHANNEL ?? 'game-plans';
  process.stdout.write(`  Finding #${CHANNEL_NAME} channel...`);
  const channelId = await findChannelId(CHANNEL_NAME);
  console.log(` found: ${channelId}`);

  console.log('  Fetching messages...');
  const messages = await fetchAllMessages(channelId);
  console.log(`  Total messages: ${messages.length}`);

  const pdfs: Array<{ file: SlackFile; messageText: string }> = [];
  for (const msg of messages) {
    if (!msg.files?.length) continue;
    for (const f of msg.files) {
      if (f.mimetype === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        pdfs.push({ file: f, messageText: msg.text || '' });
      }
    }
  }
  console.log(`\n  Found ${pdfs.length} PDF file(s) across ${messages.length} messages\n`);

  if (pdfs.length === 0) { console.log('  No PDFs found. Done.\n'); return; }

  const results: Result[] = [];

  for (const { file, messageText } of pdfs) {
    console.log(`\n  ── ${file.name}`);

    // ── Explicit skip ──────────────────────────────────────────────────────
    if (SKIP_FILES.has(file.name)) {
      console.log('     ⏭  Explicitly skipped (wrong match confirmed in dry run)');
      results.push({ filename: file.name, matchedStudents: [], action: 'skipped_explicitly', note: 'Manual skip' });
      continue;
    }

    // ── Decode filename ────────────────────────────────────────────────────
    let decodedName = file.name;
    try { decodedName = decodeURIComponent(file.name); } catch {}

    const tokens = tokensFromFilename(file.name);
    const candidateNames = namesFromText(messageText);
    const multiTargets = multiStudentTargets(file.name, messageText);

    // ── Determine target student(s) ────────────────────────────────────────
    let targets: Student[] = [];

    if (multiTargets && multiTargets.length >= 2) {
      // Multi-student PDF: match each name separately
      console.log(`     👥 Multi-student PDF: ${multiTargets.join(', ')}`);
      for (const namePart of multiTargets) {
        const hit = findBestMatch(students!, tokensFromFilename(namePart), [namePart], 3);
        if (hit) {
          console.log(`        → ${namePart} matched: ${hit.student.name} (score=${hit.score})`);
          targets.push(hit.student);
        } else {
          // Fuzzy DB search
          const fuzzy = await fuzzySearchDB(namePart);
          if (fuzzy.length === 1) {
            console.log(`        → ${namePart} fuzzy-matched: ${fuzzy[0].name}`);
            targets.push(fuzzy[0]);
          } else {
            console.log(`        → ${namePart}: no match found`);
          }
        }
      }
    } else {
      // Single student PDF
      const hit = findBestMatch(students!, tokens, candidateNames);
      if (hit) {
        targets.push(hit.student);
      } else {
        // Fuzzy fallback: try first token(s) from filename that look like names
        const nameHints = tokens.filter(t => !STOP_WORDS.has(t) && /^[a-z]{3,}$/.test(t));
        for (const hint of nameHints.slice(0, 2)) {
          const fuzzy = await fuzzySearchDB(hint);
          if (fuzzy.length === 1) {
            console.log(`     🔎 Fuzzy match on "${hint}": ${fuzzy[0].name} (status=${fuzzy[0].status})`);
            targets.push(fuzzy[0]);
            break;
          } else if (fuzzy.length > 1) {
            // Multiple hits — try to narrow with second token
            const hint2 = nameHints[1];
            if (hint2) {
              const narrowed = fuzzy.filter(s => normalizeForMatch(s.name).includes(hint2));
              if (narrowed.length === 1) {
                console.log(`     🔎 Fuzzy match on "${hint} ${hint2}": ${narrowed[0].name} (status=${narrowed[0].status})`);
                targets.push(narrowed[0]);
                break;
              }
            }
          }
        }
      }
    }

    // ── No match at all ────────────────────────────────────────────────────
    if (targets.length === 0) {
      // Last attempt: check message text for name patterns and search DB
      const msgNames = namesFromText(messageText);
      let found = false;
      for (const n of msgNames) {
        const parts = n.split(/\s+/);
        for (const p of parts) {
          if (p.length < 3) continue;
          const fuzzy = await fuzzySearchDB(p);
          if (fuzzy.length === 1) {
            console.log(`     🔎 Fuzzy match via message name "${n}" → "${p}": ${fuzzy[0].name} (status=${fuzzy[0].status})`);
            targets.push(fuzzy[0]);
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    if (targets.length === 0) {
      // Extract likely name from filename for the "needs manual" note
      const likelyName = tokens.filter(t => !STOP_WORDS.has(t)).slice(0, 2).join(' ');
      console.log(`     ❌ No match — needs manual add (likely: "${likelyName}")`);
      results.push({
        filename: file.name,
        matchedStudents: [],
        action: 'needs_manual',
        note: likelyName || 'unknown',
      });
      continue;
    }

    // ── Process each matched student ───────────────────────────────────────
    const uploadedNames: string[] = [];
    let lastExtracted: Partial<Extracted> | undefined;
    let anyError = false;

    for (const student of targets) {
      console.log(`     ✅ → ${student.name} (status=${student.status}, plan=${student.game_plan_url ? 'already set' : 'null'})`);

      if (student.game_plan_url) {
        console.log('        ⏭  Already has a game plan — skipping this student');
        results.push({
          filename: file.name,
          matchedStudents: [student.name],
          action: 'skipped_has_plan',
        });
        continue;
      }

      if (DRY_RUN) {
        console.log('        🔍 [DRY RUN] Would upload + extract');
        results.push({ filename: file.name, matchedStudents: [student.name], action: 'skipped_has_plan', note: 'dry_run' });
        continue;
      }

      try {
        console.log('     ⬇️  Downloading...');
        const pdfBuffer = await downloadFile(file.url_private_download);
        console.log(`        Size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
        console.log('     ⬆️  Uploading to Supabase...');
        const { signedUrl, extracted } = await uploadAndProcess(student, pdfBuffer, file.name);
        student.game_plan_url = signedUrl; // update in-memory
        uploadedNames.push(student.name);
        if (extracted) lastExtracted = { hours: extracted.hours, target_score: extracted.target_score, test_date: extracted.test_date };
      } catch (err: any) {
        console.log(`     ❌ Error for ${student.name}: ${err.message}`);
        results.push({ filename: file.name, matchedStudents: [student.name], action: 'error', error: err.message });
        anyError = true;
      }
    }

    if (uploadedNames.length > 0) {
      results.push({
        filename: file.name,
        matchedStudents: uploadedNames,
        action: 'uploaded',
        extracted: lastExtracted,
      });
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n\n══════════════════════════════════════════════════════════════');
  console.log('  FINAL SUMMARY');
  console.log('══════════════════════════════════════════════════════════════\n');

  const col = (s: string, w: number) => s.slice(0, w).padEnd(w);
  console.log(col('File', 42) + col('Student(s)', 28) + col('Action', 18) + 'AI Extracted');
  console.log('─'.repeat(120));

  const actionLabel: Record<Action, string> = {
    uploaded: '✅ uploaded',
    skipped_explicitly: '⏭  skipped',
    skipped_has_plan: '⏭  has plan',
    needs_manual: '🛠  needs manual',
    error: '🔥 error',
  };

  for (const r of results) {
    const ext = r.extracted
      ? `hrs=${r.extracted.hours ?? '?'} tgt=${r.extracted.target_score ?? '?'} date=${r.extracted.test_date ?? '?'}`
      : r.note === 'dry_run' ? '[dry run]' : '';
    const label = r.note === 'dry_run' ? '🔍 dry run' : actionLabel[r.action];
    console.log(
      col(r.filename, 42) +
      col(r.matchedStudents.join(', ') || (r.note ?? '—'), 28) +
      col(label, 18) +
      ext,
    );
  }

  console.log('─'.repeat(120));

  const uploaded = results.filter(r => r.action === 'uploaded');
  const hasPlan  = results.filter(r => r.action === 'skipped_has_plan' && r.note !== 'dry_run');
  const manual   = results.filter(r => r.action === 'needs_manual');
  const skipped  = results.filter(r => r.action === 'skipped_explicitly');
  const errors   = results.filter(r => r.action === 'error');
  const dryRuns  = results.filter(r => r.note === 'dry_run');

  console.log(`\n  Total PDFs processed:    ${results.length}`);
  if (DRY_RUN) {
    console.log(`  Would upload:            ${dryRuns.length}`);
  } else {
    console.log(`  Uploaded:                ${uploaded.length}`);
    console.log(`  Errors:                  ${errors.length}`);
  }
  console.log(`  Already had plan:        ${hasPlan.length}`);
  console.log(`  Explicitly skipped:      ${skipped.length}`);
  console.log(`  Needs manual add to DB:  ${manual.length}`);

  if (manual.length > 0) {
    console.log('\n  ── Students not found in DB (add manually):');
    for (const r of manual) {
      console.log(`     • ${r.filename}`);
      if (r.note) console.log(`       Likely name: "${r.note}"`);
    }
  }

  if (errors.length > 0) {
    console.log('\n  ── Errors:');
    for (const r of errors) {
      console.log(`     • ${r.filename} (${r.matchedStudents[0]}): ${r.error}`);
    }
  }

  console.log('\n══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
