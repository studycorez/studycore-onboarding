/**
 * Audit parent email coverage across all students.
 * Read-only — no DB writes.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/audit-parent-emails.ts
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

const PLACEHOLDER_PATTERNS = [
  /^test@/i,
  /placeholder/i,
  /example\.com$/i,
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

function hasRealParentEmail(s: any): boolean {
  const pe = (s.parent_email ?? '').trim();
  if (!pe) return false;
  if (isPlaceholder(pe)) return false;
  // Also skip if parent_email === student email
  if (pe.toLowerCase() === (s.email ?? '').trim().toLowerCase()) return false;
  return true;
}

async function main() {
  const HR = '─'.repeat(72);

  // Fetch all students with their assigned tutor via contracts
  const { data: students, error } = await supabase
    .from('students')
    .select('id, name, email, status, parent_email, parent_name, onboarding_email_sent')
    .order('name');

  if (error) throw new Error(`DB error: ${error.message}`);
  const all = (students ?? []) as any[];

  // Fetch latest signed/pending contract per student to get tutor name
  const { data: contracts } = await supabase
    .from('contracts')
    .select('student_id, tutor_id, status, tutors(name)')
    .in('status', ['signed', 'pending']);

  // Build map: student_id → tutor name (prefer signed over pending)
  const tutorMap: Record<string, string> = {};
  for (const c of (contracts ?? []) as any[]) {
    const sid = c.student_id;
    const tName = c.tutors?.name ?? '—';
    if (!tutorMap[sid] || c.status === 'signed') {
      tutorMap[sid] = tName;
    }
  }

  // ── Counts by status ────────────────────────────────────────────────────
  const statusCounts: Record<string, number> = {};
  for (const s of all) {
    const st = s.status ?? 'unknown';
    statusCounts[st] = (statusCounts[st] ?? 0) + 1;
  }

  const withParent    = all.filter(s => hasRealParentEmail(s));
  const withoutParent = all.filter(s => !hasRealParentEmail(s));

  const activeAll     = all.filter(s => s.status === 'active');
  const activeMissing = activeAll.filter(s => !hasRealParentEmail(s));
  const activePending = activeAll.filter(s => hasRealParentEmail(s) && !s.onboarding_email_sent);

  // ── Print ───────────────────────────────────────────────────────────────
  console.log(`\n${HR}`);
  console.log('  Parent Email Audit');
  console.log(`${HR}\n`);

  console.log('TOTAL STUDENTS BY STATUS');
  const statusOrder = ['active', 'paused', 'completed', 'refunded', 'unknown'];
  const otherStatuses = Object.keys(statusCounts).filter(s => !statusOrder.includes(s));
  for (const st of [...statusOrder, ...otherStatuses]) {
    if (statusCounts[st] != null) {
      console.log(`  ${st.padEnd(14)} ${String(statusCounts[st]).padStart(4)}`);
    }
  }
  console.log(`  ${'TOTAL'.padEnd(14)} ${String(all.length).padStart(4)}`);

  console.log(`\n${HR}`);
  console.log(`PARENT EMAIL COVERAGE (all students)`);
  console.log(`  Has real parent email:     ${withParent.length} / ${all.length}`);
  console.log(`  Missing / placeholder:     ${withoutParent.length} / ${all.length}`);

  // ── Active students missing parent email ───────────────────────────────
  console.log(`\n${HR}`);
  console.log(`ACTIVE STUDENTS MISSING PARENT EMAIL (${activeMissing.length})`);
  console.log(`${'Name'.padEnd(32)} ${'Student Email'.padEnd(36)} ${'Tutor'.padEnd(24)} Parent Email`);
  console.log('─'.repeat(120));
  for (const s of activeMissing) {
    const parentNote = s.parent_email
      ? `[placeholder: ${s.parent_email}]`
      : '(none)';
    console.log(
      `${(s.name ?? '').padEnd(32)} ${(s.email ?? '').padEnd(36)} ${(tutorMap[s.id] ?? '—').padEnd(24)} ${parentNote}`,
    );
  }

  // ── Active students with parent email but no onboarding sent ──────────
  console.log(`\n${HR}`);
  console.log(`ACTIVE STUDENTS WITH PARENT EMAIL — ONBOARDING NOT YET SENT (${activePending.length})`);
  console.log(`${'Name'.padEnd(32)} ${'Parent Email'.padEnd(36)} ${'Parent Name'.padEnd(24)} Sent?`);
  console.log('─'.repeat(100));
  for (const s of activePending) {
    const sent = s.onboarding_email_sent ? 'yes' : 'no';
    console.log(
      `${(s.name ?? '').padEnd(32)} ${(s.parent_email ?? '').padEnd(36)} ${(s.parent_name ?? '').padEnd(24)} ${sent}`,
    );
  }

  console.log(`\n${HR}`);
  console.log('SUMMARY');
  console.log(HR);
  console.log(`  Active students total:          ${activeAll.length}`);
  console.log(`  Active — has parent email:      ${activeAll.length - activeMissing.length}`);
  console.log(`  Active — missing parent email:  ${activeMissing.length}`);
  console.log(`  Active — onboarding pending:    ${activePending.length}`);
  console.log(`${HR}\n`);
}

main().catch(err => {
  console.error('\nFatal error:', err.message ?? err);
  process.exit(1);
});
