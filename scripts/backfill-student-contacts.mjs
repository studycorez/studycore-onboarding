/**
 * One-time backfill script.
 *
 * Phase 1 — student form responses:
 *   Creates student contact (tagged "student") at New Enrollment stage.
 *
 * Phase 2 — parent form responses (has parent email → reliable GHL lookup):
 *   Finds parent GHL contact by email.
 *   Tags parent contact "parent".
 *   Moves parent opportunity to Onboarding Form Completed (only if still at New Enrollment).
 *   Creates/updates student contact with parent name.
 *   Creates student opportunity at parent's current stage.
 *
 * Run: node scripts/backfill-student-contacts.mjs [optional: "Student Name" to test one]
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Load .env.local ──────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
try {
  const envFile = readFileSync(envPath, 'utf8');
  for (const line of envFile.split('\n')) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  }
} catch {}

// ── Constants ────────────────────────────────────────────────────────────────
const GHL_BASE       = 'https://services.leadconnectorhq.com';
const GHL_API_KEY    = process.env.GHL_SUPPORT_API_KEY;
const TYPEFORM_TOKEN = process.env.TYPEFORM_API_TOKEN;
const LOCATION_ID    = process.env.GHL_SUPPORT_LOCATION_ID ?? 'T4M5UHtoDZkcVAK31IFA';
const PIPELINE_ID    = 'a9Ytm6ovrr5OK9PHJGrJ';

const STUDENT_FORM_ID = 'dGHWF2d6';
const PARENT_FORM_ID  = 'HJ40hGh0';

const STAGE_NEW_ENROLLMENT            = '79095236-7c28-4684-b7ce-29d03e2d1c86';
const STAGE_ONBOARDING_FORM_COMPLETED = 'eb217c7e-1f20-4a6d-aeec-f5123fe625db';

// Student form field refs
const STUDENT_REFS = {
  studentName:  'fd749c8e-2800-4966-83e1-58ae4335dc8d',
  studentEmail: '2e749052-f721-4ab9-86c0-455abd2d9d4f',
  studentPhone: '669cebaa-3e34-4b7b-b3d2-4de72cce1e7d',
};

// Parent form field refs
const PARENT_REFS = {
  parentName:  '0a3f3227-059c-4227-842e-05d294b8a9f1',
  parentEmail: 'cdd6ccc2-b003-4d04-a5e7-423309999cfb',
  studentName: 'b55812e8-941d-40bf-bcfd-43601481e13a',
};

const CF_PARENT_NAME = 'VU2ma6BQHbOHwwAe85WS';

// ── Helpers ──────────────────────────────────────────────────────────────────
function ghlHeaders() {
  return {
    Authorization: `Bearer ${GHL_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

function getAnswer(answers, ref) {
  const a = answers.find(a => a.field?.ref === ref);
  if (!a) return '';
  if (['text', 'short_text', 'long_text'].includes(a.type)) return a.text ?? '';
  if (a.type === 'email') return a.email ?? '';
  if (['number', 'opinion_scale'].includes(a.type)) return String(a.number ?? '');
  if (a.type === 'choice') return a.choice?.label ?? '';
  if (a.type === 'choices') return (a.choices?.labels ?? []).join(', ');
  if (a.type === 'boolean') return a.boolean ? 'Yes' : 'No';
  if (a.type === 'date') return a.date ?? '';
  if (a.type === 'phone_number') return a.phone_number ?? '';
  return '';
}

function splitName(full) {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') || '' };
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Typeform ─────────────────────────────────────────────────────────────────
async function fetchAllTypeformResponses(formId) {
  const responses = [];
  let before = null;
  while (true) {
    const url = new URL(`https://api.typeform.com/forms/${formId}/responses`);
    url.searchParams.set('page_size', '200');
    if (before) url.searchParams.set('before', before);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${TYPEFORM_TOKEN}` },
    });
    if (!res.ok) { console.error(`Typeform error for ${formId}:`, await res.text()); break; }
    const data = await res.json();
    const items = data.items ?? [];
    responses.push(...items);
    console.log(`  Fetched ${items.length} responses (total: ${responses.length})`);
    if (items.length < 200) break;
    before = items[items.length - 1].token;
    await sleep(300);
  }
  return responses;
}

// ── GHL: find parent contact + opportunity by EMAIL (reliable) ────────────────
async function findParentByEmail(email) {
  const res = await fetch(
    `${GHL_BASE}/contacts/search/duplicate?locationId=${LOCATION_ID}&email=${encodeURIComponent(email)}`,
    { headers: ghlHeaders() },
  );
  if (!res.ok) return null;
  const contact = (await res.json())?.contact;
  if (!contact?.id) return null;

  const oppRes = await fetch(
    `${GHL_BASE}/opportunities/search?location_id=${LOCATION_ID}&contact_id=${contact.id}&limit=5`,
    { headers: ghlHeaders() },
  );
  const opps = oppRes.ok ? (await oppRes.json())?.opportunities ?? [] : [];
  const opp = opps[0] ?? null;

  return {
    contactId:     contact.id,
    opportunityId: opp?.id ?? null,
    stageId:       opp?.pipelineStageId ?? STAGE_NEW_ENROLLMENT,
  };
}

// ── GHL: add tag without replacing existing ───────────────────────────────────
async function addTag(contactId, tag) {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, { headers: ghlHeaders() });
  if (!res.ok) return;
  const existing = (await res.json())?.contact?.tags ?? [];
  if (existing.includes(tag)) return;
  await fetch(`${GHL_BASE}/contacts/${contactId}`, {
    method: 'PUT', headers: ghlHeaders(),
    body: JSON.stringify({ tags: [...existing, tag] }),
  });
}

// ── GHL: upsert student contact (tagged "student") ────────────────────────────
async function upsertStudentContact(studentName, parentName, studentEmail = '', studentPhone = '') {
  const { firstName, lastName } = splitName(studentName);

  // Search by email first (most reliable), then by name + student tag
  let contactId = null;
  if (studentEmail) {
    const emailRes = await fetch(
      `${GHL_BASE}/contacts/search/duplicate?locationId=${LOCATION_ID}&email=${encodeURIComponent(studentEmail)}`,
      { headers: ghlHeaders() },
    );
    if (emailRes.ok) contactId = (await emailRes.json())?.contact?.id ?? null;
  }
  if (!contactId) {
    const nameRes = await fetch(
      `${GHL_BASE}/contacts/?locationId=${LOCATION_ID}&query=${encodeURIComponent(studentName)}&limit=10`,
      { headers: ghlHeaders() },
    );
    if (nameRes.ok) {
      const contacts = (await nameRes.json())?.contacts ?? [];
      const match = contacts.find(c => (c.tags ?? []).includes('student'));
      if (match) contactId = match.id;
    }
  }

  const payload = {
    firstName,
    lastName,
    locationId: LOCATION_ID,
    tags: ['student'],
    ...(studentEmail ? { email: studentEmail } : {}),
    ...(studentPhone ? { phone: studentPhone } : {}),
    ...(parentName ? { customFields: [{ id: CF_PARENT_NAME, field_value: parentName }] } : {}),
  };

  if (contactId) {
    await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      method: 'PUT', headers: ghlHeaders(),
      body: JSON.stringify(payload),
    });
    return contactId;
  }

  const res = await fetch(`${GHL_BASE}/contacts/`, {
    method: 'POST', headers: ghlHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) { console.error('  create student contact failed:', await res.text()); return null; }
  return (await res.json())?.contact?.id ?? null;
}

// ── GHL: move opportunity stage ───────────────────────────────────────────────
async function moveOpportunityStage(opportunityId, stageId) {
  await fetch(`${GHL_BASE}/opportunities/${opportunityId}`, {
    method: 'PUT', headers: ghlHeaders(),
    body: JSON.stringify({ pipelineStageId: stageId }),
  });
}

// ── GHL: create student opportunity, or move if stuck at New Enrollment ───────
async function createStudentOpportunity(contactId, studentName, stageId) {
  const oppName = `${studentName} [student]`;
  const searchRes = await fetch(
    `${GHL_BASE}/opportunities/search?location_id=${LOCATION_ID}&q=${encodeURIComponent(oppName)}&limit=5`,
    { headers: ghlHeaders() },
  );
  if (searchRes.ok) {
    const { opportunities = [] } = await searchRes.json();
    if (opportunities.length) {
      const existing = opportunities[0];
      // If stuck at New Enrollment, advance it
      if (existing.pipelineStageId === STAGE_NEW_ENROLLMENT) {
        await moveOpportunityStage(existing.id, stageId);
      }
      return existing.id;
    }
  }
  const res = await fetch(`${GHL_BASE}/opportunities/`, {
    method: 'POST', headers: ghlHeaders(),
    body: JSON.stringify({
      pipelineId: PIPELINE_ID,
      pipelineStageId: stageId,
      contactId,
      name: oppName,
      status: 'open',
      locationId: LOCATION_ID,
    }),
  });
  if (!res.ok) { console.error('  create student opportunity failed:', await res.text()); return null; }
  return (await res.json())?.opportunity?.id ?? null;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!GHL_API_KEY || !TYPEFORM_TOKEN) {
    console.error('Missing GHL_SUPPORT_API_KEY or TYPEFORM_API_TOKEN.');
    process.exit(1);
  }

  const filterName = process.argv[2]?.toLowerCase() ?? null;
  if (filterName) console.log(`\nTest mode — only processing: "${process.argv[2]}"`);

  const SKIP_NAMES = new Set(['test student', 'sample learner', 'test mapping', 'test', 'sample']);
  const isTestName = name => SKIP_NAMES.has(name.toLowerCase()) || name.toLowerCase().startsWith('test ') || name.toLowerCase().startsWith('sample ');

  // ── Phase 1: Student form — create student contacts ───────────────────────
  console.log('\n=== Phase 1: Student onboarding form ===');
  const studentResponses = await fetchAllTypeformResponses(STUDENT_FORM_ID);
  console.log(`Total: ${studentResponses.length} responses`);

  // Deduplicate by student name — keep latest submission per student
  const seenStudents = new Map();
  for (const resp of studentResponses) {
    const name = getAnswer(resp.answers ?? [], STUDENT_REFS.studentName);
    if (name) seenStudents.set(name.toLowerCase(), resp);
  }
  const uniqueStudentResponses = [...seenStudents.values()];
  console.log(`Unique students: ${uniqueStudentResponses.length}`);

  let s_ok = 0, s_skip = 0, s_fail = 0;

  for (const resp of uniqueStudentResponses) {
    const answers = resp.answers ?? [];
    const studentName  = getAnswer(answers, STUDENT_REFS.studentName);
    const studentEmail = getAnswer(answers, STUDENT_REFS.studentEmail);
    const studentPhone = getAnswer(answers, STUDENT_REFS.studentPhone);
    if (!studentName) { s_skip++; continue; }
    if (isTestName(studentName)) { s_skip++; continue; }
    if (filterName && !studentName.toLowerCase().includes(filterName)) { s_skip++; continue; }

    process.stdout.write(`  ${studentName} ... `);
    const contactId = await upsertStudentContact(studentName, '', studentEmail, studentPhone);
    if (contactId) {
      await createStudentOpportunity(contactId, studentName, STAGE_ONBOARDING_FORM_COMPLETED);
      console.log('OK (student contact + opportunity created)');
      s_ok++;
    } else {
      console.log('FAILED');
      s_fail++;
    }
    await sleep(300);
  }
  console.log(`\nPhase 1: ${s_ok} ok, ${s_skip} skipped, ${s_fail} failed`);

  // ── Phase 2: Parent form — find parent by email, move stages ─────────────
  console.log('\n=== Phase 2: Parent onboarding form ===');
  const parentResponses = await fetchAllTypeformResponses(PARENT_FORM_ID);
  console.log(`Total: ${parentResponses.length} responses`);

  // Deduplicate by studentName — keep latest submission per student
  const seen = new Map();
  for (const resp of parentResponses) {
    const answers = resp.answers ?? [];
    const studentName = getAnswer(answers, PARENT_REFS.studentName);
    if (studentName) seen.set(studentName.toLowerCase(), resp);
  }
  const uniqueParentResponses = [...seen.values()];
  console.log(`Unique students: ${uniqueParentResponses.length}`);

  let p_ok = 0, p_skip = 0, p_fail = 0;

  for (const resp of uniqueParentResponses) {
    const answers = resp.answers ?? [];
    const parentName  = getAnswer(answers, PARENT_REFS.parentName);
    const parentEmail = getAnswer(answers, PARENT_REFS.parentEmail);
    const studentName = getAnswer(answers, PARENT_REFS.studentName);

    if (!studentName) { p_skip++; continue; }
    if (isTestName(studentName)) { p_skip++; continue; }
    if (filterName && !studentName.toLowerCase().includes(filterName)) { p_skip++; continue; }

    process.stdout.write(`  ${studentName} (parent: ${parentName}) ... `);

    if (!parentEmail) {
      // No email — can't find parent contact reliably
      // Still update student contact with parent name
      await upsertStudentContact(studentName, parentName);
      console.log('PARTIAL (no parent email, student contact updated only)');
      p_ok++;
      await sleep(300);
      continue;
    }

    const tracking = await findParentByEmail(parentEmail);
    if (!tracking?.contactId) {
      console.log(`SKIP (no GHL contact found for ${parentEmail})`);
      p_skip++;
      await sleep(300);
      continue;
    }

    // Tag parent contact
    await addTag(tracking.contactId, 'parent');

    // Move parent opportunity forward if still at New Enrollment
    let stageId = tracking.stageId;
    if (stageId === STAGE_NEW_ENROLLMENT && tracking.opportunityId) {
      await moveOpportunityStage(tracking.opportunityId, STAGE_ONBOARDING_FORM_COMPLETED);
      stageId = STAGE_ONBOARDING_FORM_COMPLETED;
      process.stdout.write('(parent stage advanced) ');
    }

    // Update student contact with parent name + advance student opportunity stage
    const studentContactId = await upsertStudentContact(studentName, parentName);
    if (studentContactId) {
      // Find existing student opportunity and move it to match parent stage
      const oppName = `${studentName} [student]`;
      const searchRes = await fetch(
        `${GHL_BASE}/opportunities/search?location_id=${LOCATION_ID}&q=${encodeURIComponent(oppName)}&limit=5`,
        { headers: ghlHeaders() },
      );
      if (searchRes.ok) {
        const { opportunities = [] } = await searchRes.json();
        if (opportunities.length) {
          const studentOpp = opportunities[0];
          if (studentOpp.pipelineStageId === STAGE_NEW_ENROLLMENT) {
            await moveOpportunityStage(studentOpp.id, stageId);
          }
        } else {
          // No student opportunity yet — create one at current stage
          await createStudentOpportunity(studentContactId, studentName, stageId);
        }
      }
    }

    console.log('OK');
    p_ok++;
    await sleep(300);
  }

  console.log(`\nPhase 2: ${p_ok} ok, ${p_skip} skipped, ${p_fail} failed`);
  console.log('\nBackfill complete.');
}

main().catch(err => { console.error(err); process.exit(1); });
