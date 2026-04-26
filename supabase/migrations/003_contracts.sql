-- ────────────────────────────────────────────────
-- TUTORS: add hourly_rate_cents column
-- ────────────────────────────────────────────────
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS hourly_rate_cents integer;

-- ────────────────────────────────────────────────
-- CONTRACTS
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id               uuid primary key default gen_random_uuid(),
  tutor_id         uuid not null references tutors(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  hourly_rate      integer not null,       -- dollars
  game_plan_url    text,                   -- signed storage URL (1-yr expiry)
  game_plan_path   text,                   -- storage object path for re-signing
  status           text not null default 'pending'
                     check (status in ('pending', 'signed', 'voided')),
  signed_at        timestamptz,
  tutor_signature  text,
  violation_count  integer not null default 0,
  created_at       timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_tutor   ON contracts(tutor_id);
CREATE INDEX IF NOT EXISTS idx_contracts_student ON contracts(student_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status  ON contracts(status);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_contracts"    ON contracts;
DROP POLICY IF EXISTS "public_read_contracts" ON contracts;

-- Authenticated admins: full access
CREATE POLICY "auth_all_contracts"
  ON contracts FOR ALL
  USING (auth.role() = 'authenticated');

-- Public: read-only (contract signing page fetches contract without auth)
CREATE POLICY "public_read_contracts"
  ON contracts FOR SELECT
  USING (true);

-- ────────────────────────────────────────────────
-- STORAGE BUCKET: game-plans
-- ────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('game-plans', 'game-plans', false)
ON CONFLICT (id) DO NOTHING;
