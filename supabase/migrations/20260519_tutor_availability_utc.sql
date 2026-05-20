-- Dual-column safety net: keep original tutor-local time, add UTC datetimes
ALTER TABLE tutor_availability
  ADD COLUMN IF NOT EXISTS start_utc       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_utc         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_timezone TEXT;

COMMENT ON COLUMN tutor_availability.start_utc IS
  'UTC datetime for next occurrence of this weekly slot. Derived from day_of_week + start_time + source_timezone. Updated on every write.';
COMMENT ON COLUMN tutor_availability.end_utc IS
  'UTC datetime for end of this weekly slot. Same derivation as start_utc.';
COMMENT ON COLUMN tutor_availability.source_timezone IS
  'The tutor''s timezone at the time this row was written. Snapshot — does NOT auto-update if tutor changes their timezone.';
