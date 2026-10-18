-- Fulfillment pipeline tracking — applied 2026-10-17
-- All statements use IF NOT EXISTS / safe ALTER patterns.

-- Deal handoff data (from Tally form OD8LXp, submitted at deal close)
ALTER TABLE students ADD COLUMN IF NOT EXISTS deal_handoff_data       jsonb;
ALTER TABLE students ADD COLUMN IF NOT EXISTS deal_won_at             timestamptz;

-- Student onboarding form (Tally b5PvVo)
ALTER TABLE students ADD COLUMN IF NOT EXISTS student_form_data             jsonb;
ALTER TABLE students ADD COLUMN IF NOT EXISTS student_form_submitted_at     timestamptz;

-- Parent onboarding form (Tally LZlkZ1)
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_form_data              jsonb;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_form_submitted_at      timestamptz;

-- Contract pipeline
ALTER TABLE students ADD COLUMN IF NOT EXISTS contract_sent_at              timestamptz;
ALTER TABLE students ADD COLUMN IF NOT EXISTS contract_signing_token        text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS contract_signed_at            timestamptz;

-- Tutor matching pipeline
ALTER TABLE students ADD COLUMN IF NOT EXISTS broadcast_sent_at             timestamptz;
ALTER TABLE students ADD COLUMN IF NOT EXISTS tutor_contract_sent_at        timestamptz;

-- Parent contact preferences (from parent form)
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone                  text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_contact_method         text;   -- Phone / Text / Email
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_best_contact_time      text;   -- Morning / Afternoon / Evening

-- Deal financial details (from deal handoff)
ALTER TABLE students ADD COLUMN IF NOT EXISTS total_paid                    numeric(10,2);
ALTER TABLE students ADD COLUMN IF NOT EXISTS payment_plan_details          text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS has_guarantee                 boolean DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS guarantee_details             text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS preferred_tutor               text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS closer_name                   text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS setter_name                   text;

-- Scheduling preferences (from student form)
ALTER TABLE students ADD COLUMN IF NOT EXISTS availability_raw              jsonb;   -- { monday: ['Morning','Afternoon'], tuesday: [], ... }
ALTER TABLE students ADD COLUMN IF NOT EXISTS availability_notes            text;    -- free-text timing notes
ALTER TABLE students ADD COLUMN IF NOT EXISTS sat_registered                boolean;
ALTER TABLE students ADD COLUMN IF NOT EXISTS backup_test_date              text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS has_accommodations            boolean;
ALTER TABLE students ADD COLUMN IF NOT EXISTS accommodations_details        text;
