-- Add homework due date to sessions (set by tutor in session notes form)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS homework_due_date date;

-- Add show_on_leaderboard flag to students (seed/test accounts)
ALTER TABLE students ADD COLUMN IF NOT EXISTS show_on_leaderboard boolean DEFAULT false;
