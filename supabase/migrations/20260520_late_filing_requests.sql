ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS late_filing_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS late_filing_reason TEXT,
  ADD COLUMN IF NOT EXISTS late_filing_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS late_filing_approved_by TEXT;

COMMENT ON COLUMN sessions.late_filing_requested_at IS
  'When set, tutor requested permission to file a session report past the 72hr cutoff. Cleared when admin approves or rejects.';
COMMENT ON COLUMN sessions.late_filing_approved_at IS
  'When set, allows tutor to bypass 72hr cutoff for this specific session. Single use - filing the report should not clear this since it serves as audit trail.';
