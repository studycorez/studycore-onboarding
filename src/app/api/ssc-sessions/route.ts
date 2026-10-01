import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessions } from '@/lib/airtable';

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  const sessions = await getStudentSessions(name);
  return NextResponse.json({ sessions });
}
