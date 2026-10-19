-- Align weekly_reports schema with what the cron + parent portal API expect.
-- The original migration (018) created week_start/week_end/report_data columns,
-- but the cron and parent portal use week_of/report_html/sessions_count/hours_this_week.

ALTER TABLE weekly_reports
  ADD COLUMN IF NOT EXISTS week_of         date,
  ADD COLUMN IF NOT EXISTS report_html     text,
  ADD COLUMN IF NOT EXISTS sessions_count  integer,
  ADD COLUMN IF NOT EXISTS hours_this_week numeric(6,2);

-- Back-fill week_of from week_start for any existing rows
UPDATE weekly_reports SET week_of = week_start WHERE week_of IS NULL AND week_start IS NOT NULL;

-- Drop old unique constraint (added by 019) so we can replace it
ALTER TABLE weekly_reports
  DROP CONSTRAINT IF EXISTS weekly_reports_student_week_unique;

-- New unique index on (student_id, week_of) — this is what upsert uses
CREATE UNIQUE INDEX IF NOT EXISTS weekly_reports_student_week_of_unique
  ON weekly_reports(student_id, week_of)
  WHERE week_of IS NOT NULL;
