-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: session_recordings + fathom_unmatched_recordings
-- Idempotent: uses IF NOT EXISTS and ON CONFLICT DO NOTHING throughout.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. session_recordings ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_recordings (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID         NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  fathom_recording_id   BIGINT       NOT NULL UNIQUE,
  fathom_recording_url  TEXT         NOT NULL,
  fathom_share_url      TEXT,
  recording_start_time  TIMESTAMPTZ,
  recording_end_time    TIMESTAMPTZ,
  duration_seconds      INTEGER      GENERATED ALWAYS AS (
                          EXTRACT(EPOCH FROM (recording_end_time - recording_start_time))::int
                        ) STORED,
  match_method          TEXT,
  is_primary            BOOLEAN      DEFAULT false,
  created_at            TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_recordings_session_id
  ON session_recordings(session_id);

CREATE INDEX IF NOT EXISTS idx_session_recordings_primary
  ON session_recordings(session_id) WHERE is_primary = true;

-- ── 2. fathom_unmatched_recordings ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fathom_unmatched_recordings (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  fathom_recording_id  BIGINT       UNIQUE,
  title                TEXT,
  host_email           TEXT,
  participant_emails   TEXT[],
  started_at           TIMESTAMPTZ,
  fathom_share_url     TEXT,
  category             TEXT,        -- 'tutor_recognized_no_session' | 'no_known_participants' | 'internal_skipped'
  no_match_reasons     JSONB,
  last_seen_at         TIMESTAMPTZ  DEFAULT NOW(),
  resolved             BOOLEAN      DEFAULT false,
  resolved_session_id  UUID         REFERENCES sessions(id),
  created_at           TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE session_recordings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fathom_unmatched_recordings ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically; these policies give no access to
-- anonymous / authenticated users (admin reads go through service role key).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'session_recordings' AND policyname = 'admin_service_role_only'
  ) THEN
    CREATE POLICY admin_service_role_only ON session_recordings
      USING (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fathom_unmatched_recordings' AND policyname = 'admin_service_role_only'
  ) THEN
    CREATE POLICY admin_service_role_only ON fathom_unmatched_recordings
      USING (false);
  END IF;
END $$;

-- ── 4. Backfill from sessions.fathom_recording_url ────────────────────────────
-- For each session that already has a URL, insert one session_recordings row
-- with is_primary = true.
-- Uses a stable BIGINT derived from the session UUID so the operation is
-- idempotent — re-running produces the same IDs and ON CONFLICT skips them.
-- Negative values avoid clashing with real positive Fathom call IDs.
-- (hashtext returns int4; collisions across 500 sessions are statistically
-- negligible — any collision would simply skip the row silently.)
INSERT INTO session_recordings (
  session_id, fathom_recording_id, fathom_recording_url, is_primary, match_method
)
SELECT
  s.id,
  -abs(hashtext(s.id::text))::bigint - 1,   -- stable negative placeholder BIGINT
  s.fathom_recording_url,
  true,
  'backfill'
FROM sessions s
WHERE s.fathom_recording_url IS NOT NULL
  AND trim(s.fathom_recording_url) != ''
  AND NOT EXISTS (
    SELECT 1 FROM session_recordings sr WHERE sr.session_id = s.id
  )
ON CONFLICT (fathom_recording_id) DO NOTHING;
