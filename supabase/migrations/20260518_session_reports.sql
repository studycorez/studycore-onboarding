-- Session Reports: replaces session_logs as of 2026-05-18
-- Required for payroll. Parents see filtered view (private_tutor_notes excluded).

CREATE TABLE IF NOT EXISTS session_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tutor_id UUID NOT NULL REFERENCES tutors(id),

  -- Attendance (self-reported by tutor; admin cross-checks against Zoom)
  student_attended TEXT NOT NULL CHECK (student_attended IN ('yes', 'no', 'late')),
  tutor_attended   TEXT NOT NULL CHECK (tutor_attended IN ('yes', 'partial', 'no_show')),

  -- Duration
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),

  -- Content
  topics_covered TEXT NOT NULL CHECK (length(topics_covered) >= 10),

  -- Engagement
  engagement_rating INTEGER NOT NULL CHECK (engagement_rating BETWEEN 1 AND 5),

  -- Homework
  homework_assigned             TEXT NOT NULL,
  homework_time_estimate_minutes INTEGER,  -- tutor estimate; nullable

  -- Parent-visible fields
  concerns_for_parent  TEXT,  -- nullable
  target_score_range   TEXT,  -- nullable; e.g. "1300-1400"
  extra_practice_areas TEXT,  -- nullable

  -- Tutor-private (NOT visible to parent or student)
  private_tutor_notes TEXT,   -- nullable

  -- B-path: admin approval for reports that couldn't auto-match a student
  requires_admin_approval BOOLEAN     NOT NULL DEFAULT false,
  override_student_name   TEXT,        -- nullable; what tutor typed when no DB match found
  admin_approved_at       TIMESTAMPTZ, -- nullable; set when admin approves the report
  admin_approved_by       TEXT,        -- nullable; admin name/email (no separate admins table)

  -- Audit
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT one_report_per_session UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS session_reports_session_id   ON session_reports (session_id);
CREATE INDEX IF NOT EXISTS session_reports_tutor_id     ON session_reports (tutor_id);
CREATE INDEX IF NOT EXISTS session_reports_submitted_at ON session_reports (submitted_at DESC);

COMMENT ON TABLE session_reports IS
  'New session reporting system. Replaces session_logs as of 2026-05-18. Required for payroll. Parents see filtered view.';
COMMENT ON COLUMN session_reports.tutor_attended IS
  'yes|partial|no_show. Self-reported by tutor. Admin cross-checks against Zoom data when needed.';
COMMENT ON COLUMN session_reports.private_tutor_notes IS
  'Tutor-private. Not visible to parent or student.';

-- ── Homework items ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS homework_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_report_id UUID NOT NULL REFERENCES session_reports(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES students(id),
  description       TEXT NOT NULL,
  estimated_minutes INTEGER,
  completed         BOOLEAN NOT NULL DEFAULT false,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS homework_items_session_report      ON homework_items (session_report_id);
CREATE INDEX IF NOT EXISTS homework_items_student_completed   ON homework_items (student_id, completed);

COMMENT ON TABLE homework_items IS
  'Individual homework tasks assigned per session report. Completion tracked separately.';
