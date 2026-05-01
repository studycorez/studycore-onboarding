/**
 * Apply confirmed tutor assignment changes from master sheet audit.
 *
 * 5A – 8 students: reassign (void all signed, create new)
 * 5B – 27 students: new signed contracts (+ Raj Nena's if found)
 * 5C – Savannah/Olivia Park → Christopher Dai; void Avleen/Justin Oliver Zhang contracts
 * 5E – Jessica Ayissi: create Herbert contract on real record
 * 5F – Delete Aanya Sheth duplicate (already deleted — skipped gracefully)
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/apply-tutor-assignments.ts
 *   npx ts-node --project tsconfig.json scripts/apply-tutor-assignments.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── Full UUIDs ────────────────────────────────────────────────────────────────

const TUTOR = {
  DavidZhu:       '3f2ab4fe-74a9-453a-9037-4739889547a9',
  JessePalmer:    'c70f6bb2-2791-4f2c-bac7-eb27456e5a7c',
  Barghav:        '0bdcf468-1ab9-498c-8c09-c1326801908a',
  Rachit:         '4967d63b-4e5c-41fd-8242-71948e0ddc04',
  Lahari:         '5e4e04c8-6b0c-402f-9801-9463d9845c3c',
  Nikhil:         'ccf0d00b-43dd-463a-87b4-64993c29f3ee',
  Akshya:         '01f5aaed-7fd0-4eb3-adc1-2d6c6c87fd76',
  Mazin:          'd40ba100-ca96-4b85-8ebb-5a6bf409407c',
  Aayush:         '7b719b73-818a-419c-8d70-bb530bfc622d',
  Mahir:          'cc9b9106-bb35-4e83-8a9c-2c7ba769a79b',
  Parth:          'c342d623-164d-4141-8bea-96b865507b85',
  SamarthBedre:   '6a6a9237-f217-4c06-be90-edd8a68b5a21',
  Vedanta:        'e30b04f1-3490-4800-adfe-61d08fcd0daf',
  SamrudhJakka:   '4af0ffc7-826b-4821-a11f-db06d900007d',
  Charles:        '722c79f0-7028-42ea-b484-6498eae905e6',
  Tanish:         '7af9c735-dcba-4469-8cb4-50a2b7627892',
  ChristopherDai: '57f7a49f-f42f-4ed1-b64b-e80cb7aa5d98',
  Herbert:        '145c1c81-239e-4abe-97d3-582d2ecc9a91',
  DanielRyu:      '5e687f6a-9732-4118-ad54-640e70c83258',
  OliverZhang:    '56051960-dd5a-4f6b-9e88-e12ed8e0f9ba',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const errors: string[] = [];
let successCount = 0;
let skipCount = 0;

function info(msg: string) { console.log(msg); }
function fail(msg: string) { console.error('  ✗ ' + msg); errors.push(msg); }

async function getTutorRate(tutorId: string): Promise<number> {
  const { data } = await supabase.from('tutors').select('hourly_rate').eq('id', tutorId).maybeSingle();
  return (data as any)?.hourly_rate ?? 0;
}

/** Create a new signed contract (or skip if one already exists with same tutor). */
async function assign(
  studentId: string,
  studentLabel: string,
  tutorId: string,
  tutorLabel: string,
  voidExistingSigned = false,
) {
  if (DRY_RUN) {
    info(`  [dry-run] ${studentLabel} → ${tutorLabel}${voidExistingSigned ? ' (void existing signed first)' : ''}`);
    return;
  }

  // Void pending contracts
  await supabase.from('contracts').update({ status: 'voided' })
    .eq('student_id', studentId).eq('status', 'pending');

  // Optionally void all existing signed contracts (for reassignment)
  if (voidExistingSigned) {
    await supabase.from('contracts').update({ status: 'voided' })
      .eq('student_id', studentId).eq('status', 'signed');
  }

  // Skip if a signed contract with this tutor already exists
  const { data: existing } = await supabase.from('contracts').select('id')
    .eq('student_id', studentId).eq('tutor_id', tutorId).eq('status', 'signed').maybeSingle();
  if (existing) {
    info(`  ⏭  ${studentLabel} already has signed contract with ${tutorLabel}`);
    skipCount++;
    return;
  }

  const rate = await getTutorRate(tutorId);
  const { error } = await supabase.from('contracts').insert({
    student_id:  studentId,
    tutor_id:    tutorId,
    status:      'signed',
    hourly_rate: rate,
    signed_at:   new Date().toISOString(),
  });

  if (error) {
    fail(`${studentLabel} → ${tutorLabel}: ${error.message}`);
  } else {
    info(`  ✅  ${studentLabel} → ${tutorLabel}`);
    successCount++;
  }
}

async function voidContract(studentId: string, studentLabel: string, tutorId: string, tutorLabel: string) {
  if (DRY_RUN) {
    info(`  [dry-run] void ${studentLabel} / ${tutorLabel} contract`);
    return;
  }
  const { error } = await supabase.from('contracts').update({ status: 'voided' })
    .eq('student_id', studentId).eq('tutor_id', tutorId).eq('status', 'signed');
  if (error) {
    fail(`void ${studentLabel}/${tutorLabel}: ${error.message}`);
  } else {
    info(`  ✅  Voided ${studentLabel} / ${tutorLabel}`);
    successCount++;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const HR = '─'.repeat(72);
  console.log(`\n${HR}`);
  console.log('  Apply Tutor Assignments — Master Sheet Corrections');

  if (DRY_RUN) console.log('  *** DRY RUN — no writes will be made ***');
  console.log(`${HR}\n`);

  // ── 5A: Reassign 8 students ──────────────────────────────────────────────────
  console.log('── 5A: Reassign 8 students (void existing signed → new tutor) ──────────\n');

  await assign('e477004e-0c46-4cc9-b81c-2c6fc95289a0', 'Abbie Pongpat',   TUTOR.DavidZhu,    'David Zhu',    true);
  await assign('3d7622e4-abf3-4354-a245-19159d4b6268', 'Adam Hamid',      TUTOR.JessePalmer, 'Jesse Palmer', true);
  await assign('8ffdfeda-f32a-4cac-8316-43f0aa2ca1d9', 'Elijah Zittel',   TUTOR.Barghav,     'Barghav',      true);
  await assign('b954505f-6dc5-43de-9bdb-f7f8e98699fd', 'Enakshi',         TUTOR.Rachit,      'Rachit',       true);
  await assign('22cd0136-e012-4162-93b3-599ee4320924', 'Emerie Smith',    TUTOR.Lahari,      'Lahari',       true);
  await assign('37119113-485b-4560-9c75-fefab59308a4', 'Nitant Handa',    TUTOR.Nikhil,      'Nikhil',       true);
  await assign('4deddced-5c1f-4ca4-8745-2a1fda24309e', 'Shayne Dagleish', TUTOR.Akshya,      'Akshya',       true);
  await assign('3f16977c-7690-4d55-839f-e873be619802', 'Chaitan Praveen', TUTOR.DavidZhu,    'David Zhu',    true);

  // ── 5B: 27 new contracts ─────────────────────────────────────────────────────
  console.log('\n── 5B: Create 27 new contracts ─────────────────────────────────────────\n');

  await assign('b043e73c-f8e6-4c27-ab2b-d9ab05502f19', 'Aadhya Ganatra',    TUTOR.Mazin,       'Mazin');
  await assign('826faa8d-15ca-4a73-bcde-1b37a9ca736b', 'Aditri Sikdar',     TUTOR.DanielRyu,   'Daniel Ryu');
  await assign('670c15a4-5db9-4814-a515-7374e0649eb8', 'Bhargav Padhi',     TUTOR.Lahari,      'Lahari');
  await assign('91a85190-1344-417a-8135-6039db23d3ba', 'David Bogart',      TUTOR.Rachit,      'Rachit');
  await assign('6b175872-eab3-4399-a054-60837346934f', 'Isabel Villarreal', TUTOR.Lahari,      'Lahari');
  await assign('9e672930-7eee-4b4d-9faa-387352288a6e', 'Javyn',             TUTOR.Aayush,      'Aayush');
  await assign('69c26aa5-5c75-410d-9bd9-1dd49d2f538e', 'Kai Rosen',         TUTOR.Lahari,      'Lahari');
  await assign('fee2b73c-8b6b-4f46-81f0-4d7191de35c7', 'Kyle Lerman',       TUTOR.Barghav,     'Barghav');
  await assign('00915fb7-39b5-44f5-9d85-199d963ec7f9', 'Lauren Streck',     TUTOR.Rachit,      'Rachit');
  await assign('a8877569-a789-4176-9939-603dabd6973f', 'Maz',               TUTOR.Mahir,       'Mahir');
  await assign('6ac6991e-52e6-45f1-86ff-9a2e29a9ca51', 'Monica',            TUTOR.Parth,       'Parth');
  await assign('9c2eedce-fc21-4496-a91d-d4d90c68b960', 'Nicholas Z.',       TUTOR.SamarthBedre,'Samarth Bedre');
  await assign('d28f0b9c-2194-4f3c-a479-dd782c31d61f', 'Nnaallah',          TUTOR.Vedanta,     'Vedanta');
  await assign('d5ffe91a-96ce-4196-b5e9-7280cc4df6e9', 'Prisha Kolhe',      TUTOR.SamrudhJakka,'Samrudh Jakka');
  await assign('d0e01dcd-0032-43d5-ac1a-9971693c0baa', 'Raj Cuddapah',      TUTOR.DavidZhu,    'David Zhu');
  await assign('b494c7b6-456f-4817-83dc-736001c0b0ae', 'Roopkatha Bagchi',  TUTOR.Charles,     'Charles');
  await assign('55655882-a7ab-4d1d-9090-ed89e9a89fd9', 'Saanvi Kumar',      TUTOR.Barghav,     'Barghav');
  await assign('37ed3cdf-f8ab-44a7-baa8-ad35bdb768d8', 'Sara Abdelrahman',  TUTOR.Tanish,      'Tanish');
  await assign('b74000ae-7538-43fe-92bf-d67d2c523c30', 'Setaya Motarjem',   TUTOR.Lahari,      'Lahari');
  await assign('1da65752-d444-4314-8539-6a313179d2ac', 'Snehansh',          TUTOR.Mahir,       'Mahir');
  await assign('f6ca9ead-fbbc-472d-ae49-f4ac658f10fd', 'Sophia Winard',     TUTOR.Rachit,      'Rachit');
  await assign('627d6780-038b-4e6c-a61c-3a621ff3c23a', 'Suhani Laddha',     TUTOR.SamrudhJakka,'Samrudh Jakka');
  await assign('90ecac40-5543-4784-8118-79b75aa769f5', 'Sydney Willingham', TUTOR.DavidZhu,    'David Zhu');
  await assign('8442e0aa-66ae-44a2-bd20-eef64fb0f885', 'Vineel Motadikela', TUTOR.Tanish,      'Tanish');
  await assign('35073063-9e22-465c-ab65-cd4a950a410c', 'Vishnu',            TUTOR.SamrudhJakka,'Samrudh Jakka');
  await assign('8e447907-e4fb-488f-93ff-02cb54e12f08', 'Willfred Villasica',TUTOR.SamrudhJakka,'Samrudh Jakka');
  await assign('81246abe-7f2f-4714-af5e-29a1a988e9f2', 'Shreya Samba',      TUTOR.SamrudhJakka,'Samrudh Jakka');

  // 5B: Raj (Nena's) — look up by parent_name
  console.log("\n  Searching for Raj (Nena's) by parent_name…");
  const { data: rajNena } = await supabase.from('students')
    .select('id, name, parent_name, parent_email')
    .ilike('parent_name', '%nena%');
  if (!rajNena || rajNena.length === 0) {
    fail("Raj (Nena's): no student found with parent_name containing 'nena' — needs manual lookup");
  } else {
    for (const r of rajNena as any[]) {
      info(`  Found: ${r.name} (${r.id.slice(0,8)}) parent: ${r.parent_name} / ${r.parent_email}`);
      await assign(r.id, r.name, TUTOR.DavidZhu, 'David Zhu', false);
    }
  }

  // ── 5C ───────────────────────────────────────────────────────────────────────
  console.log('\n── 5C: Christopher Dai + void Oliver Zhang ─────────────────────────────\n');

  await assign('e6dd50b4-4888-4382-9d0a-bb758dbd09c5', 'Savannah',       TUTOR.ChristopherDai, 'Christopher Dai', false);
  await assign('f636a7b4-faa8-4f3a-9948-39a105fd79a0', 'Olivia Park',    TUTOR.ChristopherDai, 'Christopher Dai', false);
  await voidContract('85c953d5-550a-48c6-86f6-c335664a0abe', 'Avleen Gahunia', TUTOR.OliverZhang, 'Oliver Zhang');
  await voidContract('b75d5470-6518-4bcd-a711-134d2a14bcfc', 'Justin Shah',    TUTOR.OliverZhang, 'Oliver Zhang');

  // ── 5E: Jessica Ayissi ───────────────────────────────────────────────────────
  console.log('\n── 5E: Jessica Ayissi — Herbert contract on real record ────────────────\n');

  // Clean import record just in case
  if (!DRY_RUN) {
    await supabase.from('contracts').update({ status: 'voided' })
      .eq('student_id', '425a98ba-eec6-492a-86c3-9b0bc7d3657a').eq('status', 'signed');
    info('  Cleaned any signed contracts on import record (425a98ba)');
  } else {
    info('  [dry-run] Would clean import record 425a98ba signed contracts');
  }
  // Create Herbert contract on real record
  await assign('af2a4427-7c93-430b-8dbc-b658eb4ae47c', 'Jessica Ayissi (real)', TUTOR.Herbert, 'Herbert', false);

  // ── 5F: Aanya Sheth ──────────────────────────────────────────────────────────
  console.log('\n── 5F: Aanya Sheth duplicate ───────────────────────────────────────────\n');
  info('  Aanya Sheth (d648e084) was already deleted — skipping');

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log(`\n${HR}`);
  console.log('  SUMMARY');
  console.log(HR);
  if (!DRY_RUN) {
    console.log(`  Successful operations: ${successCount}`);
    console.log(`  Already correct (skipped): ${skipCount}`);
  }
  console.log(`  Errors: ${errors.length}`);
  for (const e of errors) console.log(`    ✗ ${e}`);
  if (DRY_RUN) console.log('\n  *** DRY RUN — no writes were made ***');
  console.log(`${HR}\n`);
}

main().catch(e => {
  console.error('\nFatal error:', e.message ?? e);
  process.exit(1);
});
