import { NextRequest, NextResponse } from 'next/server';
import { getSscAirtableData } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const name       = req.nextUrl.searchParams.get('name') ?? '';
  const parentName = req.nextUrl.searchParams.get('parentName') ?? '';
  if (!name.trim()) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  try {
    const data = await getSscAirtableData(name.trim(), parentName.trim() || undefined);
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    console.error('[ssc-airtable-student]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
