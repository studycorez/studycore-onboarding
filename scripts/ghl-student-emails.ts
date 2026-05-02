/**
 * Resolve real student emails using GHL CRM data and master-sheet hints,
 * then update the Supabase students table accordingly.
 *
 * GHL working credentials:
 *   Key:      GHL_API_KEY env var  (pit-11152df6-...)
 *   Location: 67091iYHBXVeSyRGbCoq
 *   Note: The user-provided location PdWdMrmvmQQXZfrEfcEQ returns 403 with this
 *         key; the correct location for this account is 67091iYHBXVeSyRGbCoq.
 *
 * Findings from GHL lookup + master-sheet cross-reference:
 *
 *   Adam Needleman   GHL: needlemana27@fordhamprep.org ✓ (confirmed)
 *   Aiden Aponte     GHL: aidenaponte30@gmail.com ✓ (confirmed)
 *   Maaz             Master: 4maaz.k00@gmail.com → already in DB as "Maz" (a8877569)
 *   Rauha            Master: 4rauha.khan@gmail.com (no real record in DB)
 *   Wilfred          Master: wrcv9898@gmail.com → already in DB as "Willfred Villasica" (8e447907)
 *
 *   Mrinal Agarwal   NOT found in GHL → manual review
 *   Adithya reddy    NOT found in GHL → manual review
 *   Nick             NOT found in GHL (sessions w/ Samarth) → manual review
 *
 * Actions:
 *   PROMOTE (update stub email in-place — no data movement):
 *     adam@studycore.import          → needlemana27@fordhamprep.org
 *     aiden.aponte.maxwell@studycore.import → aidenaponte30@gmail.com
 *     student-62@studycore.import    → 4rauha.khan@gmail.com
 *
 *   MERGE (real record already exists — move stub sessions/contracts, delete stub):
 *     student-45@studycore.import (Maaz)    → a8877569 (Maz, 4maaz.k00@gmail.com)
 *     wilfred@studycore.import (Wilfred)    → 8e447907 (Willfred Villasica, wrcv9898@gmail.com)
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/ghl-student-emails.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/ghl-student-emails.ts --live
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const LIVE    =  process.argv.includes('--live');
const DRY_RUN = !LIVE;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const GHL_LOC = '67091iYHBXVeSyRGbCoq';
const HR  = '─'.repeat(80);
const HR2 = '═'.repeat(80);

// ── GHL helper ────────────────────────────────────────────────────────────────

interface GHLContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
}

async function ghlSearch(query: string): Promise<GHLContact[]> {
  const key = process.env.GHL_API_KEY;
  if (!key) return [];
  const res = await fetch(
    `https://services.leadconnectorhq.com/contacts/?locationId=${GHL_LOC}&query=${encodeURIComponent(query)}&limit=5`,
    { headers: { Authorization: `Bearer ${key}`, Version: '2021-07-28' } },
  );
  if (!res.ok) return [];
  const data = await res.json() as { contacts?: GHLContact[] };
  return data.contacts ?? [];
}

// ── Actions ───────────────────────────────────────────────────────────────────

// Stubs where we simply update the email in-place (the stub IS the only record).
const PROMOTIONS: Array<{
  label: string;
  stubEmail: string;
  realEmail: string;
  source: string;
}> = [
  {
    label:     'Adam Needleman',
    stubEmail: 'adam@studycore.import',
    realEmail: 'needlemana27@fordhamprep.org',
    source:    'GHL CRM (phone: +19179221759)',
  },
  {
    label:     'Aiden Aponte Maxwell',
    stubEmail: 'aiden.aponte.maxwell@studycore.import',
    realEmail: 'aidenaponte30@gmail.com',
    source:    'GHL CRM (phone: +14704453963)',
  },
  {
    label:     'Rauha',
    stubEmail: 'student-62@studycore.import',
    realEmail: '4rauha.khan@gmail.com',
    source:    'Master spreadsheet',
  },
];

// Stubs with a real record already existing in DB — move sessions/contracts, delete stub.
const MERGES: Array<{
  label: string;
  stubEmail: string;
  realId: string;
  realName: string;
  realEmail: string;
  source: string;
}> = [
  {
    label:     'Maaz',
    stubEmail: 'student-45@studycore.import',
    realId:    'a8877569-a789-4176-9939-603dabd6973f',
    realName:  'Maz',
    realEmail: '4maaz.k00@gmail.com',
    source:    'Master spreadsheet — real record already in DB (8 sessions)',
  },
  {
    label:     'Wilfred',
    stubEmail: 'wilfred@studycore.import',
    realId:    '8e447907-e4fb-488f-93ff-02cb54e12f08',
    realName:  'Willfred Villasica',
    realEmail: 'wrcv9898@gmail.com',
    source:    'Master spreadsheet — real record already in DB (1 session)',
  },
];

// Students still unresolved — report but don't touch.
const MANUAL_REVIEW: Array<{
  label: string;
  stubEmail: string;
  reason: string;
}> = [
  {
    label:     'Mrinal Agarwal',
    stubEmail: 'student-50@studycore.import',
    reason:    'Not found in GHL. nehashoney@gmail.com is parent. Student email unknown — check CRM/spreadsheet.',
  },
  {
    label:     'Adithya reddy',
    stubEmail: 'student-11@studycore.import',
    reason:    'Not found in GHL. 23 sessions with no tutor assigned — may be historical/inactive.',
  },
  {
    label:     'Nick',
    stubEmail: 'nick@studycore.import',
    reason:    'Not found in GHL. 2 sessions with tutor Samarth. Likely Nicholas Zaccagnino — confirm last name and email.',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${HR2}`);
  console.log(`  GHL STUDENT EMAIL RESOLUTION — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`${HR2}\n`);

  // ── Step 1: Show GHL findings ──────────────────────────────────────────────
  console.log(`${HR}`);
  console.log('  GHL CRM LOOKUP RESULTS');
  console.log(HR);

  const ghlQueries = [
    { label: 'Adam Needleman',     query: 'Needleman' },
    { label: 'Aiden Aponte Maxwell', query: 'Aiden' },
    { label: 'Mrinal Agarwal',     query: 'Mrinal' },
    { label: 'Adithya reddy',      query: 'Adithya' },
    { label: 'Nick (Zaccagnino?)', query: 'Zaccagnino' },
    { label: 'Maaz',               query: 'Maaz' },
    { label: 'Rauha',              query: 'Rauha' },
    { label: 'Wilfred',            query: 'Wilfred' },
  ];

  for (const { label, query } of ghlQueries) {
    const contacts = await ghlSearch(query);
    const relevant = contacts.filter(c => c.email); // skip contacts without email
    if (relevant.length === 0) {
      console.log(`  ${label}: no results in GHL for "${query}"`);
    } else {
      console.log(`  ${label}: ${relevant.length} result(s) for "${query}"`);
      for (const c of relevant) {
        console.log(`    • ${c.firstName ?? ''} ${c.lastName ?? ''} | ${c.email} | ${c.phone ?? 'no phone'}`);
      }
    }
  }

  // ── Step 2: Promotion plan ─────────────────────────────────────────────────
  console.log(`\n${HR}`);
  console.log('  PLAN — PROMOTIONS (update stub email in-place)');
  console.log(HR);

  for (const p of PROMOTIONS) {
    const { data: stub } = await supabase.from('students').select('id, name').eq('email', p.stubEmail).maybeSingle();
    if (!stub) {
      console.log(`  ⚠ ${p.label}: stub not found (${p.stubEmail}) — may already be done`);
      continue;
    }
    const { count: sc } = await supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('student_id', stub.id);
    const { count: cc } = await supabase.from('contracts').select('*', { count: 'exact', head: true }).eq('student_id', stub.id);
    console.log(`  ✎ ${p.label} (${stub.name})`);
    console.log(`    Source: ${p.source}`);
    console.log(`    ${p.stubEmail} → ${p.realEmail}`);
    console.log(`    Retains: ${sc} session(s), ${cc} contract(s) on same record`);
  }

  // ── Step 3: Merge plan ─────────────────────────────────────────────────────
  console.log(`\n${HR}`);
  console.log('  PLAN — MERGES (move sessions into existing real record)');
  console.log(HR);

  for (const m of MERGES) {
    const { data: stub } = await supabase.from('students').select('id, name').eq('email', m.stubEmail).maybeSingle();
    if (!stub) {
      console.log(`  ⚠ ${m.label}: stub not found (${m.stubEmail}) — may already be merged`);
      continue;
    }
    const { data: stubSessions } = await supabase
      .from('sessions').select('id, scheduled_at, status, tutor:tutors(name)')
      .eq('student_id', stub.id);
    const { count: realSc } = await supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('student_id', m.realId);
    const { data: stubContracts } = await supabase.from('contracts').select('id, tutor_id, status').eq('student_id', stub.id);
    const { data: realContracts } = await supabase.from('contracts').select('tutor_id').eq('student_id', m.realId);
    const realTutorIds = new Set((realContracts ?? []).map(c => c.tutor_id));

    console.log(`  ↔ ${m.label} stub (${m.stubEmail}) → ${m.realName} (${m.realEmail})`);
    console.log(`    Source: ${m.source}`);
    console.log(`    Real record: ${m.realId} — currently ${realSc} session(s)`);
    console.log(`    Sessions to move (${stubSessions?.length ?? 0}):`);
    for (const s of (stubSessions ?? [])) {
      const tName = (s.tutor as { name?: string } | null)?.name ?? 'no tutor';
      console.log(`      - ${s.id} | ${fmtDate(s.scheduled_at)} | ${s.status} | tutor: ${tName}`);
    }
    for (const c of (stubContracts ?? [])) {
      if (realTutorIds.has(c.tutor_id)) {
        console.log(`    Contract ${c.id}: real record already has contract with ${c.tutor_id.slice(0,8)} → will void stub contract`);
      } else {
        console.log(`    Contract ${c.id}: will move to real record`);
      }
    }
    console.log(`    Then delete stub: ${stub.id}`);
  }

  // ── Step 4: Manual review ──────────────────────────────────────────────────
  console.log(`\n${HR}`);
  console.log('  UNRESOLVED — NEEDS MANUAL REVIEW');
  console.log(HR);

  for (const m of MANUAL_REVIEW) {
    const { data: stub } = await supabase.from('students').select('id').eq('email', m.stubEmail).maybeSingle();
    const { count: sc } = await supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('student_id', stub?.id ?? '');
    console.log(`  ⚠ ${m.label} <${m.stubEmail}> — ${sc} session(s)`);
    console.log(`    ${m.reason}`);
  }

  if (DRY_RUN) {
    console.log(`\n${HR2}`);
    console.log(`  *** DRY RUN — run with --live to apply:`);
    console.log(`        ${PROMOTIONS.length} stub promotions`);
    console.log(`        ${MERGES.length} stub merges`);
    console.log(`        ${MANUAL_REVIEW.length} still unresolved (not applied)`);
    console.log(`  ***`);
    console.log(`${HR2}\n`);
    return;
  }

  // ── APPLY ──────────────────────────────────────────────────────────────────
  console.log(`\n${HR}`);
  console.log('  APPLYING PROMOTIONS');
  console.log(HR);

  let promoted = 0;
  for (const p of PROMOTIONS) {
    const { data: stub } = await supabase.from('students').select('id, name').eq('email', p.stubEmail).maybeSingle();
    if (!stub) { console.log(`  ⚠ ${p.label}: stub not found, skipping`); continue; }
    const { error } = await supabase.from('students').update({ email: p.realEmail }).eq('id', stub.id);
    if (error) { console.error(`  ✗ ${p.label}: ${error.message}`); }
    else { console.log(`  ✓ ${p.label}: ${p.stubEmail} → ${p.realEmail}`); promoted++; }
  }

  console.log(`\n${HR}`);
  console.log('  APPLYING MERGES');
  console.log(HR);

  let sessionsMoved = 0, contractsMoved = 0, stubsDeleted = 0;

  for (const m of MERGES) {
    const { data: stub } = await supabase.from('students').select('id, name').eq('email', m.stubEmail).maybeSingle();
    if (!stub) { console.log(`  ⚠ ${m.label}: stub not found, skipping`); continue; }

    // Move sessions
    const { count: sc } = await supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('student_id', stub.id);
    if ((sc ?? 0) > 0) {
      const { error } = await supabase.from('sessions').update({ student_id: m.realId }).eq('student_id', stub.id);
      if (error) { console.error(`  ✗ ${m.label} sessions: ${error.message}`); continue; }
      sessionsMoved += sc ?? 0;
    }

    // Handle contracts
    const { data: stubContracts } = await supabase.from('contracts').select('id, tutor_id, status').eq('student_id', stub.id);
    const { data: realContracts } = await supabase.from('contracts').select('tutor_id').eq('student_id', m.realId);
    const realTutorIds = new Set((realContracts ?? []).map(c => c.tutor_id));
    for (const c of (stubContracts ?? [])) {
      if (realTutorIds.has(c.tutor_id)) {
        await supabase.from('contracts').update({ status: 'voided' }).eq('id', c.id);
      } else {
        const { error } = await supabase.from('contracts').update({ student_id: m.realId }).eq('id', c.id);
        if (!error) contractsMoved++;
      }
    }

    // Delete stub if empty
    const [{ count: remS }, { count: remC }] = await Promise.all([
      supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('student_id', stub.id),
      supabase.from('contracts').select('*', { count: 'exact', head: true }).eq('student_id', stub.id).neq('status', 'voided'),
    ]);
    if ((remS ?? 0) === 0 && (remC ?? 0) === 0) {
      const { error } = await supabase.from('students').delete().eq('id', stub.id);
      if (error) console.error(`  ✗ delete ${m.label} stub: ${error.message}`);
      else { console.log(`  ✓ Merged & deleted: ${m.label} → ${m.realName}`); stubsDeleted++; }
    } else {
      console.log(`  ⚠ ${m.label}: merged but stub still has data (sessions: ${remS}, contracts: ${remC})`);
    }
  }

  // ── Final summary ──────────────────────────────────────────────────────────
  console.log(`\n${HR2}`);
  console.log('  SUMMARY');
  console.log(HR2);
  console.log(`  Emails found via GHL:          needlemana27@fordhamprep.org (Adam Needleman), aidenaponte30@gmail.com (Aiden)`);
  console.log(`  Emails from master sheet:       4rauha.khan@gmail.com (Rauha), 4maaz.k00@gmail.com (Maaz), wrcv9898@gmail.com (Wilfred)`);
  console.log(`  Stub promotions applied:        ${promoted}`);
  console.log(`  Sessions merged:                ${sessionsMoved}`);
  console.log(`  Contracts merged:               ${contractsMoved}`);
  console.log(`  Stubs deleted:                  ${stubsDeleted}`);
  console.log(`\n  Still unresolved (${MANUAL_REVIEW.length}):`);
  for (const m of MANUAL_REVIEW) {
    console.log(`    ⚠ ${m.label} — ${m.reason}`);
  }
  console.log(`${HR2}\n`);
}

main().catch(err => {
  console.error('\nFatal:', (err as Error).message ?? err);
  process.exit(1);
});
