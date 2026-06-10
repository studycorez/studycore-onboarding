import type { SupabaseClient } from '@supabase/supabase-js';

export async function validateSessionForAttestation(
  supabase: SupabaseClient,
  sessionId: string,
  authTutorId: string,
): Promise<{ session: any } | { error: string; status: number }> {
  const { data: session, error } = await supabase
    .from('sessions')
    .select('id, tutor_id, student_id, attestation_state, scheduled_at, duration_minutes, hours_finalized')
    .eq('id', sessionId)
    .single();

  if (error || !session) {
    return { error: 'Session not found', status: 404 };
  }

  if (session.tutor_id !== authTutorId) {
    return { error: 'Forbidden', status: 403 };
  }

  if (session.attestation_state !== 'pending') {
    return { error: `Cannot attest session in state '${session.attestation_state}'`, status: 409 };
  }

  return { session };
}
