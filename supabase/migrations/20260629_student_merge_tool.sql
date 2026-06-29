-- Student merge tool — applied to prod via SQL Editor 2026-06-29.
-- Idempotent: all statements use IF NOT EXISTS.

ALTER TABLE students ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES students(id);
ALTER TABLE students ADD COLUMN IF NOT EXISTS merged_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_students_active ON students(id) WHERE merged_into_id IS NULL;

CREATE TABLE IF NOT EXISTS student_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id uuid NOT NULL REFERENCES students(id),
  duplicate_id uuid NOT NULL REFERENCES students(id),
  merged_at timestamptz NOT NULL DEFAULT now(),
  merged_by_admin_id uuid,
  decisions_json jsonb NOT NULL,
  contracts_repointed_count int DEFAULT 0,
  sessions_repointed_count int DEFAULT 0,
  payments_repointed_count int DEFAULT 0,
  other_repointed_counts jsonb,
  UNIQUE (duplicate_id)
);

ALTER TABLE student_merges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'student_merges'
      AND policyname = 'service_role_only_student_merges'
  ) THEN
    CREATE POLICY "service_role_only_student_merges"
      ON student_merges FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
