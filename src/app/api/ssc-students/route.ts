import { NextResponse } from 'next/server';
import { getSscStudents } from '@/lib/ghl-support';

export const dynamic = 'force-dynamic';

export async function GET() {
  const students = await getSscStudents();
  return NextResponse.json({ students });
}
