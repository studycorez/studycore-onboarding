import { NextResponse } from 'next/server';
import { getSscStudent } from '@/lib/ghl-support';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const student = await getSscStudent(params.id);
  if (!student) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ student });
}
