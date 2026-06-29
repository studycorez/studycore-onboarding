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

-- Function: runtime FK introspection for merge repointing.
-- Returns all tables with a FK to students.id, excluding self-references
-- and the student_merges audit table.
CREATE OR REPLACE FUNCTION get_student_fk_tables()
RETURNS TABLE (table_name text, column_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    tc.table_name::text,
    kcu.column_name::text
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
    AND tc.table_schema = ccu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'students'
    AND ccu.column_name = 'id'
    AND tc.table_name NOT IN ('students', 'student_merges')
    AND kcu.column_name != 'merged_into_id'
  ORDER BY tc.table_name;
$$;
