-- Zoom cleanup queue — applied to prod via SQL Editor 2026-06-29.
-- Records intent to delete Zoom meetings. Actual Zoom API calls are a separate cron.
-- Idempotent: all statements use IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS zoom_cleanup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id),
  zoom_meeting_id text NOT NULL,
  action text NOT NULL,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error text
);

CREATE INDEX IF NOT EXISTS idx_zcq_unprocessed ON zoom_cleanup_queue(enqueued_at) WHERE processed_at IS NULL;

ALTER TABLE zoom_cleanup_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'zoom_cleanup_queue'
      AND policyname = 'service_role_only_zcq'
  ) THEN
    CREATE POLICY "service_role_only_zcq"
      ON zoom_cleanup_queue FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
