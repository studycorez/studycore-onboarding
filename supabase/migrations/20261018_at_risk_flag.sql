-- At-risk flag on students — applied 2026-10-18
ALTER TABLE students ADD COLUMN IF NOT EXISTS at_risk boolean DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS at_risk_reason text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS at_risk_flagged_at timestamptz;
