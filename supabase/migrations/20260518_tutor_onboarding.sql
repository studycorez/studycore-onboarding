ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS onboarding_checklist JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tutors.onboarding_checklist IS
  'JSONB tracking which onboarding tasks the tutor has completed. Keys: profile_complete, availability_set, calendar_connected, training_video_watched, students_reviewed. Values: ISO timestamps or absent.';
