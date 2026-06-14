-- =============================================================================
-- Session Attestation Schema
-- 2026-06-11
--
-- Adds tutor attestation workflow columns to sessions: state machine,
-- tutor's claimed minutes, dispute tracking, and Zoom cross-check flags.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- (1) Attestation state machine
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE sessions
  ADD COLUMN attestation_state TEXT CHECK (
    attestation_state IS NULL OR attestation_state IN (
      'pending', 'attended', 'student_no_show', 'tutor_no_show',
      'cancelled', 'expired', 'disputed', 'resolved'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- (2) Tutor's attestation claim
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE sessions
  ADD COLUMN attested_minutes INT,
  ADD COLUMN attested_at TIMESTAMPTZ,
  ADD COLUMN attested_by UUID REFERENCES tutors(id),
  ADD COLUMN attestation_lock_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────────
-- (3) Dispute tracking
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE sessions
  ADD COLUMN dispute_filed_at TIMESTAMPTZ,
  ADD COLUMN dispute_filed_by TEXT CHECK (
    dispute_filed_by IS NULL OR dispute_filed_by IN ('parent', 'admin', 'student')
  ),
  ADD COLUMN dispute_reason TEXT,
  ADD COLUMN dispute_resolved_at TIMESTAMPTZ,
  ADD COLUMN dispute_resolved_by UUID,
  ADD COLUMN dispute_resolution TEXT CHECK (
    dispute_resolution IS NULL OR dispute_resolution IN ('upheld', 'revoked', 'adjusted')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- (4) Zoom cross-check flag
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE sessions
  ADD COLUMN zoom_flag TEXT CHECK (
    zoom_flag IS NULL OR zoom_flag IN (
      'clear', 'tutor_absent', 'duration_mismatch', 'no_zoom_data'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- (5) Backfill: mark all pre-existing completed sessions as 'expired'
--     so they don't appear in the pending attestation queue
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE sessions
  SET attestation_state = 'expired'
WHERE scheduled_at < NOW()
  AND attestation_state IS NULL
  AND status IN ('completed', 'no_show_student');

-- ─────────────────────────────────────────────────────────────────────────────
-- (6) Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX idx_sessions_attestation_state
  ON sessions(attestation_state)
  WHERE attestation_state IS NOT NULL;

CREATE INDEX idx_sessions_pending_by_tutor
  ON sessions(tutor_id, attestation_state)
  WHERE attestation_state = 'pending';

COMMIT;
