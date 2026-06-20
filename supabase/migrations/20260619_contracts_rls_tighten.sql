-- Phase 4 of contracts RLS migration: tighten to service-role only
-- Applied to prod via Supabase SQL Editor on 2026-06-19.
-- 
-- Context: Prior to this, contracts had two permissive policies:
--   - auth_all_contracts: FOR ALL USING (auth.role() = 'authenticated')
--   - public_read_contracts: FOR SELECT USING (true)
-- 
-- This meant any authenticated user could read all contracts, including
-- permanent_zoom_host_url which grants meeting takeover access.
-- 
-- Phases 1-3 migrated all client-side queries to server endpoints:
--   - /api/tutor-portal/contracts (tutor JWT auth, filters by tutor_id)
--   - /api/parent-portal/contracts (parent JWT auth, filters via parent's students)
--   - /api/student-portal/contracts (student JWT auth, filters by student_id)
--   - /api/admin/contracts (admin auth via Supabase auth)
--   - /api/contracts/[contract_id]/signing-data (UUID-gated, public)
-- 
-- All server endpoints use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
-- This migration drops the permissive policies and locks contracts to 
-- service-role access only.

BEGIN;

DROP POLICY IF EXISTS "auth_all_contracts" ON contracts;
DROP POLICY IF EXISTS "public_read_contracts" ON contracts;

CREATE POLICY "service_role_only_contracts"
  ON contracts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMIT;
