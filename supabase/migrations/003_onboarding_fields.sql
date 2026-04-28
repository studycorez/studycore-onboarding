-- Onboarding tracking fields on students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS onboarding_email_sent boolean NOT NULL DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS onboarding_email_sent_at timestamptz;
ALTER TABLE students ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS intake_form_completed boolean NOT NULL DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS kickoff_scheduled boolean NOT NULL DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS game_plan_acknowledged boolean NOT NULL DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS schedule_confirmed boolean NOT NULL DEFAULT false;

-- Intake form fields
ALTER TABLE students ADD COLUMN IF NOT EXISTS test_date date;
ALTER TABLE students ADD COLUMN IF NOT EXISTS weak_areas text[];
ALTER TABLE students ADD COLUMN IF NOT EXISTS learning_style text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS additional_notes text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS school_name text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS gpa text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS study_hours_per_week text;
