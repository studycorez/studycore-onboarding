import { NextResponse } from 'next/server';
import { getOpenFlags } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

export async function GET() {
  const flags = await getOpenFlags();
  return NextResponse.json({ flags });
}
