import type { SupabaseClient } from '@supabase/supabase-js';
import { sendContractAssignedNotification } from '@/lib/email';
import { postToSlack } from '@/lib/slack';

export interface AssignResult {
  contractId: string;
  alreadySigned: boolean;
  error?: string;
}

/**
 * Assigns a tutor to a student by creating (or finding) a signed contract.
 * - Voids any pending contracts for the student
 * - Returns existing signed contract if one exists for this pair (idempotent)
 * - Otherwise creates a new signed contract
 * - Sends contract notification email to tutor (fire-and-forget)
 */
export async function assignTutorToStudent(
  tutorId: string,
  studentId: string,
  supabase: SupabaseClient,
): Promise<AssignResult> {
  // Look up tutor
  const { data: tutor } = await supabase
    .from('tutors')
    .select('hourly_rate, archived_at, name, email')
    .eq('id', tutorId)
    .single();

  if (!tutor) {
    return { contractId: '', alreadySigned: false, error: 'Tutor not found' };
  }
  if (tutor.archived_at !== null) {
    return { contractId: '', alreadySigned: false, error: 'Cannot assign an archived tutor' };
  }
  if (tutor.hourly_rate == null) {
    return {
      contractId: '',
      alreadySigned: false,
      error: `Cannot assign tutor: ${tutor.name ?? 'Unknown'}'s hourly rate is not set. Set the rate before creating contracts.`,
    };
  }

  const hourlyRate = tutor.hourly_rate;

  // Void pending contracts for this student (not signed ones)
  await supabase
    .from('contracts')
    .update({ status: 'voided' })
    .eq('student_id', studentId)
    .eq('status', 'pending');

  // Check for existing signed contract for this exact pair
  const { data: existing } = await supabase
    .from('contracts')
    .select('id')
    .eq('student_id', studentId)
    .eq('tutor_id', tutorId)
    .eq('status', 'signed')
    .maybeSingle();

  let contractId: string;
  let alreadySigned = false;

  if (existing) {
    contractId = existing.id;
    alreadySigned = true;
  } else {
    const { data: newContract, error } = await supabase
      .from('contracts')
      .insert({
        student_id: studentId,
        tutor_id: tutorId,
        status: 'signed',
        hourly_rate: hourlyRate,
        signed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error || !newContract) {
      return { contractId: '', alreadySigned: false, error: error?.message ?? 'Insert failed' };
    }
    contractId = newContract.id;
  }

  // Get student name for email
  const { data: student } = await supabase
    .from('students')
    .select('name')
    .eq('id', studentId)
    .single();

  // Notify tutor (fire-and-forget)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.studycore.net';
  sendContractAssignedNotification({
    tutorEmail: tutor.email,
    tutorName: tutor.name,
    studentName: student?.name ?? 'Unknown',
    hourlyRate,
    contractId,
    appUrl,
  }).catch(err => {
    console.error('[assignTutorToStudent] Email failed:', err);
    postToSlack(`🚨 Contract notification email failed for ${tutor.name}: ${err.message}`)
      .catch(() => {});
  });

  return { contractId, alreadySigned };
}
