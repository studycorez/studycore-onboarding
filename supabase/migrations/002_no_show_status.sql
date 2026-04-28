-- Add granular no-show status values to the session_status enum
ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'no_show_student';
ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'no_show_tutor';
ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'no_show_both';

-- Add a flag to track when a "possibly missed" alert has been sent for a session
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS missed_alert_sent boolean NOT NULL DEFAULT false;
