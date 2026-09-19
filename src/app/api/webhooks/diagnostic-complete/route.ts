/**
 * Typeform webhook — fires when the diagnostic form (lCS45nq4) is submitted.
 * Moves the student's GHL opportunity to Diagnostic Completed and posts to Slack.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getContactForTracking, moveOpportunityStage, STAGES } from '@/lib/ghl-support';
import { postToSlack } from '@/lib/slack';

export const dynamic = 'force-dynamic';

function extractStudentName(body: any): string {
  const formResponse = body?.form_response ?? body;

  // 1. Hidden field (pre-filled via URL param ?student=Name)
  const hidden = formResponse?.hidden ?? {};
  if (hidden.student) return String(hidden.student).trim();
  if (hidden.student_name) return String(hidden.student_name).trim();

  // 2. Text answers — look for a field ref or label containing "student" or "name"
  const answers: any[] = formResponse?.answers ?? [];
  for (const answer of answers) {
    const ref = (answer?.field?.ref ?? '').toLowerCase();
    const label = (answer?.field?.title ?? answer?.field?.label ?? '').toLowerCase();
    if (ref.includes('student') || ref.includes('name') || label.includes('student') || label.includes('name')) {
      return (answer?.text ?? answer?.email ?? '').trim();
    }
  }

  // 3. First text answer as fallback
  const first = answers.find((a: any) => a.type === 'text' || a.type === 'short_text');
  return (first?.text ?? '').trim();
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const studentName = extractStudentName(body);

  if (!studentName) {
    await postToSlack('⚠️ Diagnostic form submitted — no student name found in payload');
    return NextResponse.json({ ok: true });
  }

  const tracking = await getContactForTracking(studentName);

  if (!tracking?.opportunityId) {
    await postToSlack(`⚠️ Diagnostic complete: *${studentName}* — couldn't find contact in GHL`);
    return NextResponse.json({ ok: true });
  }

  await moveOpportunityStage(tracking.opportunityId, STAGES.DIAGNOSTIC_COMPLETED);
  await postToSlack(`🎯 Diagnostic completed: *${studentName}* — moved to Diagnostic Completed`);

  return NextResponse.json({ ok: true });
}
