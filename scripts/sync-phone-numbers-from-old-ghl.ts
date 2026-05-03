/**
 * Sync phone numbers from the OLD GHL location to the NEW GHL Support location.
 *
 * OLD location: 67091iYHBXVeSyRGbCoq  (uses GHL_API_KEY)
 *   Note: PdWdMrmvmQQXZfrEfcEQ returns 403 with GHL_API_KEY — actual working
 *   location for this key is 67091iYHBXVeSyRGbCoq (confirmed in ghl-student-emails.ts)
 * NEW location: T4M5UHtoDZkcVAK31IFA  (uses GHL_SUPPORT_API_KEY)
 *
 * Strategy:
 *   1. Fetch all contacts from old GHL location
 *   2. For each contact with a phone number, look it up by email in the new location
 *   3. If the new contact is missing a phone, update it with the old one
 *   4. Cross-reference Supabase students table — update parent contacts in new GHL
 *      with parent_phone from the DB if the parent contact is missing a phone
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/sync-phone-numbers-from-old-ghl.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/sync-phone-numbers-from-old-ghl.ts --live
 */

import { createClient } from '@supabase/supabase-js';

const LIVE    =  process.argv.includes('--live');
const DRY_RUN = !LIVE;

// ── Env validation ─────────────────────────────────────────────────────────────

const OLD_API_KEY = process.env.GHL_API_KEY;
if (!OLD_API_KEY) {
  console.error('Error: GHL_API_KEY is not set (needed for old GHL location).');
  process.exit(1);
}

const NEW_API_KEY = process.env.GHL_SUPPORT_API_KEY;
if (!NEW_API_KEY) {
  console.error('Error: GHL_SUPPORT_API_KEY is not set (needed for new GHL Support location).');
  process.exit(1);
}

const OLD_LOCATION_ID = process.env.GHL_OLD_LOCATION_ID    || '67091iYHBXVeSyRGbCoq';
const NEW_LOCATION_ID = process.env.GHL_SUPPORT_LOCATION_ID || 'T4M5UHtoDZkcVAK31IFA';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const GHL_BASE    = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

function oldHeaders() {
  return { Authorization: `Bearer ${OLD_API_KEY}`, Version: GHL_VERSION, 'Content-Type': 'application/json' };
}
function newHeaders() {
  return { Authorization: `Bearer ${NEW_API_KEY}`, Version: GHL_VERSION, 'Content-Type': 'application/json' };
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface GhlContact {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
}

interface GhlListResponse {
  contacts: GhlContact[];
  meta?: {
    total?: number;
    startAfter?: number;
    startAfterId?: string;
    nextPageUrl?: string | null;
  };
}

// ── GHL helpers ────────────────────────────────────────────────────────────────

async function fetchAllContactsFromLocation(locationId: string, apiKey: string): Promise<GhlContact[]> {
  const all: GhlContact[] = [];
  let startAfter: number | undefined;
  let startAfterId: string | undefined;
  let page = 1;

  while (true) {
    const params = new URLSearchParams({ locationId, limit: '100' });
    if (startAfter   != null) params.set('startAfter',   String(startAfter));
    if (startAfterId != null) params.set('startAfterId', startAfterId);

    const res = await fetch(`${GHL_BASE}/contacts/?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GHL contacts list failed [${locationId}] ${res.status}: ${body}`);
    }

    const data = await res.json() as GhlListResponse;
    if (!data.contacts?.length) break;

    all.push(...data.contacts);
    process.stdout.write(`\r  Fetched ${all.length} / ${data.meta?.total ?? '?'} contacts (page ${page})  `);

    if (
      data.contacts.length < 100 ||
      data.meta?.nextPageUrl == null ||
      (data.meta.startAfter == null && data.meta.startAfterId == null)
    ) break;

    startAfter   = data.meta.startAfter;
    startAfterId = data.meta.startAfterId;
    page++;
  }

  process.stdout.write('\n');
  return all;
}

/** Find a contact in the NEW location by email. Returns null if not found. */
async function findNewContactByEmail(email: string): Promise<GhlContact | null> {
  const res = await fetch(
    `${GHL_BASE}/contacts/search/duplicate?locationId=${NEW_LOCATION_ID}&email=${encodeURIComponent(email)}`,
    { headers: newHeaders() },
  );
  if (!res.ok) return null;
  const data = await res.json() as { contact?: GhlContact };
  return data?.contact ?? null;
}

/** Update a contact in the NEW location with a phone number. */
async function updateNewContactPhone(contactId: string, phone: string): Promise<boolean> {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
    method: 'PUT',
    headers: newHeaders(),
    body: JSON.stringify({ phone }),
  });

  if (!res.ok) {
    const errText = await res.text();
    // Duplicate phone — another contact already has this number; skip
    try {
      const errJson = JSON.parse(errText);
      if (errJson?.meta?.matchingField === 'phone') {
        console.warn(`  [warn] phone ${phone} already assigned to another contact in new GHL — skipping`);
        return false;
      }
    } catch { /* */ }
    console.error(`  [error] PUT /contacts/${contactId}: ${res.status} ${errText}`);
    return false;
  }
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const HR  = '─'.repeat(72);
  const HR2 = '═'.repeat(72);

  console.log(`\n${HR2}`);
  console.log(`  PHONE NUMBER SYNC: Old GHL → New GHL Support`);
  console.log(`  Old location: ${OLD_LOCATION_ID}`);
  console.log(`  New location: ${NEW_LOCATION_ID}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (first 10 matches, no writes)' : 'LIVE'}`);
  console.log(`${HR2}\n`);

  // ── Step 1: Fetch old GHL contacts ─────────────────────────────────────────
  console.log(`${HR}`);
  console.log('  Fetching contacts from OLD GHL location…');
  console.log(HR);

  const oldContacts = await fetchAllContactsFromLocation(OLD_LOCATION_ID, OLD_API_KEY!);
  const oldWithPhone = oldContacts.filter(c => c.phone && c.email);
  const oldWithEmail = oldContacts.filter(c => c.email);

  console.log(`  Total contacts in old GHL:        ${oldContacts.length}`);
  console.log(`  Contacts with email:              ${oldWithEmail.length}`);
  console.log(`  Contacts with email + phone:      ${oldWithPhone.length}\n`);

  // ── Step 2: Fetch Supabase students for parent_phone cross-reference ────────
  console.log(`${HR}`);
  console.log('  Fetching students from Supabase for parent_phone cross-reference…');
  console.log(HR);

  const { data: students, error: dbErr } = await supabase
    .from('students')
    .select('parent_email, parent_phone, parent_name, name')
    .not('parent_email', 'is', null)
    .not('parent_phone', 'is', null);

  if (dbErr) {
    console.error('  Supabase fetch failed:', dbErr.message);
    process.exit(1);
  }

  // Build email → parent_phone map from Supabase
  const dbParentPhones = new Map<string, { phone: string; studentName: string; parentName: string | null }>();
  for (const s of students ?? []) {
    if (s.parent_email && s.parent_phone) {
      const key = s.parent_email.toLowerCase().trim();
      if (!dbParentPhones.has(key)) {
        dbParentPhones.set(key, {
          phone:       s.parent_phone,
          studentName: s.name ?? '',
          parentName:  s.parent_name,
        });
      }
    }
  }
  console.log(`  Parents with phone in Supabase DB: ${dbParentPhones.size}\n`);

  // ── Step 3: Build old GHL email → phone map ────────────────────────────────
  const oldPhoneByEmail = new Map<string, string>();
  for (const c of oldWithPhone) {
    const email = c.email!.toLowerCase().trim();
    if (!oldPhoneByEmail.has(email)) {
      oldPhoneByEmail.set(email, c.phone!);
    }
  }

  // Merge DB parent phones into the lookup (DB takes priority for parent emails)
  for (const [email, info] of dbParentPhones) {
    if (!oldPhoneByEmail.has(email)) {
      oldPhoneByEmail.set(email, info.phone);
    }
  }

  // ── Step 4: Find new GHL contacts missing phones ───────────────────────────
  console.log(`${HR}`);
  console.log('  Checking new GHL contacts for missing phone numbers…');
  console.log(HR);

  interface PhoneCandidate {
    email:       string;
    newId:       string;
    newName:     string;
    phone:       string;
    source:      'old-ghl' | 'supabase-db';
  }

  const candidates: PhoneCandidate[] = [];
  const dryRunLimit = 10;
  let checked = 0;

  const emailsToCheck = Array.from(oldPhoneByEmail.keys());

  for (const email of emailsToCheck) {
    const phone = oldPhoneByEmail.get(email)!;
    const newContact = await findNewContactByEmail(email);
    checked++;

    if (checked % 20 === 0) {
      process.stdout.write(`\r  Checked ${checked} / ${emailsToCheck.length} emails…  `);
    }

    if (!newContact) continue;          // not in new GHL at all
    if (newContact.phone) continue;     // already has a phone

    const source: 'old-ghl' | 'supabase-db' = dbParentPhones.has(email) ? 'supabase-db' : 'old-ghl';
    candidates.push({
      email,
      newId:   newContact.id,
      newName: newContact.name ?? `${newContact.firstName ?? ''} ${newContact.lastName ?? ''}`.trim(),
      phone,
      source,
    });

    if (DRY_RUN && candidates.length >= dryRunLimit) break;
  }

  process.stdout.write('\n');
  console.log(`  Contacts missing phone in new GHL (candidates): ${candidates.length}\n`);

  // ── Step 5: Dry-run preview ────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log(`${HR}`);
    console.log(`  DRY RUN — first ${Math.min(dryRunLimit, candidates.length)} candidates:`);
    console.log(HR);

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      console.log(`  [${i + 1}] ${c.newName} <${c.email}>`);
      console.log(`       Would set phone: ${c.phone}  (source: ${c.source})`);
      console.log(`       New GHL contact ID: ${c.newId}`);
    }

    console.log(`\n${HR2}`);
    console.log(`  DRY RUN COMPLETE`);
    console.log(`  Total old GHL contacts:      ${oldContacts.length}`);
    console.log(`  Phones found in old GHL:     ${oldWithPhone.length}`);
    console.log(`  Parents with phone in DB:    ${dbParentPhones.size}`);
    console.log(`  Candidates (need update):    ${candidates.length}+  (limited to ${dryRunLimit} in dry-run)`);
    console.log(`  Run with --live to apply all updates.`);
    console.log(`${HR2}\n`);
    return;
  }

  // ── Step 6: Live — apply phone updates ────────────────────────────────────
  console.log(`${HR}`);
  console.log('  Applying phone number updates to new GHL…');
  console.log(HR);

  let copied = 0, failed = 0;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const ok = await updateNewContactPhone(c.newId, c.phone);
    if (ok) {
      copied++;
    } else {
      failed++;
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  Progress: ${i + 1} / ${candidates.length} updates (ok: ${copied}, failed: ${failed})`);
    }
  }

  // ── Step 7: Count remaining contacts without phone ────────────────────────
  console.log('\n  Counting contacts still missing phone in new GHL…');
  const allNew = await fetchAllContactsFromLocation(NEW_LOCATION_ID, NEW_API_KEY!);
  const stillMissing = allNew.filter(c => !c.phone).length;

  // ── Final summary ──────────────────────────────────────────────────────────
  console.log(`\n${HR2}`);
  console.log('  SYNC COMPLETE');
  console.log(HR2);
  console.log(`  Total contacts in old GHL:               ${oldContacts.length}`);
  console.log(`  Phone numbers found in old GHL:          ${oldWithPhone.length}`);
  console.log(`  Parents with phone in Supabase DB:       ${dbParentPhones.size}`);
  console.log(`  Candidates (new contacts missing phone):  ${candidates.length}`);
  console.log(`  Phone numbers successfully copied:        ${copied}`);
  console.log(`  Failed updates:                           ${failed}`);
  console.log(`  Contacts still missing phone (new GHL):   ${stillMissing}`);
  console.log(`${HR2}\n`);
}

main().catch(err => {
  console.error('\nFatal:', (err as Error).message ?? err);
  process.exit(1);
});
