/**
 * link-airtable-students.ts
 *
 * Targeted fix: match Airtable students → Supabase students by name and
 * stamp ONLY the linking fields (airtable_seq, airtable_record_id, cohort=current).
 * Does NOT touch email, phone, or any field with unique constraints.
 *
 * Also inserts genuinely new students (in Airtable but not in Supabase).
 * Marks unmatched active Supabase students cohort=legacy.
 *
 * Run: npx tsx scripts/link-airtable-students.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_TOKEN!;
if (!AIRTABLE_TOKEN) throw new Error('AIRTABLE_API_TOKEN not set in .env.local');

const BASE        = 'appTAp5csw4vqR6NA';
const AT_STUDENTS = 'tbloSDTj4Edc7nPVs';
const AT_TUTORS   = 'tbliVcXBYt1SsRodH';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function atFetchAll(tableId: string): Promise<any[]> {
  const records: any[] = [];
  let offset: string | undefined;
  while (true) {
    let url = `https://api.airtable.com/v0/${BASE}/${tableId}?pageSize=100`;
    if (offset) url += `&offset=${offset}`;
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    const data = await res.json() as any;
    if (data.error) throw new Error(`Airtable: ${JSON.stringify(data.error)}`);
    records.push(...(data.records ?? []));
    offset = data.offset;
    if (!offset) break;
  }
  return records;
}

const norm = (s: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

async function main() {
  console.log('📦  Fetching Airtable tutors…');
  const atTutors = await atFetchAll(AT_TUTORS);
  const atTutorById: Record<string, any> = {};
  for (const t of atTutors) atTutorById[t.id] = t.fields;

  // Build Supabase tutor map: airtable_tutor_id → supabase id
  const { data: sbTutors } = await supabase.from('tutors').select('id, airtable_tutor_id');
  const sbTutorByAtId: Record<number, string> = {};
  for (const t of sbTutors ?? []) {
    if (t.airtable_tutor_id) sbTutorByAtId[t.airtable_tutor_id] = t.id;
  }

  console.log('📦  Fetching Airtable students…');
  const atStudents = await atFetchAll(AT_STUDENTS);
  console.log(`    ${atStudents.length} students in Airtable`);

  console.log('📦  Fetching Supabase students…');
  const { data: sbStudents } = await supabase
    .from('students')
    .select('id, name, status, cohort, airtable_seq, email');
  console.log(`    ${sbStudents?.length ?? 0} students in Supabase`);

  // Name → supabase record
  const sbByName: Record<string, any> = {};
  for (const s of sbStudents ?? []) {
    const key = norm(s.name);
    if (!sbByName[key]) sbByName[key] = s; // first match wins
  }

  const matchedSbIds = new Set<string>();
  let linked = 0, inserted = 0, skipped = 0, errors = 0;

  for (const rec of atStudents) {
    const f       = rec.fields;
    const atName  = (f['Name'] ?? '').trim();
    if (!atName) { skipped++; continue; }

    const atSeq: number = f['Seq'];

    // Resolve tutor UUID
    const tutorRecIds: string[] = f['Assigned Tutor'] ?? [];
    let tutorId: string | null = null;
    if (tutorRecIds.length > 0) {
      const atTutorFields = atTutorById[tutorRecIds[0]];
      if (atTutorFields) tutorId = sbTutorByAtId[atTutorFields['Tutor ID Number']] ?? null;
    }

    const existing = sbByName[norm(atName)];

    if (existing) {
      matchedSbIds.add(existing.id);

      // Only update linking fields + safe profile fields — no email/phone (unique constraints)
      const update: Record<string, any> = {
        airtable_seq:       atSeq ?? null,
        airtable_record_id: rec.id,
        cohort:             'current',
        status:             'active',
        purchased_hours:    f['Total Purchased hours'] ?? existing.purchased_hours ?? null,
        used_hours:         f['Hours Delivered'] ?? null,
        parent_name:        f['Parent Name']  || null,
        parent_email:       f['Parent Email'] || null,
        parent_phone:       f['Parent Phone'] || null,
        grade:              f['Grade']        ?? null,
      };
      if (f['Prior SAT Score']) update['current_score'] = f['Prior SAT Score'];
      if (f['Target Score'])    update['target_score']  = f['Target Score'];
      if (tutorId)              update['tutor_id']      = tutorId;

      const { error } = await supabase.from('students').update(update).eq('id', existing.id);
      if (error) {
        console.error(`  ❌  Update failed for ${atName}: ${error.message}`);
        errors++;
      } else {
        linked++;
        console.log(`  ✅  Linked: ${atName} → seq ${atSeq}`);
      }
    } else {
      // Insert as new student — use a placeholder email to avoid unique conflicts
      const placeholderEmail = `at-${atSeq}@studycore.import`;
      const insert: Record<string, any> = {
        name:               atName,
        email:              placeholderEmail,
        airtable_seq:       atSeq ?? null,
        airtable_record_id: rec.id,
        cohort:             'current',
        status:             'active',
        purchased_hours:    f['Total Purchased hours'] ?? null,
        used_hours:         f['Hours Delivered'] ?? null,
        parent_name:        f['Parent Name']  || null,
        parent_email:       f['Parent Email'] || null,
        parent_phone:       f['Parent Phone'] || null,
        grade:              f['Grade']        ?? null,
      };
      if (f['Prior SAT Score']) insert['current_score'] = f['Prior SAT Score'];
      if (f['Target Score'])    insert['target_score']  = f['Target Score'];
      if (tutorId)              insert['tutor_id']      = tutorId;

      const { error } = await supabase.from('students').insert(insert);
      if (error) {
        console.error(`  ❌  Insert failed for ${atName}: ${error.message}`);
        errors++;
      } else {
        inserted++;
        console.log(`  ➕  Inserted: ${atName} (seq ${atSeq})`);
      }
    }
  }

  // Mark unmatched active Supabase students as legacy
  const unmatched = (sbStudents ?? []).filter(
    s => !matchedSbIds.has(s.id) && s.status === 'active' && (s as any).cohort !== 'legacy',
  );
  if (unmatched.length > 0) {
    const { error } = await supabase
      .from('students')
      .update({ cohort: 'legacy' })
      .in('id', unmatched.map(s => s.id));
    if (error) console.error('  ❌  Legacy update failed:', error.message);
    else console.log(`\n🏷️   Marked ${unmatched.length} unmatched active students as legacy`);
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Done
   Linked  : ${linked}
   Inserted: ${inserted}
   Errors  : ${errors}
   Skipped : ${skipped}
━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
