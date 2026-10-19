/**
 * Backfill existing students into the GHL Student Fulfillment pipeline.
 * For each student in the tracking sheet:
 *   1. Search GHL for parent contact by email
 *   2. Skip if they already have an opportunity in the Student Fulfillment pipeline
 *   3. Create opportunity in ACTIVE stage with student name + score custom fields
 *
 * Run with --dry-run to preview without writing anything.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// CSV parser — inline to avoid dependency
function parseCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const headers = parseRow(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}
function parseRow(line) {
  const cols = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { cols.push(cur); cur = ''; }
    else { cur += c; }
  }
  cols.push(cur);
  return cols.map(c => c.trim());
}

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
const ACTIVE_STAGE    = '99803c34-071c-476c-a513-e3789816bf85';

// Custom field IDs
const CF_STUDENT_NAME   = 'SVWWOw5yr7q7POnmp3eY';
const CF_CURRENT_SCORE  = '2rY0PdPWokY0S4dEFGiX';
const CF_TARGET_SCORE   = 'lTC9zj3Uh2lhOLSKf0GI';
const CF_PARENT_NAME    = 'VU2ma6BQHbOHwwAe85WS';
const CF_HAS_GUARANTEE  = 'arP6vVOBlG9XsxAgz8mJ';

const DRY_RUN = process.argv.includes('--dry-run');
const CSV_PATH        = '/Users/tchandrada/Documents/claudesecondbrain/StudyCore-Student-Tracking-Final.csv';
const ACTIVE_IDS_PATH = '/Users/tchandrada/Documents/claudesecondbrain/stduent and tutor ids - Sheet1.csv';

function ghlHeaders() {
  return {
    Authorization: `Bearer ${GHL_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

// Parse first valid email from a field (handles "email1 / email2" format)
function firstEmail(raw) {
  return (raw ?? '').split(/[,/]/).map(e => e.trim()).find(e => e.includes('@')) ?? '';
}

async function findContactByEmail(email) {
  if (!email) return null;
  const res = await fetch(
    `${GHL_BASE}/contacts/search/duplicate?locationId=${GHL_LOCATION_ID}&email=${encodeURIComponent(email)}`,
    { headers: ghlHeaders() }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.contact ?? null;
}

async function getExistingOpportunities(contactId) {
  const res = await fetch(
    `${GHL_BASE}/opportunities/search?location_id=${GHL_LOCATION_ID}&contact_id=${contactId}&pipeline_id=${PIPELINE_ID}&limit=10`,
    { headers: ghlHeaders() }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data?.opportunities ?? [];
}

async function createOpportunity(contactId, studentName, parentName, currentScore, targetScore, hasGuarantee) {
  const res = await fetch(`${GHL_BASE}/opportunities/`, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify({
      pipelineId:      PIPELINE_ID,
      pipelineStageId: ACTIVE_STAGE,
      contactId,
      name:            studentName,
      status:          'open',
      locationId:      GHL_LOCATION_ID,
      customFields: [
        { id: CF_STUDENT_NAME,  field_value: studentName },
        { id: CF_PARENT_NAME,   field_value: parentName },
        { id: CF_CURRENT_SCORE, field_value: currentScore },
        { id: CF_TARGET_SCORE,  field_value: targetScore },
        { id: CF_HAS_GUARANTEE, field_value: hasGuarantee },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return await res.json();
}

async function main() {
  if (!GHL_API_KEY) { console.error('GHL_SUPPORT_API_KEY not set'); process.exit(1); }

  // Build set of active student names from the IDs sheet
  const activeRaw = fs.readFileSync(ACTIVE_IDS_PATH, 'utf-8').replace(/^\uFEFF/, '');
  const activeRows = parseCsv(activeRaw);
  const activeNames = new Set(activeRows.map(r => r['Student name']?.trim().toLowerCase()).filter(Boolean));
  console.log(`Active students from IDs sheet: ${activeNames.size}\n`);

  const raw = fs.readFileSync(CSV_PATH, 'utf-8').replace(/^\uFEFF/, '');
  const allRows = parseCsv(raw);
  const rows = allRows.filter(r => activeNames.has((r['Student Name'] ?? '').trim().toLowerCase()));

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Processing ${rows.length} students...\n`);

  let created = 0, skipped = 0, noEmail = 0, notFound = 0, errors = 0;
  const missing = [];

  for (const row of rows) {
    const studentName  = (row['Student Name'] ?? '').trim();
    const parentName   = (row['Parent Name'] ?? '').trim();
    const parentEmail  = firstEmail(row['Parent Email'] ?? '');
    const currentScore = (row['Current Score/Baseline'] ?? '').trim();
    const targetScore  = (row['Target Score'] ?? '').trim();
    const hasGuarantee = (row['Guarantee Program (Y/N)'] ?? '').trim();

    if (!studentName) continue;

    if (!parentEmail) {
      console.log(`⚠️  ${studentName} — no parent email, skipping`);
      noEmail++;
      missing.push({ student: studentName, reason: 'no email' });
      continue;
    }

    process.stdout.write(`${studentName}...`);

    const contact = await findContactByEmail(parentEmail);
    if (!contact) {
      console.log(` ❌ parent contact not found in GHL (${parentEmail})`);
      notFound++;
      missing.push({ student: studentName, email: parentEmail, reason: 'not in GHL' });
      await new Promise(r => setTimeout(r, 150));
      continue;
    }

    const existing = await getExistingOpportunities(contact.id);
    if (existing.length > 0) {
      const stageName = existing[0].pipelineStageId;
      console.log(` ✓ already in pipeline (stage: ${stageName})`);
      skipped++;
      await new Promise(r => setTimeout(r, 150));
      continue;
    }

    if (DRY_RUN) {
      console.log(` → would create in ACTIVE stage (contact: ${contact.id})`);
      created++;
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    try {
      await createOpportunity(contact.id, studentName, parentName, currentScore, targetScore, hasGuarantee);
      console.log(` ✓ created`);
      created++;
    } catch (err) {
      console.log(` ❌ error: ${err.message?.slice(0, 100)}`);
      errors++;
    }

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}Done.`);
  console.log(`Created: ${created} | Already in pipeline: ${skipped} | No email: ${noEmail} | Not in GHL: ${notFound} | Errors: ${errors}`);
  if (missing.length) {
    console.log('\nNeeds manual attention:');
    missing.forEach(m => console.log(`  - ${m.student}: ${m.reason}${m.email ? ` (${m.email})` : ''}`));
  }
}

main().catch(console.error);
