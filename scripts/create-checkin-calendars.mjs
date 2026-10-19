/**
 * One-time script — creates all SSC check-in calendars in GHL Support sub-account.
 *
 * Calendars created (16 total):
 *   Onboarding Call
 *   Post-Session 1  · Student / Parent / Tutor
 *   Post-Session 3  · Student / Parent / Tutor
 *   Weekly Check-in · Student / Parent / Tutor
 *   Phase Check-in  · Student + Parent (Zoom) / Tutor
 *   Pre-SAT Call    · Student / Parent
 *   Post-SAT Results · Student / Parent
 *
 * Run: node scripts/create-checkin-calendars.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Load .env.local ───────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
try {
  const envFile = readFileSync(envPath, 'utf8');
  for (const line of envFile.split('\n')) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  }
} catch {}

// ── Constants ─────────────────────────────────────────────────────────────────
const GHL_BASE    = 'https://services.leadconnectorhq.com';
const GHL_API_KEY = process.env.GHL_SUPPORT_API_KEY;
const LOCATION_ID = process.env.GHL_SUPPORT_LOCATION_ID ?? 'T4M5UHtoDZkcVAK31IFA';

function ghlHeaders() {
  return {
    Authorization: `Bearer ${GHL_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

// ── Calendar definitions ──────────────────────────────────────────────────────
const CALENDARS = [
  // Onboarding
  { name: 'Onboarding Call',                    description: 'Parent books onboarding call with SSC after completing the parent workshop.' },

  // Post-Session 1
  { name: 'Post-Session 1 · Student',           description: 'SSC check-in call with student after their first session.' },
  { name: 'Post-Session 1 · Parent',            description: 'SSC check-in call with parent after student\'s first session.' },
  { name: 'Post-Session 1 · Tutor',             description: 'SSC check-in call with tutor after their first session with a student.' },

  // Post-Session 3
  { name: 'Post-Session 3 · Student',           description: 'SSC check-in call with student after their third session.' },
  { name: 'Post-Session 3 · Parent',            description: 'SSC check-in call with parent after student\'s third session.' },
  { name: 'Post-Session 3 · Tutor',             description: 'SSC check-in call with tutor after three sessions with a student.' },

  // Weekly
  { name: 'Weekly Check-in · Student',          description: 'Recurring weekly SSC check-in call with student.' },
  { name: 'Weekly Check-in · Parent',           description: 'Recurring weekly SSC check-in call with parent.' },
  { name: 'Weekly Check-in · Tutor',            description: 'Recurring weekly SSC check-in call with tutor.' },

  // Phase (post-practice test)
  { name: 'Phase Check-in · Student + Parent',  description: 'Zoom meeting with student and parent together after each practice test.' },
  { name: 'Phase Check-in · Tutor',             description: 'SSC check-in call with tutor after each practice test.' },

  // SAT
  { name: 'Pre-SAT Call · Student',             description: 'SSC debrief call with student on SAT day after they finish the test.' },
  { name: 'Pre-SAT Call · Parent',              description: 'SSC debrief call with parent on SAT day.' },
  { name: 'Post-SAT Results · Student',         description: 'SSC results review call with student ~2 weeks after SAT scores release.' },
  { name: 'Post-SAT Results · Parent',          description: 'SSC results review call with parent ~2 weeks after SAT scores release.' },
];

// ── Create calendar ───────────────────────────────────────────────────────────
async function createCalendar(name, description) {
  const res = await fetch(`${GHL_BASE}/calendars/`, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify({
      name,
      description,
      locationId: LOCATION_ID,
      calendarType: 'event',
      isActive: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`  FAILED: ${name} — ${res.status} ${text}`);
    return null;
  }

  const data = await res.json();
  const id = data?.calendar?.id ?? data?.id ?? null;
  return id;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!GHL_API_KEY) {
    console.error('Missing GHL_SUPPORT_API_KEY in .env.local');
    process.exit(1);
  }

  console.log(`Creating ${CALENDARS.length} calendars in location ${LOCATION_ID}\n`);

  const results = [];

  for (const { name, description } of CALENDARS) {
    process.stdout.write(`  ${name} ... `);
    const id = await createCalendar(name, description);
    if (id) {
      console.log(`OK  (id: ${id})`);
      results.push({ name, id });
    }
    await sleep(300);
  }

  console.log('\n── Created calendars ────────────────────────────────────────');
  for (const { name, id } of results) {
    console.log(`${id}  ${name}`);
  }
  console.log(`\n${results.length}/${CALENDARS.length} calendars created.`);
  console.log('\nNext: set SSC availability on each calendar in GHL → Calendars.');
}

main().catch(err => { console.error(err); process.exit(1); });
