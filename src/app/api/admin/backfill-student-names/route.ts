/**
 * Admin endpoint — backfill STUDENT_NAME and PARENT_NAME custom fields
 * for existing Support GHL contacts that are missing them.
 *
 * Safety rules:
 *   - Never creates contacts or opportunities (read + update only)
 *   - Only writes STUDENT_NAME if the field is currently empty
 *   - Only writes PARENT_NAME if the field is currently empty
 *   - STUDENT_NAME source: opportunity name (what the closer named the deal)
 *   - PARENT_NAME source: contact firstName + lastName (contact IS the parent)
 *   - dryRun=true (default) → preview only, no writes
 *   - dryRun=false → applies changes
 *
 * Usage:
 *   GET /api/admin/backfill-student-names?password=...&dryRun=true   ← preview
 *   GET /api/admin/backfill-student-names?password=...&dryRun=false  ← apply
 */

import { NextRequest, NextResponse } from 'next/server';

const GHL_BASE        = 'https://services.leadconnectorhq.com';
const SUPPORT_LOC     = process.env.GHL_SUPPORT_LOCATION_ID ?? 'T4M5UHtoDZkcVAK31IFA';
const PIPELINE_ID     = 'a9Ytm6ovrr5OK9PHJGrJ';
const CF_STUDENT_NAME = 'SVWWOw5yr7q7POnmp3eY';
const CF_PARENT_NAME  = 'VU2ma6BQHbOHwwAe85WS';
const CF_PARENT_EMAIL = 'JYQAP9bm1eYPcO7t1jyV';

function headers() {
  return {
    Authorization: `Bearer ${process.env.GHL_SUPPORT_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

function getCF(customFields: any[], id: string): string {
  const f = customFields.find((f: any) => f.id === id);
  const v = f?.fieldValueString ?? f?.value ?? f?.fieldValue ?? '';
  return (v === 'null' || !v) ? '' : String(v).trim();
}

async function fetchAllOpportunities(): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `${GHL_BASE}/opportunities/search?location_id=${SUPPORT_LOC}&pipeline_id=${PIPELINE_ID}&limit=100&page=${page}`,
      { headers: headers(), cache: 'no-store' },
    );
    if (!res.ok) break;
    const { opportunities = [], meta } = await res.json();
    all.push(...opportunities);
    if (opportunities.length < 100 || all.length >= (meta?.total ?? 0)) break;
    page++;
  }
  return all;
}

async function fetchContact(contactId: string): Promise<any | null> {
  try {
    const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      headers: headers(), cache: 'no-store',
    });
    return res.ok ? (await res.json())?.contact ?? null : null;
  } catch { return null; }
}

async function updateContactCFs(contactId: string, fields: { studentName?: string; parentName?: string; parentEmail?: string }): Promise<boolean> {
  try {
    const customFields = [
      ...(fields.studentName ? [{ id: CF_STUDENT_NAME, field_value: fields.studentName }] : []),
      ...(fields.parentName  ? [{ id: CF_PARENT_NAME,  field_value: fields.parentName  }] : []),
      ...(fields.parentEmail ? [{ id: CF_PARENT_EMAIL, field_value: fields.parentEmail }] : []),
    ];
    if (!customFields.length) return true;
    const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ customFields }),
    });
    return res.ok;
  } catch { return false; }
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const password = req.nextUrl.searchParams.get('password') ?? '';
  if (password !== (process.env.ADMIN_PASSWORD ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') !== 'false';

  // Fetch all opportunities in the pipeline
  const opps = await fetchAllOpportunities();

  // Filter out [student] opps (tutor broadcast contacts — not real enrollments)
  const enrollmentOpps = opps.filter(o => !String(o.name ?? '').includes('[student]'));

  const results: {
    opportunityId: string;
    opportunityName: string;
    contactId: string;
    contactName: string;
    contactEmail: string;
    currentStudentName: string;
    currentParentName: string;
    proposedStudentName: string;
    proposedParentName: string;
    action: 'skip' | 'update' | 'no-contact';
    writeOk?: boolean;
  }[] = [];

  for (const opp of enrollmentOpps) {
    const contactId: string = opp.contact?.id ?? '';
    if (!contactId) {
      results.push({
        opportunityId: opp.id, opportunityName: opp.name ?? '',
        contactId: '', contactName: '', contactEmail: '',
        currentStudentName: '', currentParentName: '',
        proposedStudentName: '', proposedParentName: '',
        action: 'no-contact',
      });
      continue;
    }

    // Always fetch the full contact to get accurate custom field values
    const contact = await fetchContact(contactId);
    if (!contact) {
      results.push({
        opportunityId: opp.id, opportunityName: opp.name ?? '',
        contactId, contactName: '', contactEmail: '',
        currentStudentName: '', currentParentName: '',
        proposedStudentName: '', proposedParentName: '',
        action: 'no-contact',
      });
      continue;
    }

    const cfs = contact.customFields ?? [];
    const currentStudentName = getCF(cfs, CF_STUDENT_NAME);
    const currentParentName  = getCF(cfs, CF_PARENT_NAME);
    const contactEmail       = contact.email ?? '';
    const contactFullName    = (`${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || contact.name) ?? '';

    // Proposed values — only fill if currently empty
    const proposedStudentName = currentStudentName ? '' : (opp.name ?? '').trim();
    const proposedParentName  = currentParentName  ? '' : contactFullName;
    // PARENT_EMAIL: always ensure it's set to the contact's email (it's always available)
    const currentParentEmail  = getCF(cfs, 'JYQAP9bm1eYPcO7t1jyV');
    const proposedParentEmail = currentParentEmail ? '' : contactEmail;

    const needsUpdate = !!(proposedStudentName || proposedParentName || proposedParentEmail);

    if (!needsUpdate) {
      results.push({
        opportunityId: opp.id, opportunityName: opp.name ?? '',
        contactId, contactName: contactFullName, contactEmail,
        currentStudentName, currentParentName,
        proposedStudentName: '', proposedParentName: '',
        action: 'skip',
      });
      continue;
    }

    let writeOk: boolean | undefined;
    if (!dryRun) {
      writeOk = await updateContactCFs(contactId, {
        studentName: proposedStudentName || undefined,
        parentName:  proposedParentName  || undefined,
        parentEmail: proposedParentEmail || undefined,
      });
    }

    results.push({
      opportunityId: opp.id, opportunityName: opp.name ?? '',
      contactId, contactName: contactFullName, contactEmail,
      currentStudentName, currentParentName,
      proposedStudentName, proposedParentName,
      action: 'update',
      ...(dryRun ? {} : { writeOk }),
    });
  }

  const toUpdate = results.filter(r => r.action === 'update');
  const skipped  = results.filter(r => r.action === 'skip');
  const noContact = results.filter(r => r.action === 'no-contact');

  return NextResponse.json({
    dryRun,
    summary: {
      total: enrollmentOpps.length,
      toUpdate: toUpdate.length,
      skipped: skipped.length,
      noContact: noContact.length,
      ...(dryRun ? {} : { written: toUpdate.filter(r => r.writeOk).length, failed: toUpdate.filter(r => !r.writeOk).length }),
    },
    toUpdate,
    skipped,
  });
}
