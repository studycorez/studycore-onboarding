import { NextRequest, NextResponse } from 'next/server';
import { upsertSupportContact, createEnrollmentOpportunity, createSupportTask, type EnrollmentData } from '@/lib/ghl-support';
import { postToSlack } from '@/lib/slack';

function field(fields: any[], label: string): string {
  const f = fields.find((f: any) => f.label === label);
  if (!f || f.value === null || f.value === undefined) return '';
  if (Array.isArray(f.value)) return f.value.join(', ');
  return String(f.value);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fields: any[] = body?.data?.fields ?? [];

    // OD8LXp field labels differ slightly from the sales enrollment form
    const studentName  = field(fields, 'Student Full Name');
    const parentEmail  = field(fields, 'Parent Email');

    if (!parentEmail || !studentName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const packageHoursRaw = field(fields, 'Package Hours');
    const packageHours    = packageHoursRaw ? String(parseFloat(packageHoursRaw) || '') : '';

    const data: EnrollmentData = {
      studentName,
      studentEmail:      field(fields, 'Student Email'),
      studentPhone:      field(fields, 'Student Phone'),
      grade:             field(fields, 'Grade'),
      parentName:        field(fields, 'Parent Full Name'),
      parentEmail,
      parentPhone:       field(fields, 'Parent Phone'),
      packageHours,
      sessionFrequency:  field(fields, 'Session Frequency'),
      hasGuarantee:      field(fields, 'Guarantee Offered'),
      notes:             field(fields, 'Notes from Call'),
      setterName:        field(fields, 'Setter Name'),
      closerName:        field(fields, 'Closer Name'),
    };

    const contactId = await upsertSupportContact(data);

    await Promise.allSettled([
      contactId
        ? createEnrollmentOpportunity(contactId, studentName)
        : Promise.resolve(null),
      contactId
        ? createSupportTask(
            contactId,
            `New handoff: ${studentName} | ${packageHours || '?'}h | ${data.sessionFrequency || '?'}/wk | Closer: ${data.closerName || '?'}`,
            24,
          )
        : Promise.resolve(),
      postToSlack(
        `📋 Handoff received: *${studentName}* | ${packageHours || '?'}h | ${data.sessionFrequency || '?'} | Closer: ${data.closerName || '?'} | ${contactId ? '✅ GHL created' : '⚠️ GHL create failed'}`,
      ),
    ]);

    return NextResponse.json({ ok: true, contactId });
  } catch (err) {
    console.error('[handoff-webhook]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
