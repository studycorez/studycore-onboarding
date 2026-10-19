/**
 * sync-airtable-students.ts
 *
 * Syncs Airtable active students → Supabase students.
 *
 * Rules:
 *   - Airtable is source of truth for active students.
 *   - Match existing Supabase records by name (case-insensitive).
 *   - Matched: update contact/hours data + stamp airtable_seq/record_id.
 *   - Unmatched Airtable student: insert as new active record.
 *   - Supabase active students with no Airtable match: set cohort='legacy'.
 *   - Also syncs Airtable Tutor ID Numbers → tutors.airtable_tutor_id.
 *
 * Run: npx tsx scripts/sync-airtable-students.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_TOKEN!;
if (!AIRTABLE_TOKEN) throw new Error('AIRTABLE_API_TOKEN not set in .env.local');
const BASE           = 'appTAp5csw4vqR6NA';
const AT_STUDENTS    = 'tbloSDTj4Edc7nPVs';
const AT_TUTORS      = 'tbliVcXBYt1SsRodH';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Airtable helpers ──────────────────────────────────────────────────────────

async function atFetchAll(tableId: string): Promise<any[]> {
  const records: any[] = [];
  let offset: string | undefined;

  while (true) {
    let url = `https://api.airtable.com/v0/${BASE}/${tableId}?pageSize=100`;
    if (offset) url += `&offset=${offset}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });
    const data = await res.json() as any;

    if (data.error) throw new Error(`Airtable error: ${JSON.stringify(data.error)}`);
    records.push(...(data.records ?? []));
    offset = data.offset;
    if (!offset) break;
  }

  return records;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📦  Fetching Airtable tutors…');
  const atTutors = await atFetchAll(AT_TUTORS);
  console.log(`    ${atTutors.length} tutors in Airtable`);

  // Build maps: record ID → tutor, and name → tutor
  const atTutorById: Record<string, any>   = {};
  const atTutorByNum: Record<number, any>  = {};
  for (const t of atTutors) {
    atTutorById[t.id]                         = t.fields;
    atTutorByNum[t.fields['Tutor ID Number']] = { ...t.fields, _id: t.id };
  }

  // Sync tutor ID numbers into Supabase tutors
  console.log('\n🔗  Syncing Airtable tutor IDs into Supabase tutors…');
  const { data: sbTutors } = await supabase.from('tutors').select('id, name, airtable_tutor_id');
  let tutorLinked = 0;
  for (const sbTutor of (sbTutors ?? [])) {
    if (sbTutor.airtable_tutor_id) continue; // already linked

    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const match = atTutors.find(t => norm(t.fields['Name'] ?? '') === norm(sbTutor.name ?? ''));
    if (match) {
      await supabase
        .from('tutors')
        .update({ airtable_tutor_id: match.fields['Tutor ID Number'] })
        .eq('id', sbTutor.id);
      tutorLinked++;
    }
  }
  console.log(`    Linked ${tutorLinked} tutors`);

  // Reload tutors with airtable_tutor_id populated
  const { data: sbTutorsFull } = await supabase.from('tutors').select('id, name, airtable_tutor_id');
  const sbTutorByAtId: Record<number, string> = {};
  for (const t of (sbTutorsFull ?? [])) {
    if (t.airtable_tutor_id) sbTutorByAtId[t.airtable_tutor_id] = t.id;
  }

  console.log('\n📦  Fetching Airtable students…');
  const atStudents = await atFetchAll(AT_STUDENTS);
  console.log(`    ${atStudents.length} active students in Airtable`);

  console.log('\n📦  Fetching Supabase active students…');
  const { data: sbStudents } = await supabase
    .from('students')
    .select('id, name, status, cohort, airtable_seq')
    .in('status', ['active', 'completed']);

  console.log(`    ${sbStudents?.length ?? 0} active/completed students in Supabase`);

  // Build Supabase name → record map (lowercase)
  const norm = (s: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const sbByName: Record<string, any> = {};
  for (const s of (sbStudents ?? [])) {
    sbByName[norm(s.name)] = s;
  }

  const matchedSbIds = new Set<string>();
  let inserted = 0, updated = 0, skipped = 0;

  console.log('\n🔄  Processing Airtable students…');

  for (const rec of atStudents) {
    const f = rec.fields;
    const atName: string = f['Name'] ?? '';
    if (!atName.trim()) { skipped++; continue; }

    // Resolve assigned tutor → Supabase UUID
    const assignedTutorRecIds: string[] = f['Assigned Tutor'] ?? [];
    let tutorId: string | null = null;
    if (assignedTutorRecIds.length > 0) {
      const atTutorFields = atTutorById[assignedTutorRecIds[0]];
      if (atTutorFields) {
        tutorId = sbTutorByAtId[atTutorFields['Tutor ID Number']] ?? null;
      }
    }

    const payload: Record<string, any> = {
      name:            atName.trim(),
      airtable_seq:    f['Seq'] ?? null,
      airtable_record_id: rec.id,
      parent_name:     f['Parent Name']   ?? null,
      parent_email:    f['Parent Email']  ?? null,
      parent_phone:    f['Parent Phone']  ?? null,
      email:           f['Student Email'] ?? null,
      grade:           f['Grade']         ?? null,
      purchased_hours: f['Total Purchased hours'] ?? null,
      used_hours:      f['Hours Delivered']       ?? null,
      current_score:   f['Prior SAT Score']       ?? null,
      target_score:    f['Target Score']          ?? null,
      status:          'active',
      cohort:          'current',
    };
    if (tutorId) payload['tutor_id'] = tutorId;

    const existing = sbByName[norm(atName)];

    if (existing) {
      // Update existing record
      matchedSbIds.add(existing.id);
      const { error } = await supabase
        .from('students')
        .update(payload)
        .eq('id', existing.id);

      if (error) {
        console.error(`  ❌ Update failed for ${atName}: ${error.message}`);
      } else {
        updated++;
        console.log(`  ✅ Updated: ${atName} (seq ${f['Seq']})`);
      }
    } else {
      // Insert new
      const { error } = await supabase.from('students').insert(payload);
      if (error) {
        console.error(`  ❌ Insert failed for ${atName}: ${error.message}`);
      } else {
        inserted++;
        console.log(`  ➕ Inserted: ${atName} (seq ${f['Seq']})`);
      }
    }
  }

  // Mark unmatched Supabase active students as legacy
  const unmatched = (sbStudents ?? []).filter(
    s => !matchedSbIds.has(s.id) && s.status === 'active' && s.cohort !== 'legacy',
  );
  console.log(`\n🏷️  Marking ${unmatched.length} unmatched Supabase active students as legacy…`);
  if (unmatched.length > 0) {
    const { error } = await supabase
      .from('students')
      .update({ cohort: 'legacy' })
      .in('id', unmatched.map(s => s.id));
    if (error) console.error('  ❌ Legacy update failed:', error.message);
    else console.log(`  ✅ ${unmatched.length} students marked legacy`);
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Sync complete
   Updated : ${updated}
   Inserted: ${inserted}
   Legacy  : ${unmatched.length}
   Skipped : ${skipped}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
