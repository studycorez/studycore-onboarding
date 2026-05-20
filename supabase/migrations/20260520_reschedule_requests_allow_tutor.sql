ALTER TABLE reschedule_requests
  DROP CONSTRAINT IF EXISTS reschedule_requests_requested_by_check;

ALTER TABLE reschedule_requests
  ADD CONSTRAINT reschedule_requests_requested_by_check
  CHECK (requested_by = ANY (ARRAY['parent', 'student', 'tutor']));
