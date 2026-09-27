/**
 * One-time SMS blast — sends all active tutors a message asking them
 * to fill out the tutor intake form.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read .env.local manually (no dotenv dependency needed)
const envPath = path.join(__dirname, '../.env.local');
const envVars = Object.fromEntries(
  fs.readFileSync(envPath, 'utf-8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
);

const GHL_API_KEY     = envVars.GHL_SUPPORT_API_KEY;
const GHL_LOCATION_ID = envVars.GHL_SUPPORT_LOCATION_ID;
const GHL_BASE        = 'https://services.leadconnectorhq.com';

function ghlHeaders() {
  return {
    Authorization: `Bearer ${GHL_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

// Parse CSV manually
const csvPath = path.join('/Users/tchandrada/Documents/claudesecondbrain', 'stduent and tutor ids - Sheet1.csv');
const lines   = fs.readFileSync(csvPath, 'utf-8').trim().split('\n').slice(1); // skip header

// Build unique tutor map: name -> first name
const tutors = new Map();
for (const line of lines) {
  const cols       = line.split(',');
  const tutorName  = cols[2]?.trim();
  if (!tutorName) continue;
  if (!tutors.has(tutorName)) {
    tutors.set(tutorName, tutorName.split(' ')[0]);
  }
}

async function findContact(name) {
  const res  = await fetch(
    `${GHL_BASE}/contacts/?locationId=${GHL_LOCATION_ID}&query=${encodeURIComponent(name)}`,
    { headers: ghlHeaders() },
  );
  const data = await res.json();
  const list = data.contacts ?? [];
  return (
    list.find(c => `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim().toLowerCase() === name.toLowerCase()) ??
    list[0] ??
    null
  );
}

async function sendSMS(contactId, message) {
  const res = await fetch(`${GHL_BASE}/conversations/messages`, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify({ type: 'SMS', contactId, message }),
  });
  const data = await res.json();
  if (!res.ok) console.log('    GHL error:', JSON.stringify(data));
  return res.ok;
}

function buildMessage(firstName) {
  return `Hey ${firstName}, StudyCore here — please fill out your tutor intake form today, it's required before your next session:\nhttps://tally.so/r/pb9j6V`;
}

async function main() {
  if (!GHL_API_KEY) { console.error('GHL_SUPPORT_API_KEY not set'); process.exit(1); }

  console.log(`Sending to ${tutors.size} tutors...\n`);

  let sent = 0, failed = 0, notFound = 0;

  for (const [name, firstName] of tutors) {
    process.stdout.write(`${name}... `);
    const contact = await findContact(name);
    if (!contact) {
      console.log('❌ not found in GHL');
      notFound++;
      continue;
    }

    const ok = await sendSMS(contact.id, buildMessage(firstName));
    if (ok) { console.log('✓ sent'); sent++; }
    else    { console.log('❌ send failed'); failed++; }

    await new Promise(r => setTimeout(r, 250)); // rate limit
  }

  console.log(`\n✅ Done — sent: ${sent}, failed: ${failed}, not found: ${notFound}`);
}

main().catch(console.error);
