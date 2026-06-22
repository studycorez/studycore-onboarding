BEGIN;

ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS password_reset_token uuid,
  ADD COLUMN IF NOT EXISTS password_reset_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_reset_last_requested_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tutors_password_reset_token
  ON tutors (password_reset_token)
  WHERE password_reset_token IS NOT NULL;

COMMIT;
