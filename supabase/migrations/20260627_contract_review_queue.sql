-- Contract review queue — applied to prod via SQL Editor 2026-06-27.
-- Idempotent: all statements use IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS contract_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id),
  flagged_at timestamptz NOT NULL DEFAULT now(),
  flagged_by_admin_id uuid,
  reason text,
  resolved_at timestamptz,
  UNIQUE (contract_id)
);

CREATE INDEX IF NOT EXISTS idx_crq_unresolved ON contract_review_queue(flagged_at) WHERE resolved_at IS NULL;

ALTER TABLE contract_review_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contract_review_queue'
      AND policyname = 'service_role_only_crq'
  ) THEN
    CREATE POLICY "service_role_only_crq"
      ON contract_review_queue FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
