/**
 * Backfill pipeline opportunities for contacts tagged "new-enrollment" in GHL.
 * These are students who submitted the onboarding form (Tally) but whose
 * pipeline opportunity was never created (e.g., enrolled before webhook was live).
 *
 * Run: node scripts/backfill-onboarding-alerts.mjs [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envVars = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const GHL_API_KEY     = envVars.GHL_SUPPORT_API_KEY;
const GHL_LOCATION_ID = 'T4M5UHtoDZkcVAK31IFA';
const GHL_BASE        = 'https://services.leadconnectorhq.com';
const PIPELINE_ID     = 'a9Ytm6ovrr5OK9PHJGrJ';
const NEW_ENROLLMENT_STAGE = '79095236-7c28-4684-b7ce-29d03e2d1c86';

// Custom field IDs
const CF_STUDENT_NAME = 'SVWWOw5yr7q7POnmp3eY';

const DRY_RUN = process.argv.includes('--dry-run');

function ghlHeaders() {
  return {
    Authorization: `Bearer ${GHL_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

/** Fetch all contacts in the location and return only those tagged "new-enrollment" */
async function fetchNewEnrollmentContacts() {
  const matches = [];
  let startAfterId = null;
  let page = 0;

  while (true) {
    page++;
    const url = new URL(`${GHL_BASE}/contacts/`);
    url.searchParams.set('locationId', GHL_LOCATION_ID);
    url.searchParams.set('limit', '100');
    if (startAfterId) url.searchParams.set('startAfterId', startAfterId);

    const res = await fetch(url.toString(), { headers: ghlHeaders() });
    if (!res.ok) {
      console.error(`Page ${page} failed:`, res.status, await res.text());
      break;
    }
    const data = await res.json();
    const batch = data?.contacts ?? [];

    const tagged = batch.filter(c => (c.tags ?? []).includes('new-enrollment'));
    matches.push(...tagged);

    process.stdout.write(`\r  Scanned page ${page} (${batch.length} contacts, ${matches.length} matches so far)...`);

    if (batch.length < 100) break;
    startAfterId = batch[batch.length - 1].id;
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(); // newline after progress
  return matches;
}

async function getExistingOpportunities(contactId) {
  const res = await fetch(
    `${GHL_BASE}/opportunities/search?location_id=${GHL_LOCATION_ID}&contact_id=${contactId}&pipeline_id=${PIPELINE_ID}&limit=10`,
    { headers: ghlHeaders() }
  );
  if (!res.ok) return [];
  return (await res.json())?.opportunities ?? [];
}

async function createOpportunity(contactId, studentName) {
  const res = await fetch(`${GHL_BASE}/opportunities/`, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify({
      pipelineId:      PIPELINE_ID,
      pipelineStageId: NEW_ENROLLMENT_STAGE,
      contactId,
      name:            studentName,
      status:          'open',
      locationId:      GHL_LOCATION_ID,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

async function main() {
  if (!GHL_API_KEY) { console.error('GHL_SUPPORT_API_KEY not set in .env.local'); process.exit(1); }

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Scanning all contacts for "new-enrollment" tag...\n`);
  const contacts = await fetchNewEnrollmentContacts();
  console.log(`\nFound ${contacts.length} contacts with new-enrollment tag.\n`);

  if (contacts.length === 0) {
    console.log('No contacts to process.');
    return;
  }

  let created = 0, skipped = 0, noName = 0, errors = 0;

  for (const contact of contacts) {
    const gcf = (id) => (contact.customFields ?? []).find(f => f.id === id)?.value ?? '';
    const studentName = gcf(CF_STUDENT_NAME)
      || [contact.firstName, contact.lastName].filter(Boolean).join(' ');

    if (!studentName.trim()) {
      console.log(`⚠️  Contact ${contact.id} (${contact.email ?? 'no email'}) — no student name, skipping`);
      noName++;
      continue;
    }

    process.stdout.write(`${studentName}...`);

    const existing = await getExistingOpportunities(contact.id);
    const mainOpps = existing.filter(o => !String(o.name ?? '').includes('[student]'));

    if (mainOpps.length > 0) {
      console.log(` ✓ already in pipeline (${mainOpps[0].pipelineStageId})`);
      skipped++;
      await new Promise(r => setTimeout(r, 150));
      continue;
    }

    if (DRY_RUN) {
      console.log(` → would create in NEW_ENROLLMENT stage`);
      created++;
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    try {
      await createOpportunity(contact.id, studentName);
      console.log(` ✓ created`);
      created++;
    } catch (err) {
      console.log(` ❌ error: ${err.message?.slice(0, 120)}`);
      errors++;
    }

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}Done.`);
  console.log(`Created: ${created} | Already in pipeline: ${skipped} | No name: ${noName} | Errors: ${errors}`);
}

main().catch(console.error);
