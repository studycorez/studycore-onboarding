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

    // Look up the tutor's current hourly_rate so the contract reflects the real rate
    const { data: tutor } = await supabase
      .from('tutors')
      .select('hourly_rate')
      .eq('id', tutorId)
      .single();
    const hourlyRate = tutor?.hourly_rate ?? 0;

    // Only void pending contracts — never touch already-signed contracts.
    // Bug fix: the old code used .neq('status', 'voided') which voided signed
    // contracts too, causing a freshly-signed contract to be immediately voided
    // when an admin also clicked "Assign Tutor" on the student profile.
    await supabase
      .from('contracts')
      .update({ status: 'voided' })
      .eq('student_id', studentId)
      .eq('status', 'pending');

    // If there is already a signed contract for this exact tutor-student pair,
    // don't create a duplicate — just return success.
    const { data: existing } = await supabase
      .from('contracts')
      .select('id')
      .eq('student_id', studentId)
      .eq('tutor_id', tutorId)
      .eq('status', 'signed')
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('contracts').insert({
        student_id:  studentId,
        tutor_id:    tutorId,
        status:      'signed',
        hourly_rate: hourlyRate,
        signed_at:   new Date().toISOString(),
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
