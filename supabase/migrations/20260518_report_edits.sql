ALTER TABLE session_reports
  ADD COLUMN IF NOT EXISTS edit_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edit_request_reason TEXT,
  ADD COLUMN IF NOT EXISTS edit_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edit_approved_by TEXT,
  ADD COLUMN IF NOT EXISTS edit_unlocked_until TIMESTAMPTZ;

COMMENT ON COLUMN session_reports.edit_unlocked_until IS
  'When admin approves edit request, set to NOW() + 1 hour. Tutor can edit until this time.';
