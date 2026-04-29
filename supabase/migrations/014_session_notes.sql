ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tutor_notes text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS homework_assigned text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_rating integer; -- 1-5
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS notes_submitted_at timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS notes_token uuid DEFAULT gen_random_uuid();
