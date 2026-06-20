-- SOP Quiz System: versioned SOP acknowledgment with quiz enforcement
-- Created 2026-06-20

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- Table 1: SOP versions
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sop_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_number  text NOT NULL,
  sop_url         text NOT NULL,
  is_major        boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (version_number)
);

-- ═══════════════════════════════════════════════════════════════════
-- Table 2: Quiz questions per SOP version
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sop_quiz_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      uuid NOT NULL REFERENCES sop_versions(id) ON DELETE CASCADE,
  question_number int NOT NULL,
  question_text   text NOT NULL,
  option_a        text NOT NULL,
  option_b        text NOT NULL,
  option_c        text NOT NULL,
  option_d        text NOT NULL,
  correct_option  text NOT NULL,
  created_at      timestamptz DEFAULT now(),
  CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  UNIQUE (version_id, question_number)
);

-- ═══════════════════════════════════════════════════════════════════
-- Table 3: Tutor acknowledgments (quiz attempts + pass state)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tutor_sop_acknowledgments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id            uuid NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  version_id          uuid NOT NULL REFERENCES sop_versions(id) ON DELETE CASCADE,
  attempts_used       int NOT NULL DEFAULT 0,
  last_attempt_at     timestamptz,
  last_attempt_score  int,
  passed_at           timestamptz,
  locked_until        timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (tutor_id, version_id)
);

-- ═══════════════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_sop_quiz_questions_version
  ON sop_quiz_questions (version_id, question_number);

CREATE INDEX IF NOT EXISTS idx_tutor_sop_acks_tutor_version
  ON tutor_sop_acknowledgments (tutor_id, version_id);

CREATE INDEX IF NOT EXISTS idx_tutor_sop_acks_tutor_passed
  ON tutor_sop_acknowledgments (tutor_id, passed_at);

-- ═══════════════════════════════════════════════════════════════════
-- RLS: service-role only (all access via server endpoints)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE sop_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_sop_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_sop_versions"
  ON sop_versions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_only_sop_quiz_questions"
  ON sop_quiz_questions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_only_tutor_sop_acks"
  ON tutor_sop_acknowledgments FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════
-- Seed: SOP v1.0 + 10 quiz questions
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO sop_versions (version_number, sop_url, is_major)
  VALUES ('1.0', 'https://app.notion.com/p/3859f4b4d7218176940ae37383430870', true)
  RETURNING id INTO v_id;

  INSERT INTO sop_quiz_questions (version_id, question_number, question_text, option_a, option_b, option_c, option_d, correct_option) VALUES
  (v_id, 1,
   'When a student is enrolled in a score-guarantee tier (e.g., 1500+) and doesn''t hit the score by the agreed-upon test date, what does StudyCore owe them?',
   'A partial refund of their package cost',
   'A discount on their next package',
   'Free sessions until they hit the score, however many it takes',
   'Nothing — the guarantee is best-effort only',
   'C'),

  (v_id, 2,
   'A student doesn''t show up for their session. What is the correct sequence?',
   'Wait 5 minutes, then log off and mark as no-show',
   'Wait 15 minutes, with escalating messages at 5 and 10 minutes, then mark as no_show_student',
   'Wait the full session duration, then mark as no-show',
   'Leave immediately and notify admin',
   'B'),

  (v_id, 3,
   'How far in advance can a TUTOR cancel a session without it counting as a strike?',
   '24 hours',
   '48 hours',
   '4 hours',
   'Anytime, no strike system exists for tutor cancellations',
   'B'),

  (v_id, 4,
   'A parent messages you asking if they can get a discount on their next package because their student is struggling. What do you do?',
   'Offer them a 10% discount to keep the relationship',
   'Explain that pricing is fixed and there are no discounts',
   'Tell them you''ll loop in admin and let admin handle it',
   'Ignore the message and discuss it with the student in the next session',
   'C'),

  (v_id, 5,
   'What happens if you don''t file a session report within 24 hours of the session?',
   'Nothing — reports are optional',
   'The session is paid normally, you get a reminder',
   'You don''t get paid for that session until the report is filed',
   'The session is permanently deleted',
   'C'),

  (v_id, 6,
   'You realize the game plan for one of your students needs to change because they''re struggling badly with a foundational topic. What do you do?',
   'Silently start teaching different topics that better match the student''s needs',
   'Wait until next session and ask the student what they want to focus on',
   'Message the admin team directly to propose the plan update',
   'Email the parent and offer to adjust the curriculum',
   'C'),

  (v_id, 7,
   'A student tells you during a session that they have been thinking about hurting themselves. What is the correct immediate action?',
   'Tell the student you''ll keep it confidential between you two',
   'End the session early and don''t bring it up again',
   'Finish the session as appropriate, then immediately email admin with subject ''URGENT - student disclosure''',
   'Call the parent directly after the session',
   'C'),

  (v_id, 8,
   'How are billable hours for a session determined in StudyCore''s attestation system?',
   'The scheduled duration of the session (e.g., always 60 minutes for a 60-min slot)',
   'The Zoom attendance time recorded by the platform',
   'The tutor''s post-session attestation of actual session length',
   'Whatever the parent agrees to in writing',
   'C'),

  (v_id, 9,
   'Which of the following is grounds for immediate termination from StudyCore?',
   'Forgetting to file a single session report',
   'Being 5 minutes late to a session once',
   'Offering to tutor a StudyCore student off-platform for cash',
   'Cancelling a session 50 hours in advance',
   'C'),

  (v_id, 10,
   'You''re newly assigned a student and have already taught two sessions, but you haven''t received a contract to sign yet. What''s the correct action?',
   'Keep teaching and assume the contract will arrive eventually',
   'Stop teaching the student until a contract is signed',
   'Email admin to flag that you''ve taught sessions without a contract — and continue teaching while the contract is sorted out',
   'Negotiate a rate directly with the parent so you have something in writing',
   'C');
END $$;

COMMIT;
