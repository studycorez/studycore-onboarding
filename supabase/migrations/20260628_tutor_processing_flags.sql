-- Tutor processing flags + sessions.payroll_review_required — applied to prod via SQL Editor 2026-06-28.
-- Idempotent: all statements use IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS tutor_processing_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES tutors(id),
  flag_type text NOT NULL,
  flag_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_admin_id uuid,
  resolved_at timestamptz,
  resolved_by_admin_id uuid,
  resolution_note text
);

CREATE INDEX IF NOT EXISTS idx_tpf_unresolved ON tutor_processing_flags(tutor_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tpf_created ON tutor_processing_flags(created_at);

ALTER TABLE tutor_processing_flags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tutor_processing_flags'
      AND policyname = 'service_role_only_tpf'
  ) THEN
    CREATE POLICY "service_role_only_tpf"
      ON tutor_processing_flags FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS payroll_review_required boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_sessions_payroll_review ON sessions(payroll_review_required) WHERE payroll_review_required = true;
