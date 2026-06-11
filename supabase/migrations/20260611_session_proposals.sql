-- Session proposals: tutor-initiated backlog entries for sessions that
-- happened but were never scheduled in the platform. Tutor submits a
-- proposal, admin reviews, on approval a real sessions row is created
-- and hours flow normally via applySessionHoursForStudent.
--
-- See spec: tutor proposes, admin approves model. 30-day backdate window
-- enforced at API layer (not DB - we want to allow admin to insert
-- older records manually if needed). Duration 15min-4hr CHECK enforced
-- at DB. Status whitelist enforced at DB.

CREATE TABLE IF NOT EXISTS session_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 15 AND duration_minutes <= 240),
  what_covered TEXT,
  tutor_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  created_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_proposals_tutor_id_status
  ON session_proposals(tutor_id, status);

CREATE INDEX IF NOT EXISTS idx_session_proposals_status_created_at
  ON session_proposals(status, created_at DESC);

COMMENT ON TABLE session_proposals IS 'Backlog: tutor-submitted proposals for past sessions awaiting admin approval. On approval, creates a sessions row via API and links via created_session_id.';
COMMENT ON COLUMN session_proposals.scheduled_at IS 'When the session HAPPENED (in the past), not when proposal was created.';
COMMENT ON COLUMN session_proposals.created_session_id IS 'Set when proposal is approved and a real sessions row is created. Null for pending or rejected proposals.';
