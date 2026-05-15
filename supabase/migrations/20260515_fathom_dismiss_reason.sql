ALTER TABLE fathom_unmatched_recordings
  ADD COLUMN IF NOT EXISTS dismiss_reason TEXT DEFAULT NULL;

COMMENT ON COLUMN fathom_unmatched_recordings.dismiss_reason IS
  'When resolved=true with resolved_session_id=NULL, this stores why
   the recording was dismissed (e.g. "sales call", "internal meeting").
   NULL for actual backfilled sessions.';
