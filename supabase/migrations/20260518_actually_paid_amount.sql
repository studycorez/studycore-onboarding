ALTER TABLE payroll_line_items
  ADD COLUMN IF NOT EXISTS actually_paid_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

COMMENT ON COLUMN payroll_line_items.actually_paid_amount IS
  'Amount actually paid out-of-band (e.g., Venmo, Zelle). NULL means not yet paid. Used to track discrepancy between system-calculated amount_owed and actual disbursement.';

COMMENT ON COLUMN payroll_line_items.paid_at IS
  'Timestamp when the payment was recorded as made. Set on save when status=paid and actually_paid_amount is non-null.';
