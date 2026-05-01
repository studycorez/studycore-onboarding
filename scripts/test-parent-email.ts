/**
 * Test-send a parent onboarding email using the real sendParentOnboardingEmail
 * function from src/lib/email.ts — guarantees the live template is tested.
 * NO DB WRITES — onboarding_email_sent is NOT updated.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-parent-email.ts
 *   APP_URL=https://your-prod-url npx tsx --env-file=.env.local scripts/test-parent-email.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { SignJWT } from 'jose';
import { sendParentOnboardingEmail } from '../src/lib/email';

const TEST_RECIPIENT = 'harshilch611@gmail.com';
const TEST_STUDENT   = 'Harshil Test';
const TEST_PARENT    = 'Harshil';
const TEST_TUTOR     = 'Jesse Palmer';

const APP_URL    = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const JWT_SECRET = process.env.TUTOR_JWT_SECRET ?? 'tutor-fallback-secret-change-me';
const FROM       = process.env.RESEND_FROM_EMAIL ?? '(not set)';

async function signParentJWT(parentEmail: string): Promise<string> {
  return new SignJWT({ parentEmail } as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(new TextEncoder().encode(JWT_SECRET));
}

async function main() {
  const HR = '─'.repeat(60);
  console.log(`\n${HR}`);
  console.log('  Test Parent Onboarding Email (live template)');
  console.log(`${HR}`);
  console.log(`  To:       ${TEST_RECIPIENT}`);
  console.log(`  From:     ${FROM}`);
  console.log(`  Student:  ${TEST_STUDENT}`);
  console.log(`  Tutor:    ${TEST_TUTOR}`);
  console.log(`  App URL:  ${APP_URL}`);
  console.log(`  ⚠️  NO DB writes — onboarding_email_sent will NOT be updated`);
  console.log(`${HR}\n`);

  const token     = await signParentJWT(TEST_RECIPIENT);
  const magicLink = `${APP_URL}/api/parent-portal/verify?token=${encodeURIComponent(token)}`;
  console.log(`Magic link: ${magicLink}\n`);

  console.log('Sending via Resend…\n');

  const result = await sendParentOnboardingEmail({
    parentEmail: TEST_RECIPIENT,
    parentName:  TEST_PARENT,
    studentName: TEST_STUDENT,
    magicLink,
    tutorName:   TEST_TUTOR,
  });

  console.log('Full Resend response:');
  console.log(JSON.stringify(result, null, 2));

  if ((result as any).error) {
    console.log(`\n❌ FAILED: ${(result as any).error?.message ?? JSON.stringify((result as any).error)}`);
  } else {
    console.log(`\n✅ Sent! Email ID: ${(result as any).data?.id ?? '(no id returned)'}`);
  }

  console.log(`\n${HR}\n`);
}

main().catch(err => {
  console.error('\nFatal error:', err.message ?? err);
  process.exit(1);
});
