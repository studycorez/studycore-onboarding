import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { findSupportContact, moveOpportunityStage, createSupportTask, STAGES } from '@/lib/ghl-support';
import { postToSlack } from '@/lib/slack';

function verify(email: string, sig: string): boolean {
  const secret = process.env.WEBHOOK_SECRET ?? 'studycore-2026-onboard';
  const expected = createHmac('sha256', secret).update(email.toLowerCase()).digest('hex').slice(0, 16);
  return expected === sig;
}

const SUCCESS = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Done — StudyCore</title>
<style>*{box-sizing:border-box}body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f7fa}
.card{background:#fff;border-radius:12px;padding:48px 40px;text-align:center;max-width:420px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,.1)}
.check{font-size:48px;margin-bottom:16px}h1{color:#1e2090;margin:0 0 12px;font-size:24px}p{color:#6b7280;line-height:1.6;margin:0;font-size:15px}strong{color:#374151}</style></head>
<body><div class="card"><div class="check">✓</div><h1>You're all set!</h1>
<p>We've confirmed your diagnostic is complete.<br><br>Your tutor will be matched within <strong>24 hours</strong>. We'll reach out with your tutor's info and first session details shortly.</p>
</div></body></html>`;

const ERROR = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invalid Link</title>
<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f7fa}
.card{background:#fff;border-radius:12px;padding:48px 40px;text-align:center;max-width:400px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,.1)}
h1{color:#dc2626;margin:0 0 12px}p{color:#6b7280;line-height:1.6;margin:0}</style></head>
<body><div class="card"><h1>Invalid Link</h1><p>This link has expired or is invalid.<br>Contact us at <a href="mailto:support@studycore.net">support@studycore.net</a>.</p></div></body></html>`;

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email') ?? '';
  const sig   = req.nextUrl.searchParams.get('sig') ?? '';
  if (!email || !sig || !verify(email, sig)) {
    return new NextResponse(ERROR, { status: 400, headers: { 'Content-Type': 'text/html' } });
  }
  void (async () => {
    try {
      const contact = await findSupportContact(email);
      if (contact?.opportunityId) {
        await Promise.allSettled([
          moveOpportunityStage(contact.opportunityId, STAGES.ONBOARDING_CALL_COMPLETED),
          createSupportTask(contact.contactId, `🎯 MATCH NOW — Diagnostic complete: ${email}`, 4),
          postToSlack(`🎯 *Diagnostic done — match needed:* \`${email}\` | Assign tutor within 24hrs`),
        ]);
      } else {
        await postToSlack(`⚠️ Diagnostic complete but no GHL contact found: \`${email}\``);
      }
    } catch (err) { console.error('[diagnostic-complete]', err); }
  })();
  return new NextResponse(SUCCESS, { status: 200, headers: { 'Content-Type': 'text/html' } });
}
