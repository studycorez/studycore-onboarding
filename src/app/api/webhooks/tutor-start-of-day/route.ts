import { NextRequest, NextResponse } from 'next/server';
import { logStartOfDay } from '@/lib/airtable';

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

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const fields: any[] = body?.data?.fields ?? [];

  const tutorIdNumber  = getFieldByLabel(fields, 'Tutor ID Number');
  const date           = getFieldByLabel(fields, "Today's date").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const numSessionsRaw = getFieldByLabel(fields, 'How many sessions');
  const students       = getFieldByLabel(fields, 'Which students');
  const reviewedNotes  = getFieldByLabel(fields, 'reviewed your notes');
  const materialsReady = getFieldByLabel(fields, 'materials and lesson');
  const confidence     = getFieldByLabel(fields, 'confident');
  const challenges     = getFieldByLabel(fields, 'anticipate any challenges');
  const supportNeeded  = getFieldByLabel(fields, 'support or resources');

  if (!tutorIdNumber) {
    console.log('[sod] missing tutor ID — skipping');
    return NextResponse.json({ ok: true });
  }

  await logStartOfDay({
    tutorIdNumber,
    date,
    numSessions: parseInt(numSessionsRaw, 10) || 0,
    students,
    reviewedNotes,
    materialsReady,
    confidence,
    challenges,
    supportNeeded,
  });

  return NextResponse.json({ ok: true });
}
