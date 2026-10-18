import { NextRequest, NextResponse } from 'next/server';
import { getStudentCheckins } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const recordId = req.nextUrl.searchParams.get('recordId') ?? '';
  if (!recordId.trim()) return NextResponse.json({ error: 'Missing recordId' }, { status: 400 });

  try {
    const checkins = await getStudentCheckins(recordId.trim());
    return NextResponse.json({ checkins });
  } catch (err) {
    console.error('[ssc-checkins]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
