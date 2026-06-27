ALTER TABLE students
  ADD COLUMN IF NOT EXISTS sat_date date;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS source text;

CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source) WHERE source IS NOT NULL;
