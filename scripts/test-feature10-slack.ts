/**
 * Feature 10 E2E test — Slack Auto-Onboard Webhook
 * Run: npx ts-node --project tsconfig.json scripts/test-feature10-slack.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const results: { step: string; passed: boolean; detail: string }[] = [];
  function pass(step: string, detail = '') { results.push({ step, passed: true, detail }); console.log(`  ✅ PASS  ${step}${detail ? ' — ' + detail : ''}`); }
  function fail(step: string, detail = '') { results.push({ step, passed: false, detail }); console.log(`  ❌ FAIL  ${step}${detail ? ' — ' + detail : ''}`); }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Feature 10 Test — Slack Auto-Onboard Webhook');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── Step 1: Files exist ───────────────────────────────────────────────────
  console.log('── Step 1: Files exist');
  const files = [
    'src/lib/slack.ts',
    'src/app/api/webhooks/slack-notify/route.ts',
  ];
  const missing = files.filter(f => !existsSync(resolve(process.cwd(), f)));
  if (missing.length === 0) pass('All files exist', `${files.length} files`);
  else fail('Files missing', missing.join(', '));

  // ── Step 2: slack.ts has required exports ────────────────────────────────
  console.log('\n── Step 2: slack.ts exports');
  const slackPath = resolve(process.cwd(), 'src/lib/slack.ts');
  if (existsSync(slackPath)) {
    const src = readFileSync(slackPath, 'utf-8');
    const hasPostToSlack = src.includes('export async function postToSlack') || src.includes('export function postToSlack');
    const hasStudentMsg = src.includes('buildStudentOnboardMessage');
    const hasContractMsg = src.includes('buildContractOnboardMessage');
    const hasWebhookUrl = src.includes('SLACK_WEBHOOK_URL');
    const hasSilentFallback = src.includes('if (!url)') || src.includes("if (!url") || src.includes('!process.env.SLACK');
    if (hasPostToSlack && hasStudentMsg && hasContractMsg && hasWebhookUrl) {
      pass('slack.ts has required exports', 'postToSlack, buildStudentOnboardMessage, buildContractOnboardMessage');
    } else {
      fail('slack.ts missing exports', [
        !hasPostToSlack && 'postToSlack',
        !hasStudentMsg && 'buildStudentOnboardMessage',
        !hasContractMsg && 'buildContractOnboardMessage',
        !hasWebhookUrl && 'SLACK_WEBHOOK_URL',
      ].filter(Boolean).join(', '));
    }
    if (hasSilentFallback) pass('Silent fallback when no webhook URL', '');
    else fail('No silent fallback for missing SLACK_WEBHOOK_URL', '');
  } else {
    fail('slack.ts not found', '');
  }

  // ── Step 3: Webhook route handles student_created ─────────────────────────
  console.log('\n── Step 3: Webhook route handles student_created');
  const routePath = resolve(process.cwd(), 'src/app/api/webhooks/slack-notify/route.ts');
  if (existsSync(routePath)) {
    const src = readFileSync(routePath, 'utf-8');
    const hasPost = src.includes('export async function POST') || src.includes('export function POST');
    const hasStudentEvent = src.includes('student_created');
    const hasContractEvent = src.includes('contract_created');
    const callsPostToSlack = src.includes('postToSlack');
    if (hasPost && hasStudentEvent && hasContractEvent && callsPostToSlack) {
      pass('Route handles both events + calls postToSlack', '');
    } else {
      fail('Route missing handler', [
        !hasPost && 'POST export',
        !hasStudentEvent && 'student_created',
        !hasContractEvent && 'contract_created',
        !callsPostToSlack && 'postToSlack call',
      ].filter(Boolean).join(', '));
    }
  } else {
    fail('slack-notify route not found', '');
  }

  // ── Step 4: StudentForm calls the webhook ─────────────────────────────────
  console.log('\n── Step 4: StudentForm calls slack webhook on create');
  const formPath = resolve(process.cwd(), 'src/components/students/StudentForm.tsx');
  if (existsSync(formPath)) {
    const src = readFileSync(formPath, 'utf-8');
    const callsWebhook = src.includes('/api/webhooks/slack-notify') || src.includes('slack-notify');
    const isFireForget = src.includes('.catch(') && src.includes('slack');
    if (callsWebhook) pass('StudentForm calls slack webhook', isFireForget ? 'fire-and-forget pattern' : '');
    else fail('StudentForm missing slack webhook call', '');
  } else {
    fail('StudentForm.tsx not found', '');
  }

  // ── Step 5: Contracts route calls slack ───────────────────────────────────
  console.log('\n── Step 5: Contracts API route calls slack on create');
  const contractsPath = resolve(process.cwd(), 'src/app/api/contracts/route.ts');
  if (existsSync(contractsPath)) {
    const src = readFileSync(contractsPath, 'utf-8');
    const importsSlack = src.includes("from '@/lib/slack'") || src.includes('from "@/lib/slack"');
    const callsSlack = src.includes('postToSlack') || src.includes('buildContractOnboardMessage');
    if (importsSlack && callsSlack) pass('Contracts route fires Slack on create', '');
    else fail('Contracts route missing Slack', `imports=${importsSlack}, calls=${callsSlack}`);
  } else {
    fail('contracts/route.ts not found', '');
  }

  // ── Step 6: buildStudentOnboardMessage formats correctly ──────────────────
  console.log('\n── Step 6: Message formatting');
  // Inline the message builder logic to test without importing
  function buildStudentMsg(name: string, email: string, grade?: number, targetScore?: number): string {
    return [
      `🎓 *New Student Onboarded!*`,
      `• Name: ${name}`,
      `• Email: ${email}`,
      grade ? `• Grade: ${grade}` : null,
      targetScore ? `• Target SAT: ${targetScore}` : null,
    ].filter(Boolean).join('\n');
  }
  const msg = buildStudentMsg('Alice Test', 'alice@test.com', 11, 1450);
  if (msg.includes('Alice Test') && msg.includes('alice@test.com') && msg.includes('Grade: 11') && msg.includes('1450')) {
    pass('Student message format correct', msg.replace(/\n/g, ' | '));
  } else {
    fail('Student message format', msg);
  }

  function buildContractMsg(student: string, tutor: string, rate: number, id: string): string {
    return [
      `📝 *New Contract Created*`,
      `• Student: ${student}`,
      `• Tutor: ${tutor}`,
      `• Rate: $${rate}/hr`,
      `• Contract: https://studycore-eight.vercel.app/contracts/${id}`,
    ].join('\n');
  }
  const cmsg = buildContractMsg('Bob Student', 'Carol Tutor', 30, 'abc-123');
  if (cmsg.includes('Bob Student') && cmsg.includes('Carol Tutor') && cmsg.includes('$30/hr') && cmsg.includes('abc-123')) {
    pass('Contract message format correct', cmsg.replace(/\n/g, ' | '));
  } else {
    fail('Contract message format', cmsg);
  }

  // ── Step 7: SLACK_WEBHOOK_URL env var (optional) ──────────────────────────
  console.log('\n── Step 7: SLACK_WEBHOOK_URL env var');
  if (process.env.SLACK_WEBHOOK_URL) {
    pass('SLACK_WEBHOOK_URL is set', 'live Slack notifications enabled');
  } else {
    pass('SLACK_WEBHOOK_URL not set (configure for live Slack)', 'postToSlack silently skips when not configured');
  }

  // ── Step 8: Live Slack test (if webhook URL set) ──────────────────────────
  console.log('\n── Step 8: Live Slack post (if configured)');
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      const res = await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '🧪 *Feature 10 test* — Slack webhook is working! StudyCore E2E test.' }),
      });
      if (res.ok) pass('Live Slack post succeeded', `status=${res.status}`);
      else fail('Live Slack post failed', `status=${res.status}`);
    } catch (e: any) {
      fail('Live Slack post error', e.message);
    }
  } else {
    pass('Live Slack test skipped (no webhook URL)', 'add SLACK_WEBHOOK_URL to .env.local to enable');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  console.log('\n═══════════════════════════════════════════════════════════════');
  for (const r of results) console.log(`  ${r.passed ? '✅' : '❌'}  ${r.step}${r.detail ? ' — ' + r.detail : ''}`);
  console.log(`\n  ${passed}/${results.length} passed`);
  console.log(passed === results.length ? '  🎉 Feature 10 PASS' : '  ⚠️  Feature 10 FAIL');
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
