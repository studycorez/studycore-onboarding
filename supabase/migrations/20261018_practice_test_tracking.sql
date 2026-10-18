-- Practice test tracking on session reports — applied 2026-10-18
ALTER TABLE session_reports ADD COLUMN IF NOT EXISTS practice_test_completed boolean DEFAULT false;
ALTER TABLE session_reports ADD COLUMN IF NOT EXISTS practice_test_type      text;    -- 'full' | 'math' | 'rw'
ALTER TABLE session_reports ADD COLUMN IF NOT EXISTS practice_test_score     integer;
