ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS attendance_review_status TEXT
  CHECK (attendance_review_status IS NULL OR
         attendance_review_status IN ('ghost_pending', 'ghost_confirmed', 'real_confirmed'));

COMMENT ON COLUMN sessions.attendance_review_status IS
  'NULL = not reviewed. ghost_pending = flagged as ghost, excluded from payroll, pending parent communication. ghost_confirmed = ghost, parent notified, ready for cancellation. real_confirmed = confirmed real despite no Zoom attendance.';

CREATE INDEX IF NOT EXISTS sessions_attendance_review
  ON sessions (attendance_review_status)
  WHERE attendance_review_status IS NOT NULL;
