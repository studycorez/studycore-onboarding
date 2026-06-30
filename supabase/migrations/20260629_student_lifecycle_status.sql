-- Student lifecycle status changes audit — applied to prod via SQL Editor 2026-06-29.
-- Idempotent: all statements use IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS student_status_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id),
  from_status text NOT NULL,
  to_status text NOT NULL,
  reason text,
  changed_by_admin_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  side_effects_json jsonb
);

CREATE INDEX IF NOT EXISTS idx_ssc_student ON student_status_changes(student_id);
CREATE INDEX IF NOT EXISTS idx_ssc_created ON student_status_changes(created_at DESC);

ALTER TABLE student_status_changes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'student_status_changes'
      AND policyname = 'service_role_only_ssc'
  ) THEN
    CREATE POLICY "service_role_only_ssc"
      ON student_status_changes FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
