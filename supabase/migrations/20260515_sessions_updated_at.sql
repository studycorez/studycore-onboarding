-- Add updated_at column to sessions for audit timestamping.
-- created_at exists already (insert time). updated_at tracks last mutation.
-- Required for: distinguishing inserts vs mutations in post-hoc audits.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill existing rows to their created_at so updated_at is never NULL.
UPDATE sessions
SET updated_at = created_at
WHERE updated_at IS NULL;

-- Enable the moddatetime extension if not already enabled.
-- This is Supabase's standard trigger for auto-updating timestamps.
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

-- Create the trigger to auto-update updated_at on every row update.
DROP TRIGGER IF EXISTS sessions_updated_at_trigger ON sessions;

CREATE TRIGGER sessions_updated_at_trigger
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- Index for queries that filter by recent mutations (audit common case).
CREATE INDEX IF NOT EXISTS sessions_updated_at_idx
  ON sessions (updated_at DESC);
