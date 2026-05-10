-- Add rating column to tutors table (used for admin-managed composite score, 0-100)
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS rating integer DEFAULT 100;
