-- =============================================================================
-- SETTLEMENT PRESETS (named, reusable settlement schemes per fleet)
-- =============================================================================
-- Instead of tuning four percentages per driver, a fleet operator creates a few
-- named presets ("Standard 50/50", "Fixed rent", "Senior 60/40") that bundle:
--   * driver_share_pct / tips_driver_pct / campaigns_driver_pct / fee_driver_pct
--     (the existing scheme knobs from 20260604_flexible_settlements.sql),
--   * tax_type + tax_value  — FSS/tax as a flat EUR amount or a % of the
--     balance before tax (prefills the settlement form; still editable per
--     settlement),
--   * rent_weekly           — optional fixed weekly vehicle-rent deduction
--     (enables the "driver keeps 100%, pays rent" pay model).
--
-- Assignment is two-level, mirroring the scheme columns it replaces:
--   drivers.settlement_preset_id  ->  organizations.default_settlement_preset_id
-- with the legacy column-based scheme (org/driver settlement_* columns) kept as
-- the final fallback so nothing breaks for orgs without presets.
--
-- driver_settlements gains a frozen `rent_amount` snapshot: like the scheme
-- percentages, the rent actually charged is stamped onto the settlement at save
-- time so later preset edits never silently re-price old records.
--
-- Seeding: every existing org gets a "Standard" preset built from its current
-- fleet-default scheme columns (tax flat EUR22, no rent) and it becomes the org
-- default — so behaviour is unchanged until the operator edits things.
--
-- Safe to run once. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. settlement_presets table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settlement_presets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  -- Revenue-sharing scheme (same semantics as the org/driver settlement_* columns)
  driver_share_pct     NUMERIC NOT NULL DEFAULT 50  CHECK (driver_share_pct     BETWEEN 0 AND 100),
  tips_driver_pct      NUMERIC NOT NULL DEFAULT 100 CHECK (tips_driver_pct      BETWEEN 0 AND 100),
  campaigns_driver_pct NUMERIC NOT NULL DEFAULT 100 CHECK (campaigns_driver_pct BETWEEN 0 AND 100),
  fee_driver_pct       NUMERIC NOT NULL DEFAULT 100 CHECK (fee_driver_pct       BETWEEN 0 AND 100),
  -- FSS/tax prefill: flat EUR amount or % of balance-before-tax
  tax_type             TEXT NOT NULL DEFAULT 'flat' CHECK (tax_type IN ('flat', 'percent')),
  tax_value            NUMERIC NOT NULL DEFAULT 22 CHECK (tax_value >= 0),
  -- Optional fixed weekly vehicle-rent deduction (0 = none)
  rent_weekly          NUMERIC NOT NULL DEFAULT 0 CHECK (rent_weekly >= 0),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_settlement_presets_org_id ON settlement_presets(organization_id);

-- -----------------------------------------------------------------------------
-- 2. Assignment columns. ON DELETE SET NULL = deleting a preset gracefully
--    falls assignees back to the org default (or the legacy scheme columns).
-- -----------------------------------------------------------------------------
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS default_settlement_preset_id UUID REFERENCES settlement_presets(id) ON DELETE SET NULL;

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS settlement_preset_id UUID REFERENCES settlement_presets(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 3. Frozen rent snapshot on settlements (0 keeps old rows reading unchanged).
-- -----------------------------------------------------------------------------
ALTER TABLE driver_settlements
  ADD COLUMN IF NOT EXISTS rent_amount NUMERIC NOT NULL DEFAULT 0 CHECK (rent_amount >= 0);

-- -----------------------------------------------------------------------------
-- 4. RLS — members of the org can read its presets; writes go through
--    admin-only server actions (service role), so no write policies needed.
-- -----------------------------------------------------------------------------
ALTER TABLE settlement_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their org presets" ON settlement_presets;
CREATE POLICY "Members can view their org presets"
  ON settlement_presets FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Seed: one "Standard" preset per existing org from its current fleet
--    defaults, set as the org default. Skips orgs that already have presets.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_org RECORD;
  v_preset_id UUID;
BEGIN
  FOR v_org IN
    SELECT id,
           settlement_driver_share_pct,
           settlement_tips_driver_pct,
           settlement_campaigns_driver_pct,
           settlement_fee_driver_pct
    FROM organizations
    WHERE id NOT IN (SELECT DISTINCT organization_id FROM settlement_presets)
  LOOP
    INSERT INTO settlement_presets (
      organization_id, name,
      driver_share_pct, tips_driver_pct, campaigns_driver_pct, fee_driver_pct,
      tax_type, tax_value, rent_weekly
    ) VALUES (
      v_org.id, 'Standard',
      COALESCE(v_org.settlement_driver_share_pct, 50),
      COALESCE(v_org.settlement_tips_driver_pct, 100),
      COALESCE(v_org.settlement_campaigns_driver_pct, 100),
      COALESCE(v_org.settlement_fee_driver_pct, 100),
      'flat', 22, 0
    )
    RETURNING id INTO v_preset_id;

    UPDATE organizations
    SET default_settlement_preset_id = v_preset_id
    WHERE id = v_org.id AND default_settlement_preset_id IS NULL;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 6. updated_at trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_settlement_presets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_settlement_presets_updated_at ON settlement_presets;
CREATE TRIGGER trigger_settlement_presets_updated_at
  BEFORE UPDATE ON settlement_presets
  FOR EACH ROW
  EXECUTE FUNCTION update_settlement_presets_updated_at();

-- -----------------------------------------------------------------------------
-- 7. Documentation
-- -----------------------------------------------------------------------------
COMMENT ON TABLE settlement_presets IS 'Named per-fleet settlement schemes: revenue split + tax + weekly rent, assigned per driver or as the fleet default.';
COMMENT ON COLUMN settlement_presets.tax_type IS 'How tax_value is interpreted: flat EUR amount, or percent of balance before tax.';
COMMENT ON COLUMN settlement_presets.rent_weekly IS 'Fixed weekly vehicle-rent deduction (EUR). 0 = no rent. Enables 100%-minus-rent pay models.';
COMMENT ON COLUMN organizations.default_settlement_preset_id IS 'Preset applied to drivers without their own settlement_preset_id.';
COMMENT ON COLUMN drivers.settlement_preset_id IS 'Per-driver preset override. NULL = inherit the fleet default preset.';
COMMENT ON COLUMN driver_settlements.rent_amount IS 'Frozen snapshot of the weekly rent deducted in this settlement.';

SELECT 'Settlement presets installed.' AS message;
