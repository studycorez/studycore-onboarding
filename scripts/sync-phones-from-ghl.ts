import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env.local') });

const GHL_API_KEY = 'pit-fdc31c1c-9421-4300-ad96-7015e838d9f7';
const LOCATION_ID = '67091iYHBXVeSyRGbCoq';
const BASE_URL    = 'https://services.leadconnectorhq.com';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing Supabase env vars in .env.local');
  process.exit(1);
}

const ghl = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${GHL_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  },
  timeout: 30_000,
});

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function main() {
  // ── 1. Load all students from Supabase ──────────────────────────────────────
  const { data: students, error: studentsErr } = await supabase
    .from('students')
    .select('id, name, email, parent_email, parent_phone');

  if (studentsErr || !students) {
    console.error('❌  Failed to load students:', studentsErr?.message);
    process.exit(1);
  }

  // Build lookup maps
  const byEmail = new Map<string, typeof students[number]>();
  const byName  = new Map<string, typeof students[number]>();
  for (const s of students) {
    if (s.email)        byEmail.set(s.email.toLowerCase(), s);
    if (s.parent_email) byEmail.set(s.parent_email.toLowerCase(), s);
    byName.set(normalize(s.name), s);
  }

  console.log(`Loaded ${students.length} students from Supabase`);

  // ── 2. Paginate all GHL contacts ────────────────────────────────────────────
  let page        = 0;
  let cursorId: string | null  = null;
  let cursorTs: number | null  = null;
  const seenIds   = new Set<string>();
  const allContacts: any[] = [];

  console.log('\nFetching GHL contacts...');
  while (true) {
    page++;
    const params: Record<string, any> = { locationId: LOCATION_ID, limit: 100 };
    if (cursorId) params.startAfterId = cursorId;
    if (cursorTs) params.startAfter   = cursorTs;

    let contacts: any[] = [];
    let meta: any = {};
    try {
      const res = await ghl.get('/contacts/', { params });
      contacts  = res.data?.contacts ?? [];
      meta      = res.data?.meta ?? {};
    } catch (err: any) {
      console.error(`  GHL error on page ${page}:`, err.response?.data ?? err.message);
      break;
    }

    if (contacts.length === 0) break;

    // Deduplicate (GHL cursors can occasionally repeat)
    const fresh = contacts.filter((c: any) => !seenIds.has(c.id));
    fresh.forEach((c: any) => seenIds.add(c.id));
    allContacts.push(...fresh);

    console.log(`  Page ${page}: ${contacts.length} contacts (${fresh.length} new) — total ${allContacts.length}`);

    cursorId = meta.startAfterId ?? null;
    cursorTs = meta.startAfter   ?? null;
    if (contacts.length < 100 || (!cursorId && !cursorTs)) break;
  }

  console.log(`\nTotal GHL contacts fetched: ${allContacts.length}`);

  // ── 3. Match and update ─────────────────────────────────────────────────────
  let matched    = 0;
  let updated    = 0;
  let skipped    = 0;
  let noPhone    = 0;
  let unmatched  = 0;

  for (const c of allContacts) {
    const phone: string | null = c.phone ?? null;
    if (!phone) { noPhone++; continue; }

    // Try match by email (contact email, then parent email field)
    let student: typeof students[number] | undefined;
    const emails: string[] = [c.email, c.contactEmail, ...(c.additionalEmails ?? [])].filter(Boolean).map((e: unknown) => typeof e === 'string' ? e.toLowerCase() : '').filter(Boolean);
    for (const e of emails) {
      student = byEmail.get(e);
      if (student) break;
    }

    // Fall back to name match
    if (!student) {
      const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ');
      if (fullName) student = byName.get(normalize(fullName));
    }

    if (!student) { unmatched++; continue; }

    matched++;

    // Skip if already has a phone
    if (student.parent_phone && student.parent_phone.trim() !== '') {
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from('students')
      .update({ parent_phone: phone })
      .eq('id', student.id);

    if (error) {
      console.error(`  ❌  Update failed for ${student.name} (${student.id}):`, error.message);
    } else {
      console.log(`  ✅  ${student.name} → ${phone}`);
      updated++;
      // Keep in-memory record consistent so duplicate contacts don't re-update
      student.parent_phone = phone;
    }
  }

  // ── 4. Summary ───────────────────────────────────────────────────────────────
  console.log('\n── Summary ──────────────────────────────────────');
  console.log(`Total GHL contacts fetched : ${allContacts.length}`);
  console.log(`Contacts without a phone   : ${noPhone}`);
  console.log(`Unmatched to any student   : ${unmatched}`);
  console.log(`Matched students           : ${matched}`);
  console.log(`Phone numbers updated      : ${updated}`);
  console.log(`Skipped (already had phone): ${skipped}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
