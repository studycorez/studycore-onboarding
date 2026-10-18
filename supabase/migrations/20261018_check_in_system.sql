-- Check-in queue system — applied 2026-10-18

-- Add student_id to session_reports for efficient per-student counting
ALTER TABLE session_reports ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES students(id);

-- Check-ins queue
CREATE TABLE IF NOT EXISTS check_ins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid REFERENCES students(id),
  student_name  text NOT NULL,
  type          text NOT NULL,   -- 'first_session' | '3_session' | 'weekly' | 'phase'
  session_id    uuid REFERENCES sessions(id),
  report_id     uuid,
  status        text NOT NULL DEFAULT 'pending',   -- 'pending' | 'done'
  context       jsonb,
  created_at    timestamptz DEFAULT now(),
  completed_at  timestamptz,
  completed_by  text
);

CREATE INDEX IF NOT EXISTS check_ins_student_status_idx ON check_ins (student_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS check_ins_status_created_idx ON check_ins (status, created_at DESC);
