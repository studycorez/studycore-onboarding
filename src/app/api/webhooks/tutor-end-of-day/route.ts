import { NextRequest, NextResponse } from 'next/server';
import { logEndOfDay } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

function getFieldByLabel(fields: any[], partial: string): string {
  const match = fields.find((f: any) =>
    typeof f.label === 'string' && f.label.toLowerCase().includes(partial.toLowerCase())
  );
  const val = match?.value;
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function deriveConcernsFlag(rawValue: string): string {
  if (!rawValue || rawValue.trim() === '' || rawValue.toLowerCase() === 'no') return 'Green';
  const lower = rawValue.toLowerCase();
  if (lower.includes('urgent') || lower.includes('immediate')) return 'Red';
  return 'Yellow';
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const fields: any[] = body?.data?.fields ?? [];

  const tutorIdNumber      = getFieldByLabel(fields, 'Tutor ID Number');
  const date               = getFieldByLabel(fields, "Today's date").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const sessionsCompleted  = parseInt(getFieldByLabel(fields, 'How many sessions did you complete'), 10) || 0;
  const sessionsMissed     = parseInt(getFieldByLabel(fields, 'How many sessions were missed'), 10) || 0;
  const students           = getFieldByLabel(fields, 'Which students did you see');
  const dayRating          = getFieldByLabel(fields, 'rate your overall day');
  const studentsStruggled  = getFieldByLabel(fields, 'Did any students struggle');
  const studentsGreat      = getFieldByLabel(fields, 'Did any students do especially well');
  const engagementConcerns = getFieldByLabel(fields, 'fit or engagement concerns');
  const concernsRaw        = getFieldByLabel(fields, 'student concerns today that need TQC');
  const logisticsIssues    = getFieldByLabel(fields, 'logistics or scheduling');
  const opsNotes           = getFieldByLabel(fields, 'ops team should know');
  const reflection         = getFieldByLabel(fields, 'personal reflection');

  if (!tutorIdNumber) {
    console.log('[eod] missing tutor ID — skipping');
    return NextResponse.json({ ok: true });
  }

  const concernsFlag = deriveConcernsFlag(concernsRaw);

  await logEndOfDay({
    tutorIdNumber,
    date,
    sessionsCompleted,
    sessionsMissed,
    students,
    dayRating,
    studentsStruggled,
    studentsGreat,
    engagementConcerns,
    concernsFlag,
    logisticsIssues,
    opsNotes,
    reflection,
  });

  return NextResponse.json({ ok: true });
}
