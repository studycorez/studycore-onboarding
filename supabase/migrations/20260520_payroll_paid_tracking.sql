-- ─── Payroll paid-tracking schema ────────────────────────────────────────────
-- Part of the payroll hard-gate + cutoff + catch-up redesign.
-- Run this migration BEFORE running scripts/settle-pre-cutoff-sessions.ts.

-- sessions: track which run paid this session
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS paid_in_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_paid_in_run
  ON sessions(paid_in_run_id);

-- Partial index for unpaid-eligible queries (very common in generate route)
CREATE INDEX IF NOT EXISTS idx_sessions_unpaid_eligible
  ON sessions(tutor_id, status, paid_in_run_id)
  WHERE paid_in_run_id IS NULL;

COMMENT ON COLUMN sessions.paid_in_run_id IS
  'Payroll run that paid this session. NULL = unpaid. Pre-cutoff sessions are stamped to the Historical run by settle-pre-cutoff-sessions.ts.';

-- sessions: mark reports filed during the one-time backlog window
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS report_backlogged BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN sessions.report_backlogged IS
  'True when a session report was filed during the backlog window (2026-05-15 to 2026-06-01) without per-session admin approval. One-time catch-up grant.';

-- payroll_line_items: store current-period vs catch-up breakdown
ALTER TABLE payroll_line_items
  ADD COLUMN IF NOT EXISTS current_period_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS catchup_minutes         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS catchup_sessions_count  INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN payroll_line_items.current_period_minutes IS
  'Minutes from sessions scheduled within the payroll period.';
COMMENT ON COLUMN payroll_line_items.catchup_minutes IS
  'Minutes from sessions scheduled before this period but >= PAYROLL_CUTOFF (filed late, now payable).';
COMMENT ON COLUMN payroll_line_items.catchup_sessions_count IS
  'Number of catch-up sessions included in this line item.';

-- Historical-stamping is intentionally NOT done here.
-- Run scripts/settle-pre-cutoff-sessions.ts separately after verifying dry-run counts.
