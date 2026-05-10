/**
 * GHL ↔ StudyCore tutor-match reconciliation
 *
 * Pulls all contacts tagged studycore-student or studycore-parent from GHL
 * location PdWdMrmvmQQXZfrEfcEQ, matches them to Supabase students by email
 * then by full name, and writes a CSV with assigned tutor info.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/ghl-tutor-match.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';

// ── Env validation ─────────────────────────────────────────────────────────────

const GHL_API_KEY   = process.env.GHL_API_KEY;
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOCATION_ID   = process.env.GHL_LOCATION_ID ?? 'PdWdMrmvmQQXZfrEfcEQ';
const GHL_BASE      = 'https://services.leadconnectorhq.com';
const TARGET_TAGS   = new Set(['studycore-student', 'studycore-parent']);

if (!GHL_API_KEY)  { console.error('❌  Missing GHL_API_KEY in .env.local');  process.exit(1); }
if (!SUPABASE_URL) { console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL');   process.exit(1); }
if (!SERVICE_KEY)  { console.error('❌  Missing SUPABASE_SERVICE_ROLE_KEY');  process.exit(1); }

// ── Clients ────────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ghlHeaders = {
  Authorization: `Bearer ${GHL_API_KEY}`,
  'Content-Type': 'application/json',
  Version: '2021-07-28',
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface GHLContact {
  id: string;
  firstName: string | null;
  lastName:  string | null;
  email:     string | null;
  phone:     string | null;
  tags:      string[];
}

interface SupabaseStudent {
  id: string;
  name: string;
  email: string;
  tutor_id: string | null;
  tutor_name:  string | null;
  tutor_email: string | null;
}

type MatchStatus = 'matched_by_email' | 'matched_by_name' | 'no_match';

interface OutputRow {
  ghl_contact_name:     string;
  ghl_email:            string;
  ghl_phone:            string;
  matched_student_name: string;
  matched_student_email: string;
  studycore_tutor_name:  string;
  studycore_tutor_email: string;
  match_status:          MatchStatus;
}

// ── GHL pagination ─────────────────────────────────────────────────────────────

async function fetchAllGHLContacts(): Promise<GHLContact[]> {
  const all: GHLContact[] = [];
  let startAfter: string | undefined;
  let startAfterId: string | undefined;
  let total: number | undefined;
  let page = 1;

  while (true) {
    const params = new URLSearchParams({
      locationId: LOCATION_ID,
      limit: '100',
    });
    if (startAfter)   params.set('startAfter',   startAfter);
    if (startAfterId) params.set('startAfterId', startAfterId);

    const url = `${GHL_BASE}/contacts/?${params}`;
    process.stdout.write(`  Fetching page ${page}${total != null ? ` / ~${Math.ceil(total / 100)}` : ''}… `);

    const res = await fetch(url, { headers: ghlHeaders });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`GHL API error ${res.status}: ${body}`);
    }

    const data = await res.json() as {
      contacts?: GHLContact[];
      meta?: { startAfter?: number | string; startAfterId?: string; total?: number; nextPage?: number | null };
    };

    const contacts = data.contacts ?? [];
    console.log(`got ${contacts.length} (total so far: ${all.length + contacts.length}${total != null ? ` of ${total}` : ''})`);
    all.push(...contacts);

    if (total == null && data.meta?.total != null) total = data.meta.total;

    // Stop if we've fetched all, got a partial page, or no more pages
    if (total != null && all.length >= total) break;
    if (contacts.length < 100) break;
    if (!data.meta?.startAfter || data.meta.nextPage == null) break;

    startAfter   = String(data.meta.startAfter);
    startAfterId = data.meta.startAfterId;
    page++;
  }

  return all;
}

// ── Supabase load ──────────────────────────────────────────────────────────────

async function fetchAllStudents(): Promise<SupabaseStudent[]> {
  // Fetch students, tutors, and most-recent session per student (for tutor assignment)
  const [studentsRes, tutorsRes, sessionsRes] = await Promise.all([
    supabase.from('students').select('id, name, email'),
    supabase.from('tutors').select('id, name, email'),
    // Get the most recent session per student to determine assigned tutor
    supabase
      .from('sessions')
      .select('student_id, tutor_id, scheduled_at')
      .order('scheduled_at', { ascending: false }),
  ]);

  if (studentsRes.error) throw new Error(`Supabase students error: ${studentsRes.error.message}`);
  if (tutorsRes.error)   throw new Error(`Supabase tutors error: ${tutorsRes.error.message}`);
  if (sessionsRes.error) throw new Error(`Supabase sessions error: ${sessionsRes.error.message}`);

  const tutorMap = new Map<string, { name: string; email: string }>();
  for (const t of (tutorsRes.data as any[]) ?? []) {
    tutorMap.set(t.id, { name: t.name ?? '', email: t.email ?? '' });
  }

  // Build student → most recent tutor map (sessions already ordered desc)
  const studentTutorMap = new Map<string, string>();
  for (const s of (sessionsRes.data as any[]) ?? []) {
    if (s.student_id && s.tutor_id && !studentTutorMap.has(s.student_id)) {
      studentTutorMap.set(s.student_id, s.tutor_id);
    }
  }

  return ((studentsRes.data as any[]) ?? []).map((s: any) => {
    const tutorId = studentTutorMap.get(s.id) ?? null;
    const tutor   = tutorId ? tutorMap.get(tutorId) : undefined;
    return {
      id:          s.id,
      name:        s.name ?? '',
      email:       (s.email ?? '').toLowerCase().trim(),
      tutor_id:    tutorId,
      tutor_name:  tutor?.name  ?? null,
      tutor_email: tutor?.email ?? null,
    };
  });
}

// ── CSV helpers ────────────────────────────────────────────────────────────────

function csvCell(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function rowToCSV(r: OutputRow): string {
  return [
    r.ghl_contact_name,
    r.ghl_email,
    r.ghl_phone,
    r.matched_student_name,
    r.matched_student_email,
    r.studycore_tutor_name,
    r.studycore_tutor_email,
    r.match_status,
  ].map(csvCell).join(',');
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n━━━  GHL ↔ StudyCore tutor-match reconciliation  ━━━\n');

  // 1. Pull GHL contacts
  console.log('① Fetching GHL contacts…');
  const allContacts = await fetchAllGHLContacts();
  console.log(`   Total fetched: ${allContacts.length}`);

  // Filter to tagged contacts only
  const contacts = allContacts.filter(c =>
    c.tags.some(t => TARGET_TAGS.has(t.toLowerCase()))
  );
  console.log(`   Tagged (studycore-student / studycore-parent): ${contacts.length}\n`);

  // 2. Pull Supabase students
  console.log('② Fetching Supabase students…');
  const students = await fetchAllStudents();
  console.log(`   Total students: ${students.length}\n`);

  // Build lookup maps
  const byEmail = new Map<string, SupabaseStudent>();
  const byName  = new Map<string, SupabaseStudent>();

  for (const s of students) {
    if (s.email) byEmail.set(s.email, s);           // already lowercased
    const normName = s.name.toLowerCase().trim();
    if (normName) byName.set(normName, s);
  }

  // 3. Match and build output
  console.log('③ Matching contacts…');
  const rows: OutputRow[] = [];
  let matchedByEmail = 0;
  let matchedByName  = 0;
  let noMatch        = 0;

  for (const c of contacts) {
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
    const ghlEmail = (c.email ?? '').toLowerCase().trim();

    let student: SupabaseStudent | undefined;
    let status: MatchStatus = 'no_match';

    // Email match (exact, case-insensitive)
    if (ghlEmail) {
      student = byEmail.get(ghlEmail);
      if (student) {
        status = 'matched_by_email';
        matchedByEmail++;
      }
    }

    // Name match fallback
    if (!student && fullName) {
      student = byName.get(fullName.toLowerCase());
      if (student) {
        status = 'matched_by_name';
        matchedByName++;
      }
    }

    if (!student) noMatch++;

    rows.push({
      ghl_contact_name:      fullName,
      ghl_email:             c.email ?? '',
      ghl_phone:             c.phone ?? '',
      matched_student_name:  student?.name  ?? '',
      matched_student_email: student?.email ?? '',
      studycore_tutor_name:  student?.tutor_name  ?? '',
      studycore_tutor_email: student?.tutor_email ?? '',
      match_status:          status,
    });
  }

  // 4. Write CSV
  const CSV_HEADER = 'ghl_contact_name,ghl_email,ghl_phone,matched_student_name,matched_student_email,studycore_tutor_name,studycore_tutor_email,match_status';
  const csv = [CSV_HEADER, ...rows.map(rowToCSV)].join('\n');

  const outDir  = resolve(process.cwd(), 'scripts/output');
  const outPath = resolve(outDir, 'ghl-tutor-match.csv');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, csv, 'utf8');

  // 5. Summary
  console.log('\n━━━  Summary  ━━━');
  console.log(`  GHL contacts pulled (total):     ${allContacts.length}`);
  console.log(`  GHL contacts with target tags:   ${contacts.length}`);
  console.log(`  Matched by email:                ${matchedByEmail}`);
  console.log(`  Matched by name:                 ${matchedByName}`);
  console.log(`  No match:                        ${noMatch}`);
  console.log(`\n  CSV written to: ${outPath}\n`);
}

main().catch(err => {
  console.error('❌  Fatal:', err);
  process.exit(1);
});
