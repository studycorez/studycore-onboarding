ALTER TABLE students
  ADD COLUMN IF NOT EXISTS purchased_hours  numeric(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS used_hours       numeric(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS low_hours_alerted boolean      NOT NULL DEFAULT false;
