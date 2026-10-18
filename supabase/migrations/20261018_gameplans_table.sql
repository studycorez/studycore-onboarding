-- Generated gameplans linked to students — applied 2026-10-18
CREATE TABLE IF NOT EXISTS gameplans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid REFERENCES students(id),
  student_name     text NOT NULL,
  plan_type        text NOT NULL DEFAULT 'standard',   -- 'standard' | 'guarantee' | 'group'
  baseline_score   integer,
  target_score     integer,
  program_summary  jsonb,
  tracker_url      text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gameplans_student_id_idx ON gameplans (student_id, created_at DESC);
