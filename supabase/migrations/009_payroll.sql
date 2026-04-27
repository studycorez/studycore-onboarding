CREATE TABLE IF NOT EXISTS payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  generated_at timestamptz DEFAULT now(),
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS payroll_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES tutors(id),
  sessions_count integer NOT NULL DEFAULT 0,
  total_minutes integer NOT NULL DEFAULT 0,
  hourly_rate numeric(6,2) NOT NULL DEFAULT 0,
  amount_owed numeric(8,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  notes text
);
