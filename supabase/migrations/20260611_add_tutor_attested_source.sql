-- =============================================================================
-- Add 'tutor_attested' to CHECK constraints on sessions.hours_source
-- and used_hours_audit_log.source
-- 2026-06-11
-- =============================================================================

BEGIN;

-- Drop the existing unnamed CHECK constraint on sessions.hours_source
-- and replace with one that includes 'tutor_attested'.
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.sessions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%hours_source%scheduled%actual%tutor_logged%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE sessions DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_hours_source_check CHECK (
    hours_source IS NULL OR hours_source IN ('scheduled', 'actual', 'tutor_logged', 'tutor_attested')
  );

-- Same for used_hours_audit_log.source
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.used_hours_audit_log'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%session_completion%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE used_hours_audit_log DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE used_hours_audit_log
  ADD CONSTRAINT used_hours_audit_log_source_check CHECK (
    source IN (
      'session_completion',
      'zoom_sync_overwrite',
      'tutor_log',
      'admin_manual',
      'cron_fallback',
      'tutor_attested'
    )
  );

COMMIT;
