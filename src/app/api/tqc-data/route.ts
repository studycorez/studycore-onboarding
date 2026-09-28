import { NextRequest, NextResponse } from 'next/server';
import { getComplianceData, getComplianceRange } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

function toYMD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = new Date(from + 'T12:00:00Z');
  const end   = new Date(to   + 'T12:00:00Z');
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(toYMD(d));
  }
  return dates;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = (searchParams.get('mode') ?? 'day') as 'day' | 'week';
  const today = toYMD(new Date());

  let from: string;
  let to: string;

  if (mode === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    from = toYMD(weekAgo);
    to   = today;
  } else {
    const dateParam = searchParams.get('date') ?? today;
    from = dateParam;
    to   = dateParam;
  }

  const data = mode === 'week'
    ? await getComplianceRange(from, to)
    : await getComplianceData(from);

  const dates = getDatesInRange(from, to);
  const totalDays = dates.length;

  const tutorRows = data.tutors.map(tutor => {
    const key = tutor.name.toLowerCase().trim();
    const sodEntries     = data.sodByTutor[key]      ?? [];
    const eodEntries     = data.eodByTutor[key]      ?? [];
    const sessionEntries = data.sessionsByTutor[key] ?? [];

    const sessionCount = sessionEntries.length;
    const fathomCount  = sessionEntries.filter(s => s.hasFathom).length;
    const fathomPct    = sessionCount > 0 ? Math.round((fathomCount / sessionCount) * 100) : 0;

    const hasRedFlag    = eodEntries.some(e => e.concernsFlag === 'Red');
    const hasYellowFlag = eodEntries.some(e => e.concernsFlag === 'Yellow' || e.concernsFlag === 'Red');

    return {
      name:         tutor.name,
      email:        tutor.email,
      phone:        tutor.phone,
      sodDays:      sodEntries.length,
      eodDays:      eodEntries.length,
      sessionCount,
      fathomCount,
      fathomPct,
      hasRedFlag,
      hasYellowFlag,
      totalDays,
    };
  });

  return NextResponse.json({ tutors: tutorRows });
}
