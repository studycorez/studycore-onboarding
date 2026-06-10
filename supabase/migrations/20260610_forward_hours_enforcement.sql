-- =============================================================================
-- Forward Hours Enforcement — Schema Changes
-- 2026-06-10
--
-- Adds per-session hours tracking columns, an audit log for used_hours
-- mutations, and a session edit request queue for tutors.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- (a) ALTER sessions: add hours tracking columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE sessions
  ADD COLUMN hours_finalized BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN hours_source TEXT CHECK (
    hours_source IS NULL OR hours_source IN ('scheduled', 'actual', 'tutor_logged')
  ),
  ADD COLUMN hours_attributed NUMERIC DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- (b) CREATE used_hours_audit_log
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE used_hours_audit_log (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID          REFERENCES sessions(id),
  student_id    UUID          NOT NULL REFERENCES students(id),
  delta         NUMERIC       NOT NULL,
  before_value  NUMERIC       NOT NULL,
  after_value   NUMERIC       NOT NULL,
  source        TEXT          NOT NULL CHECK (
    source IN (
      'session_completion',
      'zoom_sync_overwrite',
      'tutor_log',
      'admin_manual',
      'cron_fallback'
    )
  ),
  reason        TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  actor         TEXT
);

CREATE INDEX idx_used_hours_audit_student_created
  ON used_hours_audit_log (student_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- (c) CREATE session_edit_requests
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE session_edit_requests (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              UUID          NOT NULL REFERENCES sessions(id),
  requested_by_tutor_id   UUID          NOT NULL REFERENCES tutors(id),
  proposed_changes        JSONB         NOT NULL,
  reason_from_tutor       TEXT,
  status                  TEXT          NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected')
  ),
  decided_by_admin_id     UUID,
  decided_at              TIMESTAMPTZ,
  admin_notes             TEXT,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_edit_requests_status_created
  ON session_edit_requests (status, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- (d) RLS: enable on new tables, restrict to service-role only
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE used_hours_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_edit_requests ENABLE ROW LEVEL SECURITY;

-- No policies = only service-role (bypasses RLS) can read/write.
-- If anon/authenticated access is needed later, add explicit policies.

-- ─────────────────────────────────────────────────────────────────────────────
-- (e) Historical hours protection: finalize all sessions before today
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE sessions
  SET hours_finalized = true
WHERE scheduled_at < '2026-06-10';

COMMIT;
