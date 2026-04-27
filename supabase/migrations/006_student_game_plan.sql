ALTER TABLE students ADD COLUMN IF NOT EXISTS game_plan_url text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS game_plan_uploaded_at timestamptz;
