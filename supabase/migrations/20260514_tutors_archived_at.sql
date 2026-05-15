ALTER TABLE tutors ADD COLUMN archived_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX tutors_active_idx ON tutors (id) WHERE archived_at IS NULL;

COMMENT ON COLUMN tutors.archived_at IS
  'When set, tutor is archived. Active tutors have archived_at = NULL.
   Archive does not delete the record; it removes the tutor from dropdowns,
   assignment flows, and portal auth, while preserving historical data
   (sessions, contracts, payroll).';
