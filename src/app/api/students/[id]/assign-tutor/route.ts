import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendContractAssignedNotification } from '@/lib/email';
import { postToSlack } from '@/lib/slack';

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
      .select('hourly_rate, archived_at, name, email')
      .eq('id', tutorId)
      .single();
    if (tutor?.archived_at !== null) {
      return NextResponse.json({ error: 'Cannot assign an archived tutor' }, { status: 400 });
    }
    if (tutor?.hourly_rate == null) {
      return NextResponse.json({
        error: `Cannot assign tutor: ${tutor?.name ?? "Unknown"}'s hourly rate is not set. Set the rate before creating contracts.`
      }, { status: 400 });
    }
    const hourlyRate = tutor.hourly_rate;

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

    let contractId: string;

    if (existing) {
      contractId = existing.id;
    } else {
      const { data: newContract, error } = await supabase.from('contracts').insert({
        student_id:  studentId,
        tutor_id:    tutorId,
        status:      'signed',
        hourly_rate: hourlyRate,
        signed_at:   new Date().toISOString(),
      }).select('id').single();
      if (error || !newContract) {
        return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
      }
      contractId = newContract.id;
    }

    // Get student name for the email
    const { data: student } = await supabase
      .from('students')
      .select('name')
      .eq('id', studentId)
      .single();

    // Notify tutor of assignment
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.studycore.net';
    sendContractAssignedNotification({
      tutorEmail: tutor.email,
      tutorName: tutor.name,
      studentName: student?.name ?? 'Unknown',
      hourlyRate,
      contractId,
      appUrl,
    }).catch(err => {
      console.error('[assign-tutor] Contract notification email failed:', err);
      postToSlack(`🚨 Contract notification email failed for ${tutor.name}: ${err.message}`)
        .catch(() => {});
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
