-- Part 1: Permanent Zoom links on contracts
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS permanent_zoom_link text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS permanent_zoom_meeting_id bigint;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS permanent_zoom_host_url text;

-- Part 2: Session tracking
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS uses_permanent_link boolean DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS actual_duration_minutes integer;
