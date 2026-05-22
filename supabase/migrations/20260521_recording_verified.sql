ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS recording_verified BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN sessions.recording_verified IS
  'Admin explicitly confirmed the primary recording belongs to this session and is OK to show the student. Student portal shows recording/summary/transcript ONLY when true. NEVER set automatically — explicit admin action only.';
