import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assignTutorToStudent } from '@/lib/contracts/assignTutorToStudent';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const studentId = params.id;
    const { tutorId } = await req.json();
    if (!tutorId) {
      return NextResponse.json({ error: 'tutorId is required' }, { status: 400 });
    }

    const result = await assignTutorToStudent(tutorId, studentId, getDb());

    if (result.error) {
      const status = result.error.includes('not found') ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
