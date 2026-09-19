/**
 * Tally webhook — fires when the diagnostic form is submitted.
 * Moves the student's GHL opportunity to Diagnostic Completed and posts to Slack.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getContactForTracking, moveOpportunityStage, STAGES } from '@/lib/ghl-support';
import { postToSlack } from '@/lib/slack';

export const dynamic = 'force-dynamic';

function getFieldValue(fields: any[], label: string): string {
  const f = fields.find((f: any) =>
    f.label?.toLowerCase() === label.toLowerCase() ||
    f.key === label ||
    f.id === label
  );
  if (!f) return '';
  if (Array.isArray(f.value)) return f.value[0] ?? '';
  return f.value ?? '';
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const fields: any[] = body?.data?.fields ?? [];
  const studentName = getFieldValue(fields, 'student') || getFieldValue(fields, 'Student Name') || '';

  if (!studentName) {
    await postToSlack('⚠️ Diagnostic complete webhook fired — no student name in payload');
    return NextResponse.json({ ok: true });
  }

  const tracking = await getContactForTracking(studentName);

  if (!tracking?.opportunityId) {
    await postToSlack(`⚠️ Diagnostic complete: *${studentName}* — couldn't find contact in GHL`);
    return NextResponse.json({ ok: true });
  }

  await moveOpportunityStage(tracking.opportunityId, STAGES.DIAGNOSTIC_COMPLETED);
  await postToSlack(`🎯 Diagnostic completed: *${studentName}* — stage moved to Diagnostic Completed`);

  return NextResponse.json({ ok: true });
}
