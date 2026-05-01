/**
 * Send parent onboarding emails to all students who have a parent_email
 * but have not yet received an onboarding email (onboarding_email_sent = false/null).
 *
 * Calls the production API route POST /api/parent-portal/send-onboarding
 * which uses the server's Resend API key (works in production).
 *
 * Usage:
 *   # Against production:
 *   APP_URL=https://your-production-url.vercel.app npx ts-node --project tsconfig.json scripts/send-parent-onboarding-emails.ts
 *
 *   # Dry run (list who would get emails, no sends):
 *   APP_URL=https://your-production-url.vercel.app npx ts-node --project tsconfig.json scripts/send-parent-onboarding-emails.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');
const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  const HR = '─'.repeat(72);
  console.log(`\n${HR}`);
  console.log('  Send Parent Onboarding Emails');
  console.log(`  Target: ${APP_URL}`);
  if (DRY_RUN) console.log('  *** DRY RUN — no emails will be sent ***');
  console.log(`${HR}\n`);

  // Find all students with parent_email set but no onboarding email sent
  const { data: students, error } = await supabase
    .from('students')
    .select('id, name, parent_email, parent_name, onboarding_email_sent')
    .not('parent_email', 'is', null)
    .or('onboarding_email_sent.is.null,onboarding_email_sent.eq.false')
    .order('name');

  if (error) throw new Error(`DB error: ${error.message}`);

  // Filter out students whose parent_email matches their own email
  const { data: allStudents } = await supabase
    .from('students')
    .select('id, email')
    .in('id', (students ?? []).map((s: any) => s.id));

  const emailByStudentId = new Map<string, string>();
  for (const s of (allStudents ?? []) as any[]) {
    emailByStudentId.set(s.id, (s.email ?? '').toLowerCase());
  }

  const toSend = (students ?? []).filter((s: any) => {
    const parentEmailLower = (s.parent_email ?? '').toLowerCase().trim();
    const studentEmail     = emailByStudentId.get(s.id) ?? '';
    // Skip if parent email = student email or looks like a placeholder
    if (!parentEmailLower) return false;
    if (parentEmailLower === studentEmail) {
      console.log(`  ⏭  ${s.name} — parent email matches student email, skipping`);
      return false;
    }
    return true;
  });

  console.log(`Found ${toSend.length} student(s) needing parent onboarding email.\n`);

  let sent = 0, failed = 0;

  for (const student of toSend as any[]) {
    if (DRY_RUN) {
      console.log(`  [dry-run] ${student.name} → ${student.parent_email}`);
      sent++;
      continue;
    }

    process.stdout.write(`  → ${student.name} (${student.parent_email})… `);

    try {
      const res = await fetch(`${APP_URL}/api/parent-portal/send-onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: student.id }),
      });

      if (res.ok) {
        console.log('✅  Sent');
        sent++;
      } else {
        const body = await res.json().catch(() => ({}));
        console.log(`✗ Failed (${res.status}): ${(body as any).error ?? 'unknown'}`);
        failed++;
      }
    } catch (err: any) {
      console.log(`✗ Network error: ${err.message}`);
      failed++;
    }

    // Small delay between sends
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n${HR}`);
  console.log('  SUMMARY');
  console.log(HR);
  console.log(`  Emails sent:   ${sent}`);
  if (failed > 0) console.log(`  Emails failed: ${failed}`);
  if (DRY_RUN) console.log('\n  *** DRY RUN — no emails were sent ***');
  console.log(`${HR}\n`);
}

main().catch(err => {
  console.error('\nFatal error:', err.message ?? err);
  process.exit(1);
});
