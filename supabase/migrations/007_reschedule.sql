ALTER TABLE sessions ADD COLUMN IF NOT EXISTS rescheduled_from timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reschedule_reason text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reschedule_count integer NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reschedule_requested boolean NOT NULL DEFAULT false;
