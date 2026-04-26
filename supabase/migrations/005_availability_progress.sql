-- Student availability
CREATE TABLE IF NOT EXISTS student_availability (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL,
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_avail_student ON student_availability(student_id);

ALTER TABLE student_availability ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_student_avail" ON student_availability;
CREATE POLICY "auth_all_student_avail" ON student_availability FOR ALL USING (auth.role() = 'authenticated');

-- Session log progress columns
ALTER TABLE session_logs
  ADD COLUMN IF NOT EXISTS math_score       integer,
  ADD COLUMN IF NOT EXISTS reading_score    integer,
  ADD COLUMN IF NOT EXISTS writing_score    integer,
  ADD COLUMN IF NOT EXISTS confidence_level integer;
