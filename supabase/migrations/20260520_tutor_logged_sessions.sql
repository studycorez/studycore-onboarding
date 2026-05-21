ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS created_by_tutor BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN sessions.created_by_tutor IS
  'True if this session was logged by a tutor via "Log a Missed Session" (off-system session). Starts as status=pending_approval; admin must approve to make it payable.';
