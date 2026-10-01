import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessions } from '@/lib/airtable';

export async function GET(req: NextRequest) {
  const seqParam = req.nextUrl.searchParams.get('seq');
  if (!seqParam) {
    return NextResponse.json({ sessions: [], totalHoursUsed: 0 });
  }
  const seq = parseInt(seqParam, 10);
  if (isNaN(seq)) {
    return NextResponse.json({ sessions: [], totalHoursUsed: 0 });
  }
  const { sessions, totalHoursUsed } = await getStudentSessions(seq);
  return NextResponse.json({ sessions, totalHoursUsed });
}
