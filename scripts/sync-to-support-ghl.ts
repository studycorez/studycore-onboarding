/**
 * Sync all StudyCore students and parents to the GHL "StudyCore Support" account.
 *
 * GHL Support Location: T4M5UHtoDZkcVAK31IFA
 * Env vars required: GHL_API_KEY, GHL_SUPPORT_LOCATION_ID (or defaults to above)
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/sync-to-support-ghl.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/sync-to-support-ghl.ts --live
 */

import { createClient } from '@supabase/supabase-js';

const LIVE    =  process.argv.includes('--live');
const DRY_RUN = !LIVE;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const GHL_BASE       = 'https://services.leadconnectorhq.com';
const GHL_VERSION    = '2021-07-28';
const LOCATION_ID    = process.env.GHL_SUPPORT_LOCATION_ID || 'T4M5UHtoDZkcVAK31IFA';

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    'Content-Type': 'application/json',
    Version: GHL_VERSION,
  };
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = (fullName ?? '').trim().split(/\s+/);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') || '' };
}

// ── GHL contact upsert (support location) ─────────────────────────────────────

interface ContactBody {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  tags: string[];
  customFields?: Array<{ key: string; field_value: string }>;
}

async function findContactByEmail(email: string): Promise<string | null> {
  const res = await fetch(
    `${GHL_BASE}/contacts/search/duplicate?locationId=${LOCATION_ID}&email=${encodeURIComponent(email)}`,
    { headers: ghlHeaders() },
  );
  if (!res.ok) return null;
  const data = await res.json() as { contact?: { id?: string } };
  return data?.contact?.id ?? null;
}

async function upsertContact(body: ContactBody): Promise<{ id: string | null; action: 'created' | 'updated' | 'failed' }> {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) return { id: null, action: 'failed' };

  try {
    const contactId = await findContactByEmail(body.email);

    if (contactId) {
      // PUT — must NOT include locationId or customField (object form)
      const putBody: Record<string, unknown> = {
        firstName:    body.firstName,
        lastName:     body.lastName,
        email:        body.email,
        tags:         body.tags,
        ...(body.phone ? { phone: body.phone } : {}),
        ...(body.customFields?.length ? { customFields: body.customFields } : {}),
      };

      let res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
        method: 'PUT',
        headers: ghlHeaders(),
        body: JSON.stringify(putBody),
      });

      // Duplicate phone conflict — retry without phone
      if (!res.ok && res.status === 400) {
        const errText = await res.text();
        let isDupPhone = false;
        try { isDupPhone = JSON.parse(errText)?.meta?.matchingField === 'phone'; } catch { /* */ }
        if (isDupPhone) {
          const { phone: _ph, ...noPhone } = putBody as Record<string, unknown>;
          res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
            method: 'PUT',
            headers: ghlHeaders(),
            body: JSON.stringify(noPhone),
          });
        } else {
          console.error(`  [ghl] PUT failed (${body.email}): ${res.status} ${errText}`);
          return { id: null, action: 'failed' };
        }
      }

      if (!res.ok) {
        console.error(`  [ghl] PUT failed (${body.email}): ${res.status} ${await res.text()}`);
        return { id: null, action: 'failed' };
      }
      return { id: contactId, action: 'updated' };

    } else {
      // POST — must NOT include customField (object form)
      const postBody: Record<string, unknown> = {
        locationId:   LOCATION_ID,
        firstName:    body.firstName,
        lastName:     body.lastName,
        email:        body.email,
        tags:         body.tags,
        ...(body.phone ? { phone: body.phone } : {}),
        ...(body.customFields?.length ? { customFields: body.customFields } : {}),
      };

      const res = await fetch(`${GHL_BASE}/contacts/`, {
        method: 'POST',
        headers: ghlHeaders(),
        body: JSON.stringify(postBody),
      });

      if (!res.ok) {
        const errText = await res.text();
        // Duplicate phone — GHL may return existing contact ID in meta
        if (res.status === 400) {
          try {
            const errJson = JSON.parse(errText);
            const dupId = errJson?.meta?.contactId as string | undefined;
            if (dupId) {
              // Update the existing contact instead
              const { locationId: _lid, customFields: _cf, ...updateBody } = postBody as Record<string, unknown>;
              const upRes = await fetch(`${GHL_BASE}/contacts/${dupId}`, {
                method: 'PUT',
                headers: ghlHeaders(),
                body: JSON.stringify(updateBody),
              });
              if (upRes.ok) return { id: dupId, action: 'updated' };
            }
          } catch { /* fall through */ }
        }
        console.error(`  [ghl] POST failed (${body.email}): ${res.status} ${errText}`);
        return { id: null, action: 'failed' };
      }

      const data = await res.json() as { contact?: { id?: string } };
      return { id: data?.contact?.id ?? null, action: 'created' };
    }
  } catch (err) {
    console.error(`  [ghl] error upserting ${body.email}:`, err);
    return { id: null, action: 'failed' };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const HR  = '─'.repeat(72);
  const HR2 = '═'.repeat(72);

  console.log(`\n${HR2}`);
  console.log(`  GHL SUPPORT SYNC — Location: ${LOCATION_ID}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (first 5 contacts, no API calls)' : 'LIVE'}`);
  console.log(`${HR2}\n`);

  // ── Fetch students ──────────────────────────────────────────────────────────
  const { data: students, error: fetchErr } = await supabase
    .from('students')
    .select(`
      id, name, email, phone,
      parent_name, parent_email, parent_phone,
      status, grade, target_score, current_score,
      purchased_hours, used_hours,
      contracts(status, tutor:tutors(name))
    `)
    .order('name');

  if (fetchErr || !students) {
    console.error('Failed to fetch students:', fetchErr?.message);
    process.exit(1);
  }

  console.log(`Fetched ${students.length} students from Supabase.\n`);

  let studentsSynced = 0, studentsUpdated = 0, studentsFailed = 0;
  let parentsSynced = 0, parentsUpdated = 0, parentsFailed = 0;
  let totalProcessed = 0;

  const limit = DRY_RUN ? 5 : students.length;

  for (let i = 0; i < Math.min(limit, students.length); i++) {
    const s = students[i] as typeof students[number] & {
      contracts?: Array<{ status: string; tutor: { name: string } | null }>;
    };

    // Get tutor name from active/signed contract
    const contracts = s.contracts ?? [];
    const activeContract = contracts.find(c => c.status === 'active' || c.status === 'signed')
      ?? contracts[0];
    const tutorName = (activeContract?.tutor as { name?: string } | null)?.name ?? '';
    const hoursRemaining = ((s.purchased_hours ?? 0) - (s.used_hours ?? 0)).toFixed(1);

    const { firstName, lastName } = splitName(s.name ?? '');

    const studentBody: ContactBody = {
      firstName,
      lastName,
      email: s.email,
      phone: s.phone,
      tags:  ['studycore-student', s.status ?? 'unknown'],
      customFields: [
        ...(tutorName           ? [{ key: 'tutor_name',      field_value: tutorName }]             : []),
        ...(s.grade             ? [{ key: 'grade',           field_value: String(s.grade) }]        : []),
        ...(s.target_score != null ? [{ key: 'target_score', field_value: String(s.target_score) }] : []),
        ...(s.current_score != null ? [{ key: 'current_score', field_value: String(s.current_score) }] : []),
        { key: 'hours_remaining', field_value: hoursRemaining },
      ],
    };

    if (DRY_RUN) {
      console.log(`[${i + 1}] STUDENT: ${s.name} <${s.email}>`);
      console.log(`       tags: [${studentBody.tags.join(', ')}]`);
      console.log(`       tutor: ${tutorName || '(none)'} | grade: ${s.grade ?? '—'} | target: ${s.target_score ?? '—'} | current: ${s.current_score ?? '—'} | hours left: ${hoursRemaining}`);
      console.log(`       phone: ${s.phone ?? '(none)'}`);
      if (s.parent_email) {
        const parentName = s.parent_name || `${firstName}'s Parent`;
        const { firstName: pFirst, lastName: pLast } = splitName(parentName);
        console.log(`       PARENT: ${parentName} <${s.parent_email}> | phone: ${s.parent_phone ?? '(none)'}`);
        console.log(`         tags: [studycore-parent] | student_name: ${s.name}`);
      }
      continue;
    }

    // ── Sync student ─────────────────────────────────────────────────────────
    const result = await upsertContact(studentBody);
    if (result.action === 'failed') {
      studentsFailed++;
    } else if (result.action === 'created') {
      studentsSynced++;
    } else {
      studentsUpdated++;
    }
    totalProcessed++;

    // ── Sync parent ───────────────────────────────────────────────────────────
    if (s.parent_email) {
      const parentName = s.parent_name || `${firstName}'s Parent`;
      const { firstName: pFirst, lastName: pLast } = splitName(parentName);

      const parentBody: ContactBody = {
        firstName: pFirst,
        lastName:  pLast,
        email:     s.parent_email,
        phone:     s.parent_phone,
        tags:      ['studycore-parent'],
        customFields: [
          { key: 'student_name', field_value: s.name ?? '' },
        ],
      };

      const parentResult = await upsertContact(parentBody);
      if (parentResult.action === 'failed') {
        parentsFailed++;
      } else if (parentResult.action === 'created') {
        parentsSynced++;
      } else {
        parentsUpdated++;
      }
      totalProcessed++;
    }

    if (totalProcessed % 10 === 0) {
      console.log(`  Progress: ${i + 1}/${students.length} students processed (students: ${studentsSynced + studentsUpdated} ok / ${studentsFailed} failed | parents: ${parentsSynced + parentsUpdated} ok / ${parentsFailed} failed)`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log(`\n${HR2}`);
    console.log(`  DRY RUN COMPLETE — showed first ${Math.min(5, students.length)} of ${students.length} students`);
    console.log(`  Run with --live to sync all ${students.length} students to GHL location ${LOCATION_ID}`);
    console.log(`${HR2}\n`);
    return;
  }

  const parentsWithEmail = students.filter(s => s.parent_email).length;

  console.log(`\n${HR2}`);
  console.log(`  SYNC COMPLETE`);
  console.log(HR2);
  console.log(`  Students synced (created):  ${studentsSynced}`);
  console.log(`  Students synced (updated):  ${studentsUpdated}`);
  console.log(`  Students failed:            ${studentsFailed}`);
  console.log(`  Parents synced (created):   ${parentsSynced}`);
  console.log(`  Parents synced (updated):   ${parentsUpdated}`);
  console.log(`  Parents failed:             ${parentsFailed}`);
  console.log(`  Total contacts with parent: ${parentsWithEmail} / ${students.length}`);
  console.log(`${HR2}\n`);
}

main().catch(err => {
  console.error('\nFatal:', (err as Error).message ?? err);
  process.exit(1);
});
