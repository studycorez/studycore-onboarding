/**
 * Tally webhook — fires when the diagnostic completion form (RGp2dQ) is submitted.
 * Finds the parent contact by student name, moves both opportunities to DIAGNOSTIC_COMPLETED,
 * and posts a Slack notification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getContactForTracking, moveOpportunityStage, STAGES, moveStudentOpportunityStage } from '@/lib/ghl-support';

interface TallyField {
  key: string;
  label: string;
  type: string;
  value: unknown;
}

function getTallyAnswer(fields: TallyField[], label: string): string {
  const field = fields.find((f) => f.label.toLowerCase() === label.toLowerCase());
  if (!field) return '';
  const v = field.value;
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map((item: any) => item.text ?? '').filter(Boolean).join(', ');
  if (typeof v === 'number') return String(v);
  return String(v);
}

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fields: TallyField[] = body?.data?.fields ?? [];

    const studentName = getTallyAnswer(fields, 'student');

    if (!studentName) return NextResponse.json({ ok: true });

    const tracking = await getContactForTracking(studentName);

    if (tracking?.opportunityId) {
      await moveOpportunityStage(tracking.opportunityId, STAGES.DIAGNOSTIC_COMPLETED);
    }

    await moveStudentOpportunityStage(studentName, STAGES.DIAGNOSTIC_COMPLETED);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[onboard/diagnostic-complete]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
