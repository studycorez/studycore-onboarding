import { NextResponse } from 'next/server';
import { getStudentsInMatchingStage } from '@/lib/ghl-support';

export async function GET() {
  const students = await getStudentsInMatchingStage();
  return NextResponse.json({ students });
}
