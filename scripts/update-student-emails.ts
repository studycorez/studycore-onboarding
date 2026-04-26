import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';
import { config } from 'dotenv';
import { writeFileSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

const GHL_API_KEY   = process.env.GHL_API_KEY!;
const LOCATION_ID   = '67091iYHBXVeSyRGbCoq';
const GHL_BASE      = 'https://services.leadconnectorhq.com';
const PLACEHOLDER_RE = /studycore\.import$/i;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── GHL types ────────────────────────────────────────────────────────────────

interface GhlContact {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  customField?: Array<{ id: string; field_value: string }>;
}

interface GhlResponse {
  contacts: GhlContact[];
  meta?: {
    total?: number;
    startAfter?: number;      // timestamp cursor for next page
    startAfterId?: string;    // id cursor for next page
    nextPageUrl?: string | null;
  };
}

// ── Supabase student type ─────────────────────────────────────────────────────

interface Student {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  parent_name: string | null;
  parent_email: string | null;
}

// ── Fuzzy name matching ───────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function tokenSort(s: string): string {
  return normalize(s).split(' ').sort().join(' ');
}

// Returns 0–1: 1 = perfect match, 0 = no similarity
function nameSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (tokenSort(a) === tokenSort(b)) return 0.98;

  // One name fully contains the other (handles "John Smith" vs "John A. Smith")
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  // All tokens of the shorter name appear in the longer name
  const tokensA = na.split(' ');
  const tokensB = nb.split(' ');
  const [shorter, longer] = tokensA.length <= tokensB.length
    ? [tokensA, tokensB]
    : [tokensB, tokensA];
  const allMatch = shorter.every(t => longer.includes(t));
  if (allMatch) return 0.85;

  // First + last name match (ignore middle)
  const firstA = tokensA[0], lastA = tokensA[tokensA.length - 1];
  const firstB = tokensB[0], lastB = tokensB[tokensB.length - 1];
  if (firstA === firstB && lastA === lastB) return 0.92;

  // Levenshtein on normalized full names
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 1 : Math.max(0, 1 - dist / maxLen);
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

const MATCH_THRESHOLD = 0.90;

function sharesFullWord(a: string, b: string): boolean {
  const wordsA = normalize(a).split(' ').filter(w => w.length >= 2);
  const wordsB = new Set(normalize(b).split(' ').filter(w => w.length >= 2));
  return wordsA.some(w => wordsB.has(w));
}

function bestMatch(
  studentName: string,
  contacts: GhlContact[],
): { contact: GhlContact; score: number } | null {
  let best: { contact: GhlContact; score: number } | null = null;
  for (const c of contacts) {
    const displayName = c.name ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
    // Reject contacts with very short names — likely junk data (e.g. "a", "ab")
    if (displayName.length < 4) continue;
    const score = nameSimilarity(studentName, displayName);
    if (score < MATCH_THRESHOLD) continue;
    // Must share at least one full word (prevents e.g. "Kai" matching "Kai Judex" at 0.90+ but also stops
    // short single-token names in GHL from matching unrelated students via Levenshtein alone)
    if (!sharesFullWord(studentName, displayName)) continue;
    if (!best || score > best.score) {
      best = { contact: c, score };
    }
  }
  return best;
}

// ── GHL pagination ────────────────────────────────────────────────────────────

async function fetchAllContacts(): Promise<GhlContact[]> {
  const all: GhlContact[] = [];
  let startAfter: number | undefined;
  let startAfterId: string | undefined;
  let page = 1;

  console.log('Fetching GHL contacts…');

  while (true) {
    const params = new URLSearchParams({ locationId: LOCATION_ID, limit: '100' });
    if (startAfter != null)   params.set('startAfter',   String(startAfter));
    if (startAfterId != null) params.set('startAfterId', startAfterId);

    const url = `${GHL_BASE}/contacts/?${params}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GHL_API_KEY}`,
        'Location-Id': LOCATION_ID,
        Version: '2021-07-28',
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GHL API error ${res.status}: ${body}`);
    }

    const data: GhlResponse = await res.json();
    if (!data.contacts?.length) break;

    all.push(...data.contacts);
    const total = data.meta?.total;
    console.log(`  page ${page}: ${data.contacts.length} contacts (${all.length}/${total ?? '?'})`);

    // v2 cursor pagination — stop when no next page cursors returned
    if (
      data.contacts.length < 100 ||
      data.meta?.nextPageUrl == null ||
      (data.meta.startAfter == null && data.meta.startAfterId == null)
    ) break;

    startAfter    = data.meta.startAfter;
    startAfterId  = data.meta.startAfterId;
    page++;
  }

  console.log(`Total GHL contacts fetched: ${all.length}\n`);
  return all;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function dropEmailUniqueConstraint() {
  // Run raw SQL via RPC — drop the constraint so shared family emails don't block updates.
  // Safe to run repeatedly; IF EXISTS means it's a no-op if already dropped.
  const { error } = await supabase.rpc('exec_sql', {
    query: 'ALTER TABLE students DROP CONSTRAINT IF EXISTS students_email_key;',
  }).single();
  // If exec_sql RPC doesn't exist, fall through — the migration file handles it.
  if (error && !error.message.includes('exec_sql')) {
    console.warn('Could not drop email constraint via RPC:', error.message);
    console.warn('Run supabase/migrations/002_drop_students_email_unique.sql manually if you see further unique-key errors.\n');
  } else if (!error) {
    console.log('✓ Dropped students_email_key constraint (or it was already gone)\n');
  }
}

async function main() {
  if (!GHL_API_KEY || GHL_API_KEY === 'your-ghl-api-key-here') {
    console.error('ERROR: Set GHL_API_KEY in .env.local before running this script.');
    process.exit(1);
  }

  // 0. Drop unique constraint on email so shared family emails don't block updates
  await dropEmailUniqueConstraint();

  // 1. Fetch all GHL contacts
  const contacts = await fetchAllContacts();

  // 2. Load all students from Supabase
  const { data: students, error: sErr } = await supabase
    .from('students')
    .select('id, name, email, phone, parent_name, parent_email')
    .order('name');

  if (sErr) throw new Error(`Supabase error: ${sErr.message}`);
  console.log(`Students in DB: ${students!.length}\n`);

  // 3. Match & update
  const reportLines: string[] = [
    'StudyCore — Student Email Update Report',
    `Generated: ${new Date().toISOString()}`,
    `GHL contacts fetched: ${contacts.length}`,
    `Students in DB: ${students!.length}`,
    '═'.repeat(60),
    '',
  ];

  const updated: string[] = [];
  const skipped: string[] = [];
  const noMatch: string[] = [];
  const noEmail: string[] = [];

  for (const student of students as Student[]) {
    const match = bestMatch(student.name, contacts);

    if (!match) {
      noMatch.push(student.name);
      reportLines.push(`✗ NO MATCH   ${student.name}`);
      continue;
    }

    const { contact, score } = match;
    const ghlEmail = contact.email?.trim() ?? '';
    const ghlPhone = contact.phone?.trim() ?? '';
    const displayName = contact.name ?? `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim();

    // Determine parent info: GHL sometimes stores parent as a tag or second contact.
    // We check for a "parent" tag and extract parent name from contact name if present.
    const parentTag = contact.tags?.find(t => /parent/i.test(t));
    const ghlParentName  = parentTag ? displayName : null;
    const ghlParentEmail = parentTag ? ghlEmail : null;

    const hasRealEmail = ghlEmail && !PLACEHOLDER_RE.test(ghlEmail) && ghlEmail.includes('@');
    const currentIsPlaceholder = PLACEHOLDER_RE.test(student.email);

    if (!hasRealEmail) {
      noEmail.push(student.name);
      reportLines.push(
        `~ NO EMAIL   ${student.name}  →  matched "${displayName}" (score ${score.toFixed(2)}) but no real email in GHL`,
      );
      continue;
    }

    // Build the update payload — only overwrite fields that are empty or placeholders
    const updates: Partial<Student> = {};

    if (hasRealEmail && (currentIsPlaceholder || !student.email)) {
      updates.email = ghlEmail;
    }
    if (ghlPhone && !student.phone) {
      updates.phone = ghlPhone;
    }
    if (ghlParentName && !student.parent_name) {
      updates.parent_name = ghlParentName;
    }
    if (ghlParentEmail && !student.parent_email) {
      updates.parent_email = ghlParentEmail;
    }

    if (Object.keys(updates).length === 0) {
      skipped.push(student.name);
      reportLines.push(
        `- SKIPPED    ${student.name}  →  matched "${displayName}" (score ${score.toFixed(2)}) — DB already has real data, no overwrite needed`,
      );
      continue;
    }

    let { error: upErr } = await supabase
      .from('students')
      .update(updates)
      .eq('id', student.id);

    // If a unique-email constraint is still present, retry without the email field
    // so the rest of the updates (phone, parent info) still land.
    if (upErr?.code === '23505' && updates.email) {
      const { email: _dropped, ...updatesWithoutEmail } = updates;
      if (Object.keys(updatesWithoutEmail).length > 0) {
        ({ error: upErr } = await supabase
          .from('students')
          .update(updatesWithoutEmail)
          .eq('id', student.id));
      } else {
        upErr = null; // nothing else to update, treat as skipped
      }
      reportLines.push(
        `~ EMAIL SKIP ${student.name}  →  email "${ghlEmail}" already exists on another student (shared family email), skipped email-only`,
      );
    }

    if (upErr) {
      reportLines.push(`! ERROR      ${student.name}  →  ${upErr.message}`);
      continue;
    }

    updated.push(student.name);
    const appliedUpdates = upErr === null && !updates.email
      ? { ...updates }
      : updates;
    const changeDesc = Object.entries(appliedUpdates)
      .map(([k, v]) => `${k}="${v}"`)
      .join(', ');
    reportLines.push(
      `✓ UPDATED    ${student.name}  →  matched "${displayName}" (score ${score.toFixed(2)})  [${changeDesc}]`,
    );
  }

  // 4. Summary
  reportLines.push('');
  reportLines.push('═'.repeat(60));
  reportLines.push('SUMMARY');
  reportLines.push(`  Updated:        ${updated.length}`);
  reportLines.push(`  Skipped (ok):   ${skipped.length}`);
  reportLines.push(`  No GHL email:   ${noEmail.length}`);
  reportLines.push(`  No match found: ${noMatch.length}`);
  reportLines.push('');

  if (noMatch.length) {
    reportLines.push('Students with no GHL match:');
    noMatch.forEach(n => reportLines.push(`  - ${n}`));
    reportLines.push('');
  }
  if (noEmail.length) {
    reportLines.push('Matched but GHL has no real email:');
    noEmail.forEach(n => reportLines.push(`  - ${n}`));
    reportLines.push('');
  }

  const report = reportLines.join('\n');
  console.log(report);

  writeFileSync(resolve(process.cwd(), 'update-emails-report.txt'), report, 'utf8');
  console.log('\nReport saved to update-emails-report.txt');
}

main().catch(err => { console.error(err); process.exit(1); });
