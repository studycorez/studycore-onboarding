-- Prevents duplicate session imports for the same Zoom meeting
-- occurrence for the same student.
--
-- Allows:
--   - Multiple sessions from a recurring meeting on different dates
--     (same zoom_meeting_id, different scheduled_at)
--   - Different students in a group session from the same meeting
--     at the same time (same zoom_meeting_id, same scheduled_at,
--     different student_id)
--   - Sessions with no Zoom meeting (zoom_meeting_id = NULL)
--
-- Blocks:
--   - Same student inserted twice for the same Zoom occurrence at
--     the same timestamp (the May 13 duplicate disaster pattern)

CREATE UNIQUE INDEX IF NOT EXISTS sessions_zoom_meeting_id_student_scheduled_at_unique
ON sessions (zoom_meeting_id, student_id, scheduled_at)
WHERE zoom_meeting_id IS NOT NULL;
