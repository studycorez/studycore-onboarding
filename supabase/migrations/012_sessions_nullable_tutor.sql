-- Allow sessions to be created without a tutor_id (e.g. Zoom auto-match
-- where the meeting cannot be attributed to a specific tutor yet).
ALTER TABLE sessions ALTER COLUMN tutor_id DROP NOT NULL;
