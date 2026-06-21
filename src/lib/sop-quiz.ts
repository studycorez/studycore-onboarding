import type { SupabaseClient } from '@supabase/supabase-js';

export interface SopVersion {
  id: string;
  version_number: string;
  sop_url: string;
  is_major: boolean;
}

export interface TutorSopStatus {
  passed: boolean;
  current_version_id: string;
  current_version_url: string;
  attempts_used: number;
  attempts_remaining: number;
  locked_until: string | null;
  is_locked: boolean;
  last_attempt_score: number | null;
}

export async function getCurrentSopVersion(
  supabase: SupabaseClient,
): Promise<SopVersion | null> {
  const { data, error } = await supabase
    .from('sop_versions')
    .select('id, version_number, sop_url, is_major')
    .eq('is_major', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as SopVersion;
}

export async function getTutorSopStatus(
  tutorId: string,
  supabase: SupabaseClient,
): Promise<TutorSopStatus | null> {
  const version = await getCurrentSopVersion(supabase);
  if (!version) return null;

  const { data: ack } = await supabase
    .from('tutor_sop_acknowledgments')
    .select('attempts_used, last_attempt_at, last_attempt_score, passed_at, locked_until')
    .eq('tutor_id', tutorId)
    .eq('version_id', version.id)
    .maybeSingle();

  const now = new Date();

  if (!ack) {
    return {
      passed: false,
      current_version_id: version.id,
      current_version_url: version.sop_url,
      attempts_used: 0,
      attempts_remaining: 3,
      locked_until: null,
      is_locked: false,
      last_attempt_score: null,
    };
  }

  const attemptsUsed = ack.attempts_used ?? 0;
  const lockedUntil = ack.locked_until as string | null;
  const isLocked = lockedUntil != null && new Date(lockedUntil) > now;

  return {
    passed: ack.passed_at != null,
    current_version_id: version.id,
    current_version_url: version.sop_url,
    attempts_used: attemptsUsed,
    attempts_remaining: Math.max(0, 3 - attemptsUsed),
    locked_until: lockedUntil,
    is_locked: isLocked,
    last_attempt_score: ack.last_attempt_score ?? null,
  };
}

export async function requireSopPassed(
  tutorId: string,
  supabase: SupabaseClient,
): Promise<{ ok: true } | { ok: false; response: any }> {
  const status = await getTutorSopStatus(tutorId, supabase);
  if (!status || status.passed) return { ok: true };
  return {
    ok: false,
    response: {
      error: 'You must pass the SOP quiz before you can attest sessions. Go to /tutor-portal/sop-quiz.',
      sop_quiz_required: true,
      sop_url: status.current_version_url,
    },
  };
}
