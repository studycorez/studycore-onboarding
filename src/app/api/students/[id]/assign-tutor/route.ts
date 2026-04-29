import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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

    // Void any existing non-voided contracts first
    await supabase
      .from('contracts')
      .update({ status: 'voided' })
      .eq('student_id', studentId)
      .neq('status', 'voided');

    // Create a signed contract linking this student to the tutor
    const { error } = await supabase.from('contracts').insert({
      student_id:  studentId,
      tutor_id:    tutorId,
      status:      'signed',
      hourly_rate: 0,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
