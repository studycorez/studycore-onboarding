-- Session attendance columns (attendance-gated payroll)
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS tutor_attended          BOOLEAN,
  ADD COLUMN IF NOT EXISTS student_attended        BOOLEAN,
  ADD COLUMN IF NOT EXISTS actual_runtime_minutes  INTEGER,
  ADD COLUMN IF NOT EXISTS zoom_attendance_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN sessions.tutor_attended IS
  'TRUE = tutor appeared in Zoom participant report. FALSE = confirmed absent. NULL = not yet synced or indeterminate.';
COMMENT ON COLUMN sessions.student_attended IS
  'TRUE = student appeared in Zoom participant report. FALSE = confirmed absent. NULL = not yet synced or indeterminate.';
COMMENT ON COLUMN sessions.actual_runtime_minutes IS
  'Duration in minutes reported by Zoom (sum of all participant durations / max participant duration). NULL if not synced.';
COMMENT ON COLUMN sessions.zoom_attendance_synced_at IS
  'Timestamp of the last successful Zoom attendance sync for this session.';

-- Index for the cron job query: completed sessions that need sync
CREATE INDEX IF NOT EXISTS sessions_attendance_sync_idx
  ON sessions (status, zoom_attendance_synced_at, scheduled_at)
  WHERE status = 'completed';
