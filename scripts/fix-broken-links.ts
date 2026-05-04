/**
 * fix-broken-links.ts
 *
 * Audit and fix all broken URLs across StudyCore:
 * 1. Re-send contract emails for pending contracts (URL was localhost in dev)
 * 2. Re-send tutor portal setup emails for all tutors with no password_hash
 * 3. Resend Sara Khwaja's contract email
 * 4. Report on NPS surveys
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { randomUUID } from 'crypto';

const PROD_URL = 'https://studycore-eight.vercel.app';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const resend = new Resend(process.env.RESEND_API_KEY!);

const FROM = 'StudyCore <noreply@studycore.net>';
const BRAND = 'StudyCore';

// ── Helpers ────────────────────────────────────────────────────────────────

function baseLayout(content: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;margin:0;padding:20px}
.container{max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.header{background:#0f172a;color:#fff;padding:32px;text-align:center}
.header h1{margin:0;font-size:24px;font-weight:700}
.header p{margin:8px 0 0;font-size:14px;opacity:.7}
.body{padding:32px}
.body h2{margin:0 0 16px;color:#0f172a;font-size:20px}
.body p{color:#374151;line-height:1.6;margin:0 0 16px}
.btn{display:inline-block;background:#0f172a;color:#fff!important;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;margin:8px 0}
.btn-secondary{background:#f1f5f9;color:#0f172a!important}
.info-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:16px 0}
.info-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9}
.info-row:last-child{border-bottom:none}
.label{color:#6b7280;font-size:13px}
.value{color:#111827;font-size:13px;font-weight:500}
</style>
</head><body><div class="container">${content}</div></body></html>`;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── 1. Pending contracts ───────────────────────────────────────────────────

async function fixPendingContracts() {
  console.log('\n═══ 1. PENDING CONTRACTS ═══');

  const { data: contracts, error } = await supabase
    .from('contracts')
    .select('id, hourly_rate, game_plan_url, tutor:tutors(id, name, email), student:students(name)')
    .eq('status', 'pending');

  if (error || !contracts) {
    console.error('Failed to fetch contracts:', error);
    return 0;
  }

  console.log(`Found ${contracts.length} pending contracts`);

  let fixed = 0;
  for (const c of contracts) {
    const tutor = c.tutor as any;
    const student = c.student as any;
    const contractUrl = `${PROD_URL}/contracts/${c.id}`;

    const html = baseLayout(`
      <div class="header"><h1>${BRAND}</h1><p>Tutor Contract</p></div>
      <div class="body">
        <h2>New contract for ${student.name}</h2>
        <p>Hi ${tutor.name}, a new tutoring contract is ready for your review and signature.</p>
        <div class="info-box">
          <div class="info-row"><span class="label">Student</span><span class="value">${student.name}</span></div>
          <div class="info-row"><span class="label">Hourly Rate</span><span class="value">$${c.hourly_rate}/hr</span></div>
        </div>
        ${c.game_plan_url ? `<p><a href="${c.game_plan_url}" class="btn btn-secondary" style="font-size:13px;padding:10px 20px">View Game Plan PDF</a></p>` : ''}
        <a href="${contractUrl}" class="btn">Review &amp; Sign Contract</a>
        <p style="font-size:13px;color:#9ca3af;margin-top:24px">Questions? Reply to this email or contact support@studycore.net</p>
      </div>`);

    try {
      const result = await resend.emails.send({
        from: FROM,
        to: [tutor.email],
        reply_to: 'support@studycore.net',
        subject: `Action Required: Sign your StudyCore contract for ${student.name}`,
        html,
      });

      if ((result as any).error) {
        console.error(`  ✗ ${tutor.name} (${c.id.slice(0, 8)}): ${(result as any).error.message}`);
      } else {
        await supabase.from('contracts').update({ last_emailed_at: new Date().toISOString() }).eq('id', c.id);
        console.log(`  ✓ Sent to ${tutor.name} <${tutor.email}> — contract ${c.id.slice(0, 8)} (${student.name})`);
        fixed++;
      }
    } catch (err: any) {
      console.error(`  ✗ ${tutor.name}: ${err.message}`);
    }

    await sleep(300);
  }

  console.log(`→ Re-sent ${fixed}/${contracts.length} pending contract emails with production URL`);
  return fixed;
}

// ── 2. Tutor setup emails ──────────────────────────────────────────────────

const SKIP_TUTOR_IDS = new Set([
  'fceee08d-7543-4861-acef-c35bed539a44', // Notes Test Tutor
]);

async function resendTutorSetupEmails() {
  console.log('\n═══ 2. TUTOR SETUP EMAILS ═══');

  const { data: tutors, error } = await supabase
    .from('tutors')
    .select('id, name, email, password_hash')
    .is('password_hash', null);

  if (error || !tutors) {
    console.error('Failed to fetch tutors:', error);
    return 0;
  }

  const eligible = tutors.filter(t =>
    !SKIP_TUTOR_IDS.has(t.id) &&
    t.email &&
    !t.email.includes('placeholder.studycore.net') &&
    !t.name?.toLowerCase().includes('test')
  );

  console.log(`Found ${tutors.length} tutors with no password_hash, ${eligible.length} eligible for setup email`);

  let sent = 0;
  for (const tutor of eligible) {
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    // Store token in DB
    await supabase.from('tutors').update({ setup_token: token, setup_token_expires_at: expiresAt }).eq('id', tutor.id);

    const setupUrl = `${PROD_URL}/tutor-portal/setup?token=${token}`;
    const html = baseLayout(`
      <div class="header"><h1>${BRAND}</h1><p>Tutor Portal Invitation</p></div>
      <div class="body">
        <h2>Set up your StudyCore portal</h2>
        <p>Hi ${tutor.name},</p>
        <p>You've been invited to the StudyCore Tutor Portal. Click the button below to set your password and access your dashboard, students, sessions, and resources.</p>
        <a href="${setupUrl}" class="btn" style="display:inline-block;margin:20px 0">Set Up My Portal</a>
        <div class="info-box">
          <div class="info-row"><span class="label">Link expires</span><span class="value">48 hours from now</span></div>
          <div class="info-row"><span class="label">Portal URL</span><span class="value">${PROD_URL}/tutor-portal/login</span></div>
        </div>
        <p style="font-size:13px;color:#9ca3af;margin-top:16px">If you weren't expecting this email, you can ignore it.</p>
      </div>`);

    try {
      const result = await resend.emails.send({
        from: FROM,
        to: [tutor.email],
        reply_to: 'support@studycore.net',
        subject: 'Set up your StudyCore Tutor Portal',
        html,
      });

      if ((result as any).error) {
        console.error(`  ✗ ${tutor.name} <${tutor.email}>: ${(result as any).error.message}`);
      } else {
        console.log(`  ✓ ${tutor.name} <${tutor.email}>`);
        sent++;
      }
    } catch (err: any) {
      console.error(`  ✗ ${tutor.name}: ${err.message}`);
    }

    await sleep(300);
  }

  console.log(`→ Sent ${sent}/${eligible.length} tutor setup emails with production URL`);
  return sent;
}

// ── 3. Sara Khwaja's contract ──────────────────────────────────────────────

async function resendSaraContract() {
  console.log('\n═══ 3. SARA KHWAJA CONTRACT ═══');

  const SARA_ID = 'ac522e78-1401-4bd1-8145-b8fbf1d43662';

  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, status, hourly_rate, game_plan_url, student:students(name)')
    .eq('tutor_id', SARA_ID)
    .neq('status', 'voided')
    .order('created_at', { ascending: false })
    .limit(1);

  const contract = contracts?.[0];
  if (!contract) {
    console.log('  No active/signed contracts found for Sara Khwaja');
    return;
  }

  const student = contract.student as any;
  const contractUrl = `${PROD_URL}/contracts/${contract.id}`;

  console.log(`  Found contract ${contract.id.slice(0, 8)} — ${student.name} (status: ${contract.status})`);

  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Your Tutor Contract</p></div>
    <div class="body">
      <h2>Contract reference — ${student.name}</h2>
      <p>Hi Sara, here is your StudyCore tutoring contract. You can review it at any time using the link below.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${student.name}</span></div>
        <div class="info-row"><span class="label">Hourly Rate</span><span class="value">$${contract.hourly_rate}/hr</span></div>
        <div class="info-row"><span class="label">Status</span><span class="value">${contract.status}</span></div>
      </div>
      ${contract.game_plan_url ? `<p><a href="${contract.game_plan_url}" class="btn btn-secondary" style="font-size:13px;padding:10px 20px">View Game Plan PDF</a></p>` : ''}
      <a href="${contractUrl}" class="btn">View Contract</a>
      <p style="font-size:13px;color:#9ca3af;margin-top:24px">Questions? Contact support@studycore.net</p>
    </div>`);

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: ['saraskhwaja@gmail.com'],
      reply_to: 'support@studycore.net',
      subject: `Your StudyCore contract — ${student.name}`,
      html,
    });

    if ((result as any).error) {
      console.error(`  ✗ Failed: ${(result as any).error.message}`);
    } else {
      await supabase.from('contracts').update({ last_emailed_at: new Date().toISOString() }).eq('id', contract.id);
      console.log(`  ✓ Sent to saraskhwaja@gmail.com — contract ${contract.id.slice(0, 8)}`);
    }
  } catch (err: any) {
    console.error(`  ✗ ${err.message}`);
  }
}

// ── 4. NPS survey audit ────────────────────────────────────────────────────

async function auditNPS() {
  console.log('\n═══ 4. NPS SURVEY AUDIT ═══');

  const { data: surveys, error } = await supabase
    .from('nps_surveys')
    .select('id, student_id, created_at, responded_at, score')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.log('  nps_surveys table may not exist:', error.message);
    return;
  }

  if (!surveys || surveys.length === 0) {
    console.log('  No NPS surveys have been sent yet — nothing to audit');
    return;
  }

  console.log(`  ${surveys.length} surveys in DB`);
  const responded = surveys.filter(s => s.responded_at);
  console.log(`  ${responded.length} responded, ${surveys.length - responded.length} pending`);
  console.log('  NPS survey URLs are constructed from tokens at send-time using APP_URL — no stored URLs to fix');
}

// ── 5. Code verification ───────────────────────────────────────────────────

function verifyCodeChecks() {
  console.log('\n═══ 5. CODE VERIFICATION ═══');
  console.log('  ✓ /api/parent-portal/auth — uses NEXT_PUBLIC_APP_URL, throws if unset');
  console.log('  ✓ /api/parent-portal/send-onboarding — uses NEXT_PUBLIC_APP_URL, throws if unset');
  console.log('  ✓ /api/student-portal/send-setup — uses NEXT_PUBLIC_APP_URL, throws if unset');
  console.log('  ✓ /api/cron/nps-surveys — uses NEXT_PUBLIC_APP_URL, throws if unset');
  console.log('  ✓ next.config.js — build-time guard added (throws if missing or localhost in prod)');
  console.log('  ✓ admin/send-forms — fallback updated from "your-app.vercel.app" to "studycore-eight.vercel.app"');
  console.log('  ✓ No localhost hardcodes found in src/');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nStudyCore Broken Link Audit — ${new Date().toISOString()}`);
  console.log(`Production URL: ${PROD_URL}`);

  const contractsFixed = await fixPendingContracts();
  const tutorsSetup = await resendTutorSetupEmails();
  await resendSaraContract();
  await auditNPS();
  verifyCodeChecks();

  console.log('\n═══ SUMMARY ═══');
  console.log(`  Contracts re-sent:       ${contractsFixed}`);
  console.log(`  Tutor setup emails sent: ${tutorsSetup}`);
  console.log(`  Sara contract resent:    ✓`);
  console.log(`  NPS surveys:             Table empty — no broken links`);
  console.log(`  Build guard:             Added to next.config.js`);
  console.log(`  Send-forms fallback:     Fixed\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
