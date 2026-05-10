/**
 * extract-gameplans.ts
 *
 * 1. Finds + uploads missing PDFs for Nicholas Zaccagnino and Saisaran Vigneshkumar from Slack
 * 2. Runs AI extraction (via deployed /api/students/{id}/extract-hours) for all students
 *    where game_plan_url is not null but target_score is null
 * 3. Prints before/after counts
 *
 * Run: npx tsx scripts/extract-gameplans.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

config({ path: resolve(process.cwd(), '.env.local') });

const SLACK_TOKEN    = process.env.SLACK_BOT_TOKEN!;
const SUPA_URL       = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPA_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY!;

if (!SLACK_TOKEN) throw new Error('SLACK_BOT_TOKEN not set');
if (!SUPA_URL || !SUPA_KEY) throw new Error('Supabase env vars missing');
if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');

const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const supabase = createClient(SUPA_URL, SUPA_KEY);

// ── Slack helpers ──────────────────────────────────────────────────────────────

async function slackGet(method: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`https://slack.com/api/${method}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
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
    const match = (data.channels as any[]).find((c: any) => c.name === name);
    if (match) return match.id;
    cursor = data.response_metadata?.next_cursor ?? '';
    if (!cursor) break;
  }
  throw new Error(`Channel "${name}" not found`);
}

async function fetchAllMessages(channelId: string): Promise<any[]> {
  const all: any[] = [];
  let cursor = '';
  while (true) {
    const params: Record<string, string> = { channel: channelId, limit: '200' };
    if (cursor) params.cursor = cursor;
    const data = await slackGet('conversations.history', params);
    all.push(...data.messages);
    process.stdout.write(`\r  Fetching messages: ${all.length}...`);
    cursor = data.response_metadata?.next_cursor ?? '';
    if (!cursor) break;
  }
  console.log();
  return all;
}

async function downloadSlackFile(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Storage upload ─────────────────────────────────────────────────────────────

async function uploadToStorage(studentId: string, buf: Buffer): Promise<string> {
  const path = `student-${studentId}/gameplan.pdf`;
  const { error } = await supabase.storage
    .from('game-plans')
    .upload(path, buf, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data: signed } = await supabase.storage
    .from('game-plans')
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  if (!signed?.signedUrl) throw new Error('Could not create signed URL');
  return signed.signedUrl;
}

// ── Local AI extraction (mirrors /api/students/[id]/extract-hours logic) ───────

interface Extracted {
  hours: number | null;
  target_score: number | null;
  test_date: string | null;
  weak_areas: string[] | null;
  reasoning: string;
}

async function runExtraction(studentId: string, _name: string): Promise<{
  ok: boolean;
  hours: number | null;
  target_score: number | null;
  test_date: string | null;
  weak_areas: string[] | null;
  error?: string;
}> {
  const fail = (error: string) => ({ ok: false, hours: null, target_score: null, test_date: null, weak_areas: null, error });

  try {
    // Download PDF from Supabase storage
    const storagePath = `student-${studentId}/gameplan.pdf`;
    const { data: fileData, error: dlErr } = await supabase.storage
      .from('game-plans')
      .download(storagePath);
    if (dlErr || !fileData) return fail(`Storage download failed: ${dlErr?.message ?? 'no data'}`);

    const base64 = Buffer.from(await fileData.arrayBuffer()).toString('base64');

    // Call Claude
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
    let parsed: Extracted;
    try { parsed = JSON.parse(jsonStr); } catch { return fail(`Could not parse AI response: ${raw.slice(0, 80)}`); }

    // Persist extracted fields
    const payload: Record<string, any> = {};
    if (typeof parsed.hours === 'number' && !isNaN(parsed.hours)) payload.purchased_hours = parsed.hours;
    if (typeof parsed.target_score === 'number' && !isNaN(parsed.target_score)) payload.target_score = parsed.target_score;
    if (parsed.test_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.test_date)) payload.test_date = parsed.test_date;
    if (Array.isArray(parsed.weak_areas) && parsed.weak_areas.length) payload.weak_areas = parsed.weak_areas;
    if (Object.keys(payload).length > 0) {
      await supabase.from('students').update(payload).eq('id', studentId);
    }

    return { ok: true, hours: parsed.hours, target_score: parsed.target_score, test_date: parsed.test_date, weak_areas: parsed.weak_areas };
  } catch (err: any) {
    return fail(err.message);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  Game Plan AI Extraction + Missing PDF Upload');
  console.log('══════════════════════════════════════════════════════════════\n');

  // ── Step 1: Check Jagger ──────────────────────────────────────────────────
  console.log('── Step 1: Jagger Villamar-Jones lookup');
  const { data: jaggerData } = await supabase
    .from('students')
    .select('id, name, status, email, grade, game_plan_url')
    .or('name.ilike.%jagger%,name.ilike.%villamar%');
  jaggers = jaggerData ?? [];
  if (jaggers.length === 0) {
    console.log('  ❌ Not found in DB under any variation of "Jagger" or "Villamar"');
    console.log('  📋 Needs manual add. From Slack filename: "Jagger F Villamar-Jones"');
    console.log('     File: Jagger F Villamar-Jones_GamePlan (1) (1).pdf');
  } else {
    console.log(`  ✅ Found ${jaggers.length} record(s):`);
    for (const s of jaggers) console.log(`     ${s.name} (status=${s.status}, email=${s.email})`);
  }

  // ── Step 2: Upload missing PDFs (Nicholas + Saisaran) ────────────────────
  console.log('\n── Step 2: Upload missing PDFs from Slack');

  const MISSING = [
    {
      studentId: '9c2eedce-fc21-4496-a91d-d4d90c68b960',
      name: 'Nicholas Zaccagnino',
      // URL-decoded filename to search for
      filenameParts: ["nick", "studycore", "sat"],
    },
    {
      studentId: 'c64662a0-3fdb-4acd-827e-2f0c24fcf7a5',
      name: 'Saisaran Vigneshkumar',
      filenameParts: ["sai"],
    },
  ];

  // Fetch Slack messages once
  const CHANNEL = process.env.SLACK_GAMEPLAN_CHANNEL ?? 'client-alerts';
  process.stdout.write(`  Finding #${CHANNEL}...`);
  const channelId = await findChannelId(CHANNEL);
  console.log(` ${channelId}`);
  const messages = await fetchAllMessages(channelId);

  // Collect all PDFs
  const allPdfs: Array<{ name: string; decoded: string; url: string }> = [];
  for (const msg of messages) {
    for (const f of msg.files ?? []) {
      if (f.mimetype === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf')) {
        let decoded = f.name;
        try { decoded = decodeURIComponent(f.name); } catch {}
        allPdfs.push({ name: f.name, decoded, url: f.url_private_download });
      }
    }
  }
  console.log(`  Found ${allPdfs.length} PDFs in channel`);

  const uploadedStudentIds: string[] = [];

  for (const { studentId, name, filenameParts } of MISSING) {
    console.log(`\n  ── ${name}`);

    // Already has a game plan?
    const { data: stu } = await supabase
      .from('students')
      .select('game_plan_url')
      .eq('id', studentId)
      .single();
    if (stu?.game_plan_url) {
      console.log('     ⏭  Already has game_plan_url — skipping upload, will extract');
      uploadedStudentIds.push(studentId);
      continue;
    }

    // Find best matching PDF
    const matched = allPdfs.filter(p =>
      filenameParts.every(part => p.decoded.toLowerCase().includes(part))
    );

    if (matched.length === 0) {
      console.log(`     ❌ No Slack PDF found matching [${filenameParts.join(', ')}]`);
      console.log('        All PDFs available:');
      for (const p of allPdfs) console.log(`          ${p.decoded}`);
      continue;
    }

    const pdf = matched[0];
    console.log(`     📄 Matched: "${pdf.decoded}"`);
    process.stdout.write('     ⬇️  Downloading...');
    const buf = await downloadSlackFile(pdf.url);
    console.log(` ${(buf.length / 1024).toFixed(1)} KB`);

    process.stdout.write('     ⬆️  Uploading to Supabase storage...');
    const signedUrl = await uploadToStorage(studentId, buf);
    console.log(' done');

    await supabase.from('students').update({
      game_plan_url: signedUrl,
      game_plan_uploaded_at: new Date().toISOString(),
    }).eq('id', studentId);
    console.log('     ✅ game_plan_url set');
    uploadedStudentIds.push(studentId);
  }

  // ── Step 3: Load all students needing extraction ──────────────────────────
  console.log('\n── Step 3: AI extraction for students with game_plan_url but no target_score');

  const { data: needsExtraction } = await supabase
    .from('students')
    .select('id, name, status, target_score')
    .not('game_plan_url', 'is', null)
    .is('target_score', null);

  if (!needsExtraction || needsExtraction.length === 0) {
    console.log('  ✅ All students with a game plan already have target_score set!');
  } else {
    console.log(`  ${needsExtraction.length} students need extraction:\n`);

    type ExtractionResult = {
      name: string;
      ok: boolean;
      hours: number | null;
      target_score: number | null;
      test_date: string | null;
      error?: string;
    };
    const extractionResults: ExtractionResult[] = [];

    for (const s of needsExtraction) {
      process.stdout.write(`  ⚙️  ${s.name.padEnd(30)}`);
      const result = await runExtraction(s.id, s.name);
      if (result.ok) {
        console.log(`→ hrs=${result.hours ?? '?'} target=${result.target_score ?? '?'} date=${result.test_date ?? '?'}`);
      } else {
        console.log(`→ ❌ ${result.error}`);
      }
      extractionResults.push({ name: s.name, ok: result.ok, hours: result.hours, target_score: result.target_score, test_date: result.test_date, error: result.error });
      // Small delay to avoid hammering the API
      await new Promise(r => setTimeout(r, 500));
    }

    // ── Step 4: Final counts ────────────────────────────────────────────────
    console.log('\n── Step 4: Final counts');

    const { data: afterStats } = await supabase
      .from('students')
      .select('id, name, game_plan_url, target_score')
      .not('game_plan_url', 'is', null);

    const withPlan   = afterStats?.length ?? 0;
    const withTarget = afterStats?.filter(s => s.target_score != null).length ?? 0;
    const stillNull  = afterStats?.filter(s => s.target_score == null).length ?? 0;

    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  FINAL SUMMARY');
    console.log('══════════════════════════════════════════════════════════════\n');

    // Extraction results table
    const col = (s: string, w: number) => s.slice(0, w).padEnd(w);
    console.log(col('Student', 32) + col('Status', 10) + col('Hours', 8) + col('Target', 8) + 'Test Date');
    console.log('─'.repeat(72));
    for (const r of extractionResults) {
      const status = r.ok ? '✅' : '❌';
      console.log(
        col(r.name, 32) +
        col(status, 10) +
        col(r.hours != null ? String(r.hours) : '—', 8) +
        col(r.target_score != null ? String(r.target_score) : '—', 8) +
        (r.test_date ?? '—'),
      );
      if (!r.ok) console.log(`  ${' '.repeat(30)}Error: ${r.error}`);
    }
    console.log('─'.repeat(72));

    const succeeded = extractionResults.filter(r => r.ok).length;
    const gotTarget = extractionResults.filter(r => r.target_score != null).length;

    console.log(`\n  Students processed:               ${extractionResults.length}`);
    console.log(`  Extraction succeeded:             ${succeeded}`);
    console.log(`  Got target_score from extraction: ${gotTarget}`);
    console.log(`\n  Students with game plan (total):  ${withPlan}`);
    console.log(`  → have target_score:              ${withTarget}`);
    console.log(`  → still missing target_score:     ${stillNull}`);

    if (stillNull > 0) {
      const missing = afterStats?.filter(s => s.target_score == null) ?? [];
      console.log('\n  Students still missing target_score (PDF may not contain it):');
      for (const s of missing) console.log(`     • ${s.name}`);
    }

    if (!jaggers || jaggers.length === 0) {
      console.log('\n  🛠  Still needs manual DB add: Jagger F Villamar-Jones');
      console.log('     File: Jagger F Villamar-Jones_GamePlan (1) (1).pdf (in #client-alerts)');
    }
  }

  console.log('\n══════════════════════════════════════════════════════════════\n');
}

// Need jaggers in scope for summary — hoist it
let jaggers: any[] | null = null;

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
