BEGIN;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS tutor_no_show_reason TEXT;

COMMIT;
