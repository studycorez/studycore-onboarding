ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS availability_override BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN sessions.availability_override IS
  'TRUE when this session was booked outside the tutor''s stated availability via admin override. Audit trail.';
