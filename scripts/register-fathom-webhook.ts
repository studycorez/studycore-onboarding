/**
 * Register a Fathom webhook that points to StudyCore's /api/webhooks/fathom endpoint.
 *
 * After running, copy the printed FATHOM_WEBHOOK_SECRET value to:
 *   Vercel → Settings → Environment Variables → FATHOM_WEBHOOK_SECRET
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/register-fathom-webhook.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const FATHOM_API_KEY = process.env.FATHOM_API_KEY;
const WEBHOOK_URL    = 'https://studycore-eight.vercel.app/api/webhooks/fathom';
const BASE_URL       = 'https://api.fathom.ai/external/v1';

async function main() {
  const HR = '─'.repeat(60);

  if (!FATHOM_API_KEY) {
    console.error('Missing FATHOM_API_KEY in .env.local');
    process.exit(1);
  }

  console.log(`\n${HR}`);
  console.log('  Register Fathom Webhook');
  console.log(`${HR}`);
  console.log(`  Destination: ${WEBHOOK_URL}`);
  console.log(`  Triggers:    my_recordings, shared_team_recordings`);
  console.log(`${HR}\n`);

  // Check for existing webhooks first to avoid duplicates
  console.log('Checking for existing webhooks…');
  const listRes = await fetch(`${BASE_URL}/webhooks`, {
    headers: { 'X-Api-Key': FATHOM_API_KEY },
  });

  if (listRes.ok) {
    const listData: any = await listRes.json();
    const existing = (listData.data ?? listData ?? []) as any[];
    const duplicate = existing.find((w: any) => w.url === WEBHOOK_URL || w.destination_url === WEBHOOK_URL);
    if (duplicate) {
      console.log('A webhook already exists for this URL:');
      console.log(JSON.stringify(duplicate, null, 2));
      console.log('\n⚠️  Delete the existing webhook in Fathom before re-registering, or use it as-is.');
      console.log('   If you need the secret, delete and re-run this script.\n');
      process.exit(0);
    }
    console.log(`Found ${existing.length} existing webhook(s) — none point to our URL.\n`);
  } else {
    console.warn(`Could not list existing webhooks (${listRes.status}) — proceeding anyway.\n`);
  }

  // Register new webhook
  console.log('Registering new webhook…\n');

  const body = {
    destination_url: WEBHOOK_URL,
    triggered_for: ['my_recordings', 'shared_team_recordings'],
  };

  const res = await fetch(`${BASE_URL}/webhooks`, {
    method: 'POST',
    headers: {
      'X-Api-Key':    FATHOM_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseText = await res.text();
  let responseData: any;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = responseText;
  }

  console.log(`Status: ${res.status}`);
  console.log('Full response:');
  console.log(JSON.stringify(responseData, null, 2));

  if (!res.ok) {
    console.error(`\n❌ Failed to register webhook (${res.status})`);
    process.exit(1);
  }

  const secret = responseData?.secret ?? responseData?.data?.secret ?? null;
  const id     = responseData?.id     ?? responseData?.data?.id     ?? '(unknown)';

  console.log(`\n${HR}`);
  console.log('  ✅ Webhook registered successfully!');
  console.log(`${HR}`);
  console.log(`  Webhook ID: ${id}`);

  if (secret) {
    console.log(`\n  ┌─────────────────────────────────────────────────────┐`);
    console.log(`  │  Add this to Vercel Environment Variables:          │`);
    console.log(`  │                                                     │`);
    console.log(`  │  FATHOM_WEBHOOK_SECRET=${secret.padEnd(28)}│`);
    console.log(`  └─────────────────────────────────────────────────────┘`);
    console.log(`\n  Also ensure FATHOM_API_KEY is set in Vercel env vars.`);
  } else {
    console.warn('\n  ⚠️  No secret returned — check the full response above.');
  }

  console.log(`\n${HR}\n`);
}

main().catch(err => {
  console.error('\nFatal error:', err.message ?? err);
  process.exit(1);
});
