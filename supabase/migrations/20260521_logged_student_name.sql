ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS logged_student_name TEXT;

COMMENT ON COLUMN sessions.logged_student_name IS
  'For tutor-logged off-system sessions: the student name the tutor typed. student_id points to the Unmatched placeholder until an admin links the real student at approval.';
