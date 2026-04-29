ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_report_sent boolean DEFAULT false;
