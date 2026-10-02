import { NextRequest, NextResponse } from 'next/server';
import { getOpenFlags } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const studentName = searchParams.get('studentName')?.trim() ?? '';

  const allFlags = await getOpenFlags();

  const flags = studentName
    ? allFlags.filter(f =>
        f.studentName.toLowerCase().includes(studentName.toLowerCase()) ||
        studentName.toLowerCase().includes(f.studentName.toLowerCase())
      )
    : allFlags;

  return NextResponse.json({ flags });
}
