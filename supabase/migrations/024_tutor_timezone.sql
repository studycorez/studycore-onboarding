-- Add timezone column to tutors for dual-timezone display in booking + sessions
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/New_York';
