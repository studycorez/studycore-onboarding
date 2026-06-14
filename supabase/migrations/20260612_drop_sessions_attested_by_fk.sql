-- Drop the FK constraint on sessions.attested_by → tutors(id)
--
-- WHY: sessions table has TWO FKs to tutors (tutor_id and attested_by, the
-- latter added by 20260611_session_attestation_schema.sql for Phase A).
-- When Supabase/PostgREST tries to embed tutor:tutors(...) it can't decide
-- which FK to use → returns PGRST201 ambiguity error → silently breaks
-- ~50 queries across admin, parent portal, student portal, and API routes.
--
-- The column itself stays - the attestation system writes to it.
-- Application code validates tutor existence before writing, so we don't
-- lose meaningful integrity by removing the DB-level FK constraint.
--
-- Applied to prod manually on 2026-06-12. This migration captures the change.

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_attested_by_fkey;
