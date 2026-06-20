BEGIN;

-- Stored procedure: submit_sop_quiz_attempt
-- Race-safe: uses SELECT FOR UPDATE inside transaction.
-- Returns the new state after the attempt.

CREATE OR REPLACE FUNCTION submit_sop_quiz_attempt(
  p_tutor_id uuid,
  p_version_id uuid,
  p_score int,
  p_passed boolean
) RETURNS TABLE (
  attempts_used int,
  attempts_remaining int,
  passed_at timestamptz,
  locked_until timestamptz,
  is_locked boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_attempts int := 0;
  v_existing_passed_at timestamptz;
  v_existing_locked_until timestamptz;
  v_new_attempts int;
  v_new_passed_at timestamptz;
  v_new_locked_until timestamptz;
  v_now timestamptz := now();
  MAX_ATTEMPTS constant int := 3;
  LOCKOUT_HOURS constant int := 24;
BEGIN
  -- Ensure ack row exists (idempotent, so FOR UPDATE below always locks something)
  INSERT INTO tutor_sop_acknowledgments (tutor_id, version_id, attempts_used)
  VALUES (p_tutor_id, p_version_id, 0)
  ON CONFLICT (tutor_id, version_id) DO NOTHING;

  -- Lock the existing ack row
  SELECT a.attempts_used, a.passed_at, a.locked_until
    INTO v_existing_attempts, v_existing_passed_at, v_existing_locked_until
  FROM tutor_sop_acknowledgments a
  WHERE a.tutor_id = p_tutor_id AND a.version_id = p_version_id
  FOR UPDATE;

  -- Already passed: reject
  IF v_existing_passed_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_PASSED';
  END IF;

  -- Currently locked: reject
  IF v_existing_locked_until IS NOT NULL AND v_existing_locked_until > v_now THEN
    RAISE EXCEPTION 'LOCKED_UNTIL:%', v_existing_locked_until;
  END IF;

  -- Compute new state
  v_new_attempts := COALESCE(v_existing_attempts, 0) + 1;

  IF p_passed THEN
    v_new_passed_at := v_now;
    v_new_locked_until := NULL;
  ELSIF v_new_attempts >= MAX_ATTEMPTS THEN
    v_new_passed_at := NULL;
    v_new_locked_until := v_now + (LOCKOUT_HOURS || ' hours')::interval;
  ELSE
    v_new_passed_at := NULL;
    v_new_locked_until := NULL;
  END IF;

  -- Upsert
  INSERT INTO tutor_sop_acknowledgments (
    tutor_id, version_id, attempts_used, last_attempt_at,
    last_attempt_score, passed_at, locked_until, updated_at
  )
  VALUES (
    p_tutor_id, p_version_id, v_new_attempts, v_now,
    p_score, v_new_passed_at, v_new_locked_until, v_now
  )
  ON CONFLICT (tutor_id, version_id) DO UPDATE SET
    attempts_used = v_new_attempts,
    last_attempt_at = v_now,
    last_attempt_score = p_score,
    passed_at = v_new_passed_at,
    locked_until = v_new_locked_until,
    updated_at = v_now;

  -- Return new state
  RETURN QUERY
  SELECT
    v_new_attempts,
    GREATEST(0, MAX_ATTEMPTS - v_new_attempts),
    v_new_passed_at,
    v_new_locked_until,
    (v_new_locked_until IS NOT NULL AND v_new_locked_until > v_now);
END;
$$;

COMMIT;
