import { NextRequest, NextResponse } from 'next/server';
import { getTopTutorMatches } from '@/lib/tutor-matching';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const matches = await getTopTutorMatches(params.id);
    return NextResponse.json(matches);
  } catch (err: any) {
    console.error('tutor-matches error:', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
