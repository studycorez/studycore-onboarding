CREATE TABLE IF NOT EXISTS tutor_switches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id),
  old_tutor_id uuid NOT NULL REFERENCES tutors(id),
  new_tutor_id uuid NOT NULL REFERENCES tutors(id),
  reason text,
  switched_at timestamptz DEFAULT now(),
  switched_by text DEFAULT 'admin',
  notes text
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cancellation_reason text;
