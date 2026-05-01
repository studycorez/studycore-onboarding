/**
 * Export two CSVs:
 *   scripts/output/missing-parents.csv      — active students missing a real parent email
 *   scripts/output/onboarding-not-sent.csv  — active students with parent email but onboarding not sent
 *
 * Read-only — no DB writes.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/export-missing-parents.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const OUT_DIR = resolve(process.cwd(), 'scripts/output');

/** Wrap a CSV cell value — quote if it contains comma, quote, or newline. */
function cell(value: string | null | undefined): string {
  const v = (value ?? '').toString().replace(/\r?\n/g, ' ');
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function row(...cols: (string | null | undefined)[]): string {
  return cols.map(cell).join(',');
}

const IMPORT_SUFFIX_RE = /@studycore\.import$/i;
const PLACEHOLDER_PATTERNS = [
  IMPORT_SUFFIX_RE,
  /placeholder/i,
  /example\.com$/i,
  /^test@/i,
  /^n\/a$/i,
  /^na$/i,
  /^none$/i,
  /^-+$/,
];

function isPlaceholder(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e) return true;
  return PLACEHOLDER_PATTERNS.some(re => re.test(e));
}

type MissingReason = 'no email' | 'placeholder' | 'same as student';

function missingReason(s: any): MissingReason | null {
  const pe = (s.parent_email ?? '').trim();
  if (!pe) return 'no email';
  if (pe.toLowerCase() === (s.email ?? '').trim().toLowerCase()) return 'same as student';
  if (isPlaceholder(pe)) return 'placeholder';
  return null; // has a real parent email
}

async function main() {
  const HR = '─'.repeat(60);
  mkdirSync(OUT_DIR, { recursive: true });

  // ── Fetch all active students ────────────────────────────────────
  const { data: students, error } = await supabase
    .from('students')
    .select('id, name, email, status, parent_email, parent_name, onboarding_email_sent')
    .eq('status', 'active')
    .order('name');

  if (error) throw new Error(`DB error: ${error.message}`);
  const active = (students ?? []) as any[];

  // ── Fetch signed/pending contracts for tutor names ──────────────
  const { data: contracts } = await supabase
    .from('contracts')
    .select('student_id, status, tutors(name)')
    .in('status', ['signed', 'pending']);

  const tutorMap: Record<string, string> = {};
  for (const c of (contracts ?? []) as any[]) {
    const sid = c.student_id as string;
    const name = (c.tutors as any)?.name ?? '—';
    if (!tutorMap[sid] || c.status === 'signed') tutorMap[sid] = name;
  }

  // ── Classify ─────────────────────────────────────────────────────
  const missing: { student: any; reason: MissingReason }[] = [];
  const notSent: any[] = [];

  for (const s of active) {
    const reason = missingReason(s);
    if (reason !== null) {
      missing.push({ student: s, reason });
    } else {
      // Has a real parent email
      if (!s.onboarding_email_sent) {
        notSent.push(s);
      }
    }
  }

  // ── Write missing-parents.csv ────────────────────────────────────
  const missingPath = resolve(OUT_DIR, 'missing-parents.csv');
  const missingLines = [
    row('Student Name', 'Student Email', 'Tutor Name', 'Status', 'Reason Missing'),
    ...missing.map(({ student: s, reason }) =>
      row(s.name, s.email, tutorMap[s.id] ?? '—', s.status, reason),
    ),
  ];
  writeFileSync(missingPath, missingLines.join('\n') + '\n', 'utf8');

  // ── Write onboarding-not-sent.csv ───────────────────────────────
  const notSentPath = resolve(OUT_DIR, 'onboarding-not-sent.csv');
  const notSentLines = [
    row('Student Name', 'Parent Email', 'Parent Name', 'Tutor Name'),
    ...notSent.map(s =>
      row(s.name, s.parent_email, s.parent_name, tutorMap[s.id] ?? '—'),
    ),
  ];
  writeFileSync(notSentPath, notSentLines.join('\n') + '\n', 'utf8');

  // ── Print summary ────────────────────────────────────────────────
  console.log(`\n${HR}`);
  console.log('  Export Complete');
  console.log(`${HR}\n`);

  console.log(`missing-parents.csv       → ${missing.length} rows`);
  const byReason: Record<string, number> = {};
  for (const { reason } of missing) byReason[reason] = (byReason[reason] ?? 0) + 1;
  for (const [reason, count] of Object.entries(byReason)) {
    console.log(`  ${reason.padEnd(22)} ${count}`);
  }
  console.log(`  Path: ${missingPath}`);

  console.log();
  console.log(`onboarding-not-sent.csv   → ${notSent.length} rows`);
  console.log(`  Path: ${notSentPath}`);

  console.log(`\n${HR}\n`);
}

main().catch(err => {
  console.error('\nFatal error:', err.message ?? err);
  process.exit(1);
});
