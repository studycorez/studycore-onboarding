import { NextResponse } from 'next/server';
import { getActiveStudents } from '@/lib/ghl-support';

export const dynamic = 'force-dynamic';

export async function GET() {
  const students = await getActiveStudents();
  return NextResponse.json({ students });
}
