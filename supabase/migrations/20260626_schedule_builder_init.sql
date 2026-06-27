-- Schedule Builder schema — applied to prod via SQL Editor 2026-06-26.
-- This file documents the current production state. All statements are
-- idempotent (IF NOT EXISTS) so running against an already-migrated DB is safe.

-- ═══════════════════════════════════════════════════════════════════
-- Table: tutor_reported_schedules
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tutor_reported_schedules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id              uuid NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  student_id            uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  day_of_week           int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time_local            time NOT NULL,
  timezone              text NOT NULL DEFAULT 'America/New_York',
  duration_minutes      int NOT NULL DEFAULT 60,
  recurring_started_on  date,
  notes                 text,
  reported_at           timestamptz NOT NULL DEFAULT now(),
  reported_by_admin_id  uuid,
  UNIQUE (tutor_id, student_id, day_of_week, time_local, recurring_started_on)
);

CREATE INDEX IF NOT EXISTS idx_trs_tutor ON tutor_reported_schedules(tutor_id);
CREATE INDEX IF NOT EXISTS idx_trs_student ON tutor_reported_schedules(student_id);

ALTER TABLE tutor_reported_schedules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tutor_reported_schedules'
      AND policyname = 'service_role_only_trs'
  ) THEN
    CREATE POLICY "service_role_only_trs"
      ON tutor_reported_schedules FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- Column additions on existing tables
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE tutors ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS timezone text;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS source text;
CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source) WHERE source IS NOT NULL;

ALTER TABLE students ADD COLUMN IF NOT EXISTS sat_date date;
