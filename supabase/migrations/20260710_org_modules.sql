-- =============================================================================
-- FLEET MODULES (per-fleet feature on/off — the "apps" / plugins system)
-- =============================================================================
-- A fleet operator switches product modules (Settlements, Rostering, Live
-- Tracking, Maintenance, Bookkeeping, Reminders, …) on or off for their own
-- workspace. The MASTER LIST of modules lives in code (lib/modules/catalog.ts);
-- THIS table only records a fleet's OVERRIDES — a row exists only when a fleet
-- has flipped a module away from its catalog default.
--
--   org_modules(organization_id, module_key, is_enabled)
--     is_enabled = FALSE → the fleet turned an on-by-default module off.
--     is_enabled = TRUE  → the fleet turned an off-by-default module on.
--     no row             → use the module's default from the catalog.
--
-- Storing only OVERRIDES means shipping a NEW module in code needs NO migration
-- and NO backfill: every existing fleet simply inherits the new module's default
-- until they choose otherwise. That is what keeps the system infinitely
-- extensible from the app layer alone.
--
-- Writes go through an admin-only server action (service role, bypasses RLS), so
-- only a member-SELECT policy is defined. Safe to run once. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. org_modules table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_modules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Stable module slug from lib/modules/catalog.ts (e.g. 'settlements').
  module_key      TEXT NOT NULL,
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One override row per module per fleet (also the upsert conflict target).
  UNIQUE (organization_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_org_modules_org_id ON org_modules(organization_id);

-- -----------------------------------------------------------------------------
-- 2. RLS — members can read their org's module settings; writes go through the
--    admin-only server action (service role), so no write policies are needed.
-- -----------------------------------------------------------------------------
ALTER TABLE org_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their org modules" ON org_modules;
CREATE POLICY "Members can view their org modules"
  ON org_modules FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 3. updated_at trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_org_modules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_org_modules_updated_at ON org_modules;
CREATE TRIGGER trigger_org_modules_updated_at
  BEFORE UPDATE ON org_modules
  FOR EACH ROW
  EXECUTE FUNCTION update_org_modules_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Documentation
-- -----------------------------------------------------------------------------
COMMENT ON TABLE org_modules IS 'Per-fleet module on/off OVERRIDES. No row = use the catalog default (lib/modules/catalog.ts). Only stores modules a fleet has flipped away from its default, so new modules need no migration.';
COMMENT ON COLUMN org_modules.module_key IS 'Stable module slug from lib/modules/catalog.ts (settlements, bookkeeping, rostering, tracking, maintenance, reminders, …).';
COMMENT ON COLUMN org_modules.is_enabled IS 'TRUE = module on for this fleet; FALSE = off. Absence of a row = the catalog default.';

SELECT 'Org modules installed.' AS message;
