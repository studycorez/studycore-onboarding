/**
 * Test-send a parent onboarding email to a specific address.
 * Replicates the logic in /api/parent-portal/send-onboarding without hitting the API route.
 * NO DB WRITES — onboarding_email_sent is NOT updated.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/test-parent-email.ts
 */

import { Resend } from 'resend';
import { SignJWT } from 'jose';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

// ── Config ────────────────────────────────────────────────────────────────
const TEST_RECIPIENT  = 'harshilch611@gmail.com';
const TEST_STUDENT    = 'Harshil Test';
const TEST_PARENT     = 'Harshil';

const RESEND_API_KEY  = process.env.RESEND_API_KEY!;
const FROM            = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const APP_URL         = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const JWT_SECRET      = process.env.TUTOR_JWT_SECRET ?? 'tutor-fallback-secret-change-me';

// ── JWT (same as signParentJWT in lib/parent-auth.ts) ────────────────────
async function signParentJWT(parentEmail: string): Promise<string> {
  return new SignJWT({ parentEmail } as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(new TextEncoder().encode(JWT_SECRET));
}

// ── Email HTML (same template as sendParentOnboardingEmail in lib/email.ts) ─
function buildHtml(params: {
  parentName: string;
  studentName: string;
  magicLink: string;
}): string {
  const NAVY = '#1e2090';
  const greeting = `Hi ${params.parentName},`;
  return `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .wrap{max-width:620px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.09);}
  .header{background:${NAVY};padding:28px 36px;}
  .header h1{color:#fff;margin:0;font-size:24px;font-weight:700;letter-spacing:-.3px;}
  .header p{color:#9ab0ff;margin:5px 0 0;font-size:14px;}
  .body{padding:36px;}
  .body p{color:#374151;line-height:1.7;margin:0 0 14px;font-size:15px;}
  .cta-wrap{text-align:center;margin:28px 0;}
  .btn{display:inline-block;background:${NAVY};color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:16px;}
  .steps{margin:24px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;}
  .step{display:flex;align-items:flex-start;gap:14px;padding:14px 18px;border-bottom:1px solid #f3f4f6;}
  .step:last-child{border-bottom:none;}
  .step-num{width:28px;height:28px;border-radius:50%;background:${NAVY};color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;}
  .step-title{font-weight:600;color:#111827;font-size:14px;margin:0 0 3px;}
  .step-desc{color:#6b7280;font-size:13px;margin:0;line-height:1.5;}
</style></head>
<body><div class="wrap">
  <div class="header"><h1>StudyCore</h1><p>Parent Portal</p></div>
  <div class="body">
    <p>${greeting}</p>
    <p>Welcome to StudyCore! ${params.studentName}'s tutoring sessions are set up and we've created a parent portal so you can stay involved every step of the way.</p>
    <div class="cta-wrap">
      <a href="${params.magicLink}" class="btn">Access Parent Portal →</a>
    </div>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div>
          <p class="step-title">View session notes</p>
          <p class="step-desc">See what was covered in each session, homework assigned, and tutor observations.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div>
          <p class="step-title">Track score progress</p>
          <p class="step-desc">Monitor practice test scores and target score milestones over time.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div>
          <p class="step-title">Stay in the loop</p>
          <p class="step-desc">Receive updates and communicate with the StudyCore team directly through the portal.</p>
        </div>
      </div>
    </div>
    <p style="font-size:13px;color:#9ca3af;margin-top:24px">This link is unique to your account and expires in 7 days. If you have any questions, reply to this email or contact us at info@studycore.net.</p>
  </div>
</div></body></html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const HR = '─'.repeat(60);
  console.log(`\n${HR}`);
  console.log('  Test Parent Onboarding Email');
  console.log(`${HR}`);
  console.log(`  To:       ${TEST_RECIPIENT}`);
  console.log(`  From:     ${FROM}`);
  console.log(`  Student:  ${TEST_STUDENT}`);
  console.log(`  App URL:  ${APP_URL}`);
  console.log(`  ⚠️  NO DB writes — onboarding_email_sent will NOT be updated`);
  console.log(`${HR}\n`);

  // Sign JWT
  const token     = await signParentJWT(TEST_RECIPIENT);
  const magicLink = `${APP_URL}/api/parent-portal/verify?token=${encodeURIComponent(token)}`;
  console.log(`Magic link: ${magicLink}\n`);

  // Send email
  const resend = new Resend(RESEND_API_KEY);
  console.log('Sending via Resend…\n');

  const result = await resend.emails.send({
    from:    FROM,
    to:      [TEST_RECIPIENT],
    subject: `Your StudyCore Parent Portal — ${TEST_STUDENT}`,
    html:    buildHtml({ parentName: TEST_PARENT, studentName: TEST_STUDENT, magicLink }),
  });

  console.log('Full Resend response:');
  console.log(JSON.stringify(result, null, 2));

  if ((result as any).error) {
    console.log(`\n❌ FAILED: ${(result as any).error?.message ?? JSON.stringify((result as any).error)}`);
    if (FROM === 'onboarding@resend.dev') {
      console.log('\n⚠️  Note: RESEND_FROM_EMAIL=onboarding@resend.dev is a Resend test address.');
      console.log('   In test mode, Resend only delivers to the account owner\'s verified email.');
      console.log('   To send to any address, set RESEND_FROM_EMAIL to a domain you\'ve verified');
      console.log('   in Resend (e.g. onboarding@studycore.net) and use a live API key.');
    }
  } else {
    console.log(`\n✅ Sent! Email ID: ${(result as any).data?.id ?? '(no id returned)'}`);
  }

  console.log(`\n${HR}\n`);
}

main().catch(err => {
  console.error('\nFatal error:', err.message ?? err);
  process.exit(1);
});
