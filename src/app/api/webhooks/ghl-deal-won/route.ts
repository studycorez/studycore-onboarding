import { NextRequest, NextResponse } from 'next/server';
import {
  upsertSupportContact,
  createEnrollmentOpportunity,
  createSupportTask,
  type EnrollmentData,
} from '@/lib/ghl-support';
import { postToSlack } from '@/lib/slack';

const GHL_BASE = 'https://services.leadconnectorhq.com';
const SALES_LOCATION_ID = process.env.GHL_STUDYCORE_LOCATION_ID ?? '67091iYHBXVeSyRGbCoq';

function salesHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_STUDYCORE_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

/** Fetch the full contact record from Sales GHL (webhook payload may omit some custom fields). */
async function fetchSalesContact(contactId: string): Promise<any | null> {
  try {
    const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      headers: salesHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('[ghl-deal-won] fetchSalesContact failed:', await res.text());
      return null;
    }
    return (await res.json())?.contact ?? null;
  } catch (err) {
    console.error('[ghl-deal-won] fetchSalesContact error:', err);
    return null;
  }
}

/**
 * Pull a value from GHL custom fields array.
 * Matches by fieldKey (dot-notation, e.g. "contact.sessions_per_week")
 * or by a substring of the fieldKey.
 */
function getCF(customFields: any[], ...keys: string[]): string {
  for (const key of keys) {
    const lk = key.toLowerCase();
    const match = customFields.find((cf: any) => {
      const k = (cf.key ?? cf.fieldKey ?? '').toLowerCase();
      return k === lk || k.includes(lk);
    });
    if (match) {
      const val = match.fieldValue ?? match.value ?? match.fieldValueString ?? '';
      if (val && val !== 'null') return String(val);
    }
  }
  return '';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log('[ghl-deal-won] payload:', JSON.stringify(body, null, 2));

    // GHL outbound webhook shape for opportunity events
    const contactPayload = body.contact ?? body.Contact ?? {};
    const opportunityName: string = body.name ?? body.Name ?? '';
    const monetaryValue: string = String(body.monetaryValue ?? body.MonetaryValue ?? '');

    const contactId: string = contactPayload.id ?? contactPayload.Id ?? '';
    if (!contactId) {
      console.warn('[ghl-deal-won] no contactId in payload');
      return NextResponse.json({ error: 'Missing contact id' }, { status: 400 });
    }

    // Fetch full contact to get all custom fields
    const contact = await fetchSalesContact(contactId) ?? contactPayload;
    const customFields: any[] = contact.customFields ?? contact.CustomFields ?? [];

    // ── Parent info (the GHL contact IS the parent) ──────────────────────────
    const parentFirstName: string = contact.firstName ?? contact.FirstName ?? '';
    const parentLastName:  string = contact.lastName  ?? contact.LastName  ?? '';
    const parentName:      string = (`${parentFirstName} ${parentLastName}`.trim() || contact.name) ?? '';
    const parentEmail:     string = contact.email ?? contact.Email ?? '';
    const parentPhone:     string = contact.phone ?? contact.Phone ?? '';

    // ── Student info from custom fields ──────────────────────────────────────
    // Sales reps fill "Student Name" custom field before closing the deal.
    // Fallback: use the opportunity name (closers typically name opps after the student).
    const studentName: string =
      getCF(customFields, 'contact.student_name', 'student_name', 'student name') ||
      opportunityName ||
      'Unknown';

    const studentEmail: string = getCF(customFields, 'contact.student_email', 'student_email', 'student email');
    const studentPhone: string = getCF(customFields, 'contact.student_phone', 'student_phone', 'student phone');
    const grade:        string = getCF(customFields, 'contact.grade', 'grade');
    const currentScore: string = getCF(customFields, 'contact.current_score', 'current_score', 'current sat');
    const targetScore:  string = getCF(customFields, 'contact.target_score', 'target_score', 'target sat', 'target score');
    const sessionsPerWeek: string = getCF(customFields, 'contact.sessions_per_week', 'sessions_per_week', 'sessions per week');
    const packageHours:  string =
      getCF(customFields, 'contact.package_hours', 'package_hours', 'hours', 'package sold') ||
      monetaryValue;
    const targetStartDate: string = getCF(customFields, 'contact.start_date', 'start_date', 'target start');
    const hasGuarantee:  string = getCF(customFields, 'contact.guarantee', 'guarantee');
    const closerName:    string = getCF(customFields, 'contact.closer_name', 'closer_name', 'closer') || (contact.assignedTo ?? '');
    const preferredDays: string = getCF(customFields, 'contact.preferred_days', 'preferred_days', 'preferred session days');
    const preferredTime: string = getCF(customFields, 'contact.preferred_time', 'preferred_time', 'preferred session time');

    if (!parentEmail && !studentName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const data: EnrollmentData = {
      studentName,
      studentEmail,
      studentPhone,
      grade,
      currentScore,
      targetScore,
      parentName,
      parentEmail,
      parentPhone,
      packageHours,
      sessionFrequency: sessionsPerWeek,
      preferredDays,
      preferredTime,
      targetStartDate,
      hasGuarantee,
      closerName,
    };

    const supportContactId = await upsertSupportContact(data);

    await Promise.allSettled([
      supportContactId
        ? createEnrollmentOpportunity(supportContactId, studentName)
        : Promise.resolve(null),
      supportContactId
        ? createSupportTask(
            supportContactId,
            `Awaiting diagnostic: ${studentName} | Start: ${targetStartDate || 'TBD'} | Freq: ${sessionsPerWeek || 'TBD'}`,
            48,
          )
        : Promise.resolve(),
      postToSlack(
        `🎉 New enrollment (Deal Won): *${studentName}* | ${packageHours || '?'}hrs | Closer: ${closerName || '?'} | Start: ${targetStartDate || 'TBD'}`,
      ),
    ]);

    return NextResponse.json({ ok: true, supportContactId, studentName });
  } catch (err: any) {
    console.error('[ghl-deal-won]', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
