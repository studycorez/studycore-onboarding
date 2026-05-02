/**
 * Fix sessions linked to wrong (duplicate/import) student records, then merge all
 * @studycore.import duplicate records into their real counterparts.
 *
 * Part 1 — Fix the 4 specifically known mismatch cases (as identified by
 *           verify-assignments-from-zoom).  Only student_id is updated; tutor_id
 *           is never touched.
 *
 * Part 2 — Merge ALL @studycore.import records that have a matching real
 *           student record:
 *             • Move sessions   → update student_id
 *             • Move contracts  → upsert (skip if real already has one for that tutor)
 *             • Move invoices   → update student_id
 *             • Delete import stub (unless it still has data we can't move)
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/fix-student-record-links.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/fix-student-record-links.ts --live
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

const HR  = '─'.repeat(80);
const HR2 = '═'.repeat(80);

// ── Part 1: Known mismatches ──────────────────────────────────────────────────
// Sessions currently linked to a wrong (import) student record.
// We look up the "real" record by the canonical email provided.
// Only student_id is changed — tutor_id is never touched.
const KNOWN_FIXES: Array<{
  label: string;
  wrongRecordEmail: string;    // the @studycore.import email of the bad record
  realEmail: string;           // the real student's canonical email
}> = [
  {
    label: 'Emily Dietzenbach',
    wrongRecordEmail: 'emily.dietzenbach@studycore.import',
    // Confirmed: real record is emily.delucia@gmail.com (15 existing sessions),
    // NOT emily123a@outlook.com (which belongs to Emily Choi).
    realEmail:        'emily.delucia@gmail.com',
  },
  {
    label: 'Ann Sherman',
    wrongRecordEmail: 'ann.sherman@studycore.import',
    realEmail:        'asherman76572@gmail.com',
  },
  // Somesh Bhatt and Radhae sessions are already on the correct real record —
  // they were false positives from the Zoom mismatch detector (duplicate student
  // records caused an ambiguous best-match).  We still merge their import stubs
  // in Part 2 below.
];

// ── Part 2a: Stub email promotions ────────────────────────────────────────────
// Some import stubs have NO separate real record — they ARE the only record for
// that student.  For these we simply update the stub's email to the real address
// (promoting it from an import placeholder to a real account).
// Sessions/contracts/invoices stay on the same record; no data movement needed.
const STUB_PROMOTIONS: Array<{
  label: string;
  stubEmail: string;    // current @studycore.import email
  realEmail: string;    // real email to set
}> = [
  {
    label:     'Addy Hill',
    stubEmail: 'addy.hill@studycore.import',
    realEmail: 'addy.jane.hill@gmail.com',
  },
  // Mrinal Agarwal: nehashoney@gmail.com is the parent email; student-specific
  // email unknown.  Skipped — listed in manual-review section.
  // Adithya reddy: no real email provided; no separate real record exists.
  //   Skipped — listed in manual-review section.
  // Aiden Aponte Maxwell: suggested email anayaabraham29@gmail.com belongs to
  //   Anaya Abraham (a different student, tutor: Varun). Skipped.
];

// ── Part 2b: Stubs to exclude from auto-merge ─────────────────────────────────
// These import stubs should NOT be auto-merged into any real record.
const MERGE_EXCLUSIONS = new Set([
  'adam@studycore.import',        // Adam Needleman — keep separate, no merge with Adam Hamid
]);

// ── Part 2c: Manual-review list ───────────────────────────────────────────────
// Import stubs that need a human to identify the correct real email before
// they can be promoted or merged.
const MANUAL_REVIEW: Array<{ label: string; stubEmail: string; reason: string }> = [
  {
    label:     'Aiden Aponte Maxwell',
    stubEmail: 'aiden.aponte.maxwell@studycore.import',
    reason:    'Suggested email anayaabraham29@gmail.com belongs to Anaya Abraham (different student). Provide the correct email.',
  },
  {
    label:     'Mrinal Agarwal',
    stubEmail: 'student-50@studycore.import',
    reason:    'nehashoney@gmail.com is the parent email. Student-specific email unknown — look up in CRM.',
  },
  {
    label:     'Adithya reddy',
    stubEmail: 'student-11@studycore.import',
    reason:    'No real record or email provided. Sessions have no tutor assigned — investigate in CRM.',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordOverlap(a: string, b: string): number {
  const wa = new Set(norm(a).split(' ').filter(w => w.length >= 2));
  const wb = new Set(norm(b).split(' ').filter(w => w.length >= 2));
  let count = 0;
  for (const w of wa) if (wb.has(w)) count++;
  return count;
}

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
  console.log(`  FIX STUDENT RECORD LINKS — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`${HR2}\n`);

  // ── Part 1: Fix known mismatch sessions ─────────────────────────────────────
  console.log(`${HR2}`);
  console.log('  PART 1 — Fix known mismatch sessions (student_id only)');
  console.log(HR2);

  interface FixAction {
    sessionId: string;
    scheduledAt: string;
    status: string;
    wrongStudentId: string;
    realStudentId: string;
    label: string;
  }

  const part1Actions: FixAction[] = [];

  for (const fix of KNOWN_FIXES) {
    console.log(`\n${HR}`);
    console.log(`  ${fix.label}`);

    // Look up wrong record
    const { data: wrongRec } = await supabase
      .from('students').select('id, name, email')
      .eq('email', fix.wrongRecordEmail).maybeSingle();

    // Look up real record
    const { data: realRec } = await supabase
      .from('students').select('id, name, email')
      .eq('email', fix.realEmail).maybeSingle();

    if (!wrongRec) {
      console.log(`  ⚠ Wrong record not found (email: ${fix.wrongRecordEmail}) — may already be cleaned up`);
      if (realRec) console.log(`  Real record: ${realRec.name} <${realRec.email}> (${realRec.id})`);
      continue;
    }
    if (!realRec) {
      console.log(`  ✗ Real record NOT FOUND for email: ${fix.realEmail}`);
      console.log(`  Wrong record: ${wrongRec.name} <${wrongRec.email}> (${wrongRec.id})`);
      continue;
    }

    console.log(`  Wrong record: ${wrongRec.name} <${wrongRec.email}>`);
    console.log(`    id: ${wrongRec.id}`);
    if (!realRec.name.toLowerCase().includes(fix.label.split(' ')[0].toLowerCase())) {
      console.log(`  ⚠ NOTE: Real record name is "${realRec.name}" — different from expected "${fix.label}"`);
      console.log(`          Verify this is the correct record before applying.`);
    }
    console.log(`  Real record:  ${realRec.name} <${realRec.email}>`);
    console.log(`    id: ${realRec.id}`);

    // Find sessions on the wrong record
    const { data: wrongSessions } = await supabase
      .from('sessions')
      .select('id, scheduled_at, status, tutor_id, tutor:tutors(name)')
      .eq('student_id', wrongRec.id);

    if (!wrongSessions?.length) {
      console.log(`  No sessions on wrong record — nothing to move`);
      continue;
    }

    console.log(`\n  Sessions on wrong record: ${wrongSessions.length}`);
    for (const s of wrongSessions) {
      const tutorName = (s.tutor as { name?: string } | null)?.name ?? s.tutor_id;
      console.log(`    - ${s.id} | ${fmtDate(s.scheduled_at)} | ${s.status} | tutor: ${tutorName}`);
      part1Actions.push({
        sessionId:      s.id,
        scheduledAt:    s.scheduled_at,
        status:         s.status,
        wrongStudentId: wrongRec.id,
        realStudentId:  realRec.id,
        label:          fix.label,
      });
    }
    console.log(`  Action: update student_id on ${wrongSessions.length} session(s)`);
    console.log(`    ${wrongRec.id} → ${realRec.id}`);
  }

  // ── Part 2: Merge all @studycore.import duplicates ──────────────────────────
  console.log(`\n${HR2}`);
  console.log('  PART 2 — Merge all @studycore.import duplicates into real records');
  console.log(HR2);

  // Fetch all import stubs
  const { data: importStubs } = await supabase
    .from('students')
    .select('id, name, email')
    .like('email', '%@studycore.import');

  // Also fetch stubs with student-N@ pattern
  const { data: importStubs2 } = await supabase
    .from('students')
    .select('id, name, email')
    .like('email', 'student-%@studycore.import');

  const allImportStubs = [...(importStubs ?? []), ...(importStubs2 ?? [])];
  // Deduplicate
  const seenIds = new Set<string>();
  const stubs = allImportStubs.filter(s => {
    if (seenIds.has(s.id)) return false;
    seenIds.add(s.id);
    return true;
  });

  console.log(`\n  Found ${stubs.length} @studycore.import records\n`);

  // Fetch all real students (not import)
  const { data: realStudents } = await supabase
    .from('students').select('id, name, email')
    .not('email', 'like', '%@studycore.import')
    .not('email', 'like', 'student-%@studycore.import');

  type RealStudent = { id: string; name: string; email: string };

  interface MergeAction {
    stub: RealStudent;
    real: RealStudent;
    sessions: number;
    contracts: number;
    invoices: number;
    skipContracts: Array<{ tutorId: string; reason: string }>;
  }

  const mergeActions: MergeAction[] = [];
  const skipped: Array<{ stub: typeof stubs[0]; reason: string }> = [];

  for (const stub of stubs) {
    // Skip explicitly excluded stubs
    if (MERGE_EXCLUSIONS.has(stub.email)) {
      skipped.push({ stub, reason: 'Excluded from auto-merge (manual review required)' });
      continue;
    }

    // Skip stubs handled by STUB_PROMOTIONS (they get promoted, not merged)
    if (STUB_PROMOTIONS.some(p => p.stubEmail === stub.email)) {
      continue; // handled separately below
    }

    // Find best real match by name similarity
    let bestReal: RealStudent | null = null;
    let bestScore = 0;
    for (const r of (realStudents ?? [])) {
      const score = wordOverlap(stub.name, r.name);
      if (score > bestScore) { bestScore = score; bestReal = r; }
    }

    if (!bestReal || bestScore < 1) {
      skipped.push({ stub, reason: `No name match found (best score ${bestScore})` });
      continue;
    }

    // Get counts of things to move
    const [
      { count: sessionCount },
      { data: stubContracts },
      { count: invoiceCount },
    ] = await Promise.all([
      supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('student_id', stub.id),
      supabase.from('contracts').select('tutor_id, status').eq('student_id', stub.id),
      supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('student_id', stub.id),
    ]);

    const { data: realContracts } = await supabase
      .from('contracts').select('tutor_id, status').eq('student_id', bestReal.id);

    // Identify contract conflicts (real already has a contract with the same tutor)
    const skipContracts: Array<{ tutorId: string; reason: string }> = [];
    for (const c of (stubContracts ?? [])) {
      const conflict = (realContracts ?? []).find(rc => rc.tutor_id === c.tutor_id);
      if (conflict) {
        skipContracts.push({
          tutorId: c.tutor_id,
          reason: `Real record already has ${conflict.status} contract with this tutor`,
        });
      }
    }

    const contractsToMove = (stubContracts?.length ?? 0) - skipContracts.length;

    mergeActions.push({
      stub,
      real: bestReal,
      sessions:      sessionCount ?? 0,
      contracts:     contractsToMove,
      invoices:      invoiceCount ?? 0,
      skipContracts,
    });
  }

  // Print merge plan
  let totalSessions  = 0;
  let totalContracts = 0;
  let totalInvoices  = 0;
  let totalDeleted   = 0;

  for (const a of mergeActions) {
    const nameMatch = wordOverlap(a.stub.name, a.real.name) >= 2 ? '✓' : '~';
    const hasData = a.sessions > 0 || a.contracts > 0 || a.invoices > 0;
    if (!hasData) {
      // Empty stub — will just delete
      totalDeleted++;
      continue;
    }

    console.log(`  ${nameMatch} ${a.stub.name} <${a.stub.email}>`);
    console.log(`    → REAL: ${a.real.name} <${a.real.email}>`);
    if (a.sessions  > 0) { console.log(`      Move ${a.sessions} session(s)`);  totalSessions  += a.sessions; }
    if (a.contracts > 0) { console.log(`      Move ${a.contracts} contract(s)`); totalContracts += a.contracts; }
    if (a.invoices  > 0) { console.log(`      Move ${a.invoices} invoice(s)`);   totalInvoices  += a.invoices; }
    for (const sc of a.skipContracts) {
      console.log(`      Skip contract with ${sc.tutorId.slice(0, 8)}: ${sc.reason}`);
    }
    console.log(`      Delete stub: ${a.stub.id}`);
    totalDeleted++;
  }

  // Print stub promotions (email-only updates — no data movement)
  if (STUB_PROMOTIONS.length) {
    console.log(`\n  Stub promotions (email update only, no data movement):`);
    for (const p of STUB_PROMOTIONS) {
      const { data: stubRec } = await supabase.from('students').select('id, name').eq('email', p.stubEmail).maybeSingle();
      const { count: sc } = await supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('student_id', stubRec?.id ?? '');
      console.log(`  ✎ ${p.label} <${p.stubEmail}>`);
      console.log(`    → Update email to: ${p.realEmail}  (${sc} sessions stay on same record)`);
    }
  }

  // Print manual review
  console.log(`\n  Skipped — needs manual review (${MANUAL_REVIEW.length}):`);
  for (const m of MANUAL_REVIEW) {
    const { data: stubRec } = await supabase.from('students').select('id').eq('email', m.stubEmail).maybeSingle();
    const { count: sc } = await supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('student_id', stubRec?.id ?? '');
    console.log(`    ⚠ ${m.label} <${m.stubEmail}> — sessions: ${sc}`);
    console.log(`      ${m.reason}`);
  }

  if (skipped.length) {
    console.log(`\n  Auto-skipped (no name match or excluded):`);
    for (const s of skipped) {
      const { count } = await supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('student_id', s.stub.id);
      console.log(`    ${s.stub.name} <${s.stub.email}> — ${s.reason} — sessions: ${count}`);
    }
  }

  console.log(`\n${HR}`);
  console.log(`  PART 2 TOTALS:`);
  console.log(`    Sessions to move:      ${totalSessions}`);
  console.log(`    Contracts to move:     ${totalContracts}`);
  console.log(`    Invoices to move:      ${totalInvoices}`);
  console.log(`    Stubs to delete:       ${totalDeleted}`);
  console.log(`    Stub email promotions: ${STUB_PROMOTIONS.length}`);
  console.log(`    Needs manual review:   ${MANUAL_REVIEW.length}`);

  if (DRY_RUN) {
    console.log(`\n${HR2}`);
    const p1Count = part1Actions.length;
    const p2Sessions = mergeActions.reduce((s, a) => s + a.sessions, 0);
    console.log(`  *** DRY RUN — run with --live to apply:`);
    console.log(`        Part 1:  relinkstudent_id on ${p1Count} session(s)`);
    console.log(`        Part 2a: promote ${STUB_PROMOTIONS.length} stub email(s)`);
    console.log(`        Part 2b: merge ${mergeActions.filter(a => a.sessions+a.contracts+a.invoices > 0).length} stubs` +
      ` (${p2Sessions} sessions, ${totalContracts} contracts, ${totalInvoices} invoices, delete ${totalDeleted} stubs)`);
    console.log(`        Manual:  ${MANUAL_REVIEW.length} stubs need manual review (not applied)`);
    console.log(`  ***`);
    console.log(`${HR2}\n`);
    return;
  }

  // ── APPLY ─────────────────────────────────────────────────────────────────────
  console.log(`\n${HR}`);
  console.log('  APPLYING PART 1 — session student_id fixes');
  console.log(HR);

  let p1Updated = 0, p1Errors = 0;
  for (const a of part1Actions) {
    const { error } = await supabase.from('sessions')
      .update({ student_id: a.realStudentId })
      .eq('id', a.sessionId);
    if (error) {
      console.error(`  ✗ session ${a.sessionId}: ${error.message}`);
      p1Errors++;
    } else {
      console.log(`  ✓ ${a.label} — session ${a.sessionId} (${fmtDate(a.scheduledAt)})`);
      p1Updated++;
    }
  }
  console.log(`  Part 1: ${p1Updated} updated, ${p1Errors} errors`);

  console.log(`\n${HR}`);
  console.log('  APPLYING PART 2a — stub email promotions');
  console.log(HR);

  let p2aPromoted = 0;
  for (const p of STUB_PROMOTIONS) {
    const { data: stubRec } = await supabase.from('students').select('id, name').eq('email', p.stubEmail).maybeSingle();
    if (!stubRec) {
      console.log(`  ⚠ ${p.label}: stub not found (${p.stubEmail}) — may already be promoted`);
      continue;
    }
    const { error } = await supabase.from('students').update({ email: p.realEmail }).eq('id', stubRec.id);
    if (error) { console.error(`  ✗ promote ${p.label}: ${error.message}`); }
    else { console.log(`  ✓ Promoted ${p.label}: ${p.stubEmail} → ${p.realEmail}`); p2aPromoted++; }
  }
  console.log(`  Part 2a: ${p2aPromoted} promoted`);

  console.log(`\n${HR}`);
  console.log('  APPLYING PART 2b — merge import stubs');
  console.log(HR);

  let p2Sessions  = 0, p2Contracts  = 0, p2Invoices  = 0, p2Deleted  = 0;
  let p2Errors    = 0;

  for (const a of mergeActions) {
    const { stub, real } = a;

    // Move sessions
    if (a.sessions > 0) {
      const { error } = await supabase.from('sessions')
        .update({ student_id: real.id })
        .eq('student_id', stub.id);
      if (error) { console.error(`  ✗ sessions for ${stub.name}: ${error.message}`); p2Errors++; }
      else p2Sessions += a.sessions;
    }

    // Move contracts (skip conflicting ones)
    if (a.contracts > 0 || a.skipContracts.length > 0) {
      const { data: stubContracts } = await supabase
        .from('contracts').select('*').eq('student_id', stub.id);
      for (const c of (stubContracts ?? [])) {
        const skip = a.skipContracts.find(sc => sc.tutorId === c.tutor_id);
        if (skip) {
          // Just void the stub's contract instead of moving
          await supabase.from('contracts').update({ status: 'voided' }).eq('id', c.id);
          continue;
        }
        const { error } = await supabase.from('contracts')
          .update({ student_id: real.id })
          .eq('id', c.id);
        if (error) { console.error(`  ✗ contract for ${stub.name}: ${error.message}`); p2Errors++; }
        else p2Contracts++;
      }
    }

    // Move invoices
    if (a.invoices > 0) {
      const { error } = await supabase.from('invoices')
        .update({ student_id: real.id })
        .eq('student_id', stub.id);
      if (error) { console.error(`  ✗ invoices for ${stub.name}: ${error.message}`); p2Errors++; }
      else p2Invoices += a.invoices;
    }

    // Delete stub (only if it now has no remaining data)
    const [{ count: remSessions }, { count: remContracts }] = await Promise.all([
      supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('student_id', stub.id),
      supabase.from('contracts').select('*', { count: 'exact', head: true }).eq('student_id', stub.id).neq('status', 'voided'),
    ]);
    if ((remSessions ?? 0) === 0 && (remContracts ?? 0) === 0) {
      const { error } = await supabase.from('students').delete().eq('id', stub.id);
      if (error) { console.error(`  ✗ delete stub ${stub.name}: ${error.message}`); }
      else { console.log(`  ✓ Merged & deleted: ${stub.name} → ${real.name}`); p2Deleted++; }
    } else {
      console.log(`  ⚠ ${stub.name}: merged data but stub still has rows — not deleted`);
    }
  }

  // Print manual-review reminder
  console.log(`\n${HR}`);
  console.log('  NEEDS MANUAL REVIEW (not applied):');
  console.log(HR);
  for (const m of MANUAL_REVIEW) {
    console.log(`  ⚠ ${m.label} <${m.stubEmail}>`);
    console.log(`    ${m.reason}`);
  }
  for (const s of skipped) {
    const { count } = await supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('student_id', s.stub.id);
    if ((count ?? 0) > 0) {
      console.log(`  ⚠ ${s.stub.name} <${s.stub.email}> — ${s.reason} — sessions: ${count}`);
    }
  }

  console.log(`\n${HR2}`);
  console.log('  DONE');
  console.log(HR2);
  console.log(`  Sessions relinked (Part 1): ${p1Updated}`);
  console.log(`  Stub email promotions:      ${p2aPromoted}`);
  console.log(`  Sessions merged (Part 2b):  ${p2Sessions}`);
  console.log(`  Contracts merged:           ${p2Contracts}`);
  console.log(`  Invoices merged:            ${p2Invoices}`);
  console.log(`  Import stubs deleted:       ${p2Deleted}`);
  console.log(`  Needs manual review:        ${MANUAL_REVIEW.length + skipped.filter(s => MERGE_EXCLUSIONS.has(s.stub.email)).length}`);
  if (p1Errors + p2Errors > 0) console.log(`  Errors: ${p1Errors + p2Errors}`);
  console.log(`${HR2}\n`);
}

main().catch(err => {
  console.error('\nFatal:', (err as Error).message ?? err);
  process.exit(1);
});
