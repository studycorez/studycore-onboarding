BEGIN;

CREATE TABLE IF NOT EXISTS student_add_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  student_name text NOT NULL,
  parent_name text,
  parent_email text,
  parent_phone text,
  grade text,
  target_score int,
  test_date date,
  school text,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by text,
  rejection_reason text,
  created_student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  created_contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_add_requests_tutor_id ON student_add_requests(tutor_id);
CREATE INDEX IF NOT EXISTS idx_student_add_requests_status ON student_add_requests(status);

ALTER TABLE student_add_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_student_add_requests"
  ON student_add_requests FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMIT;
