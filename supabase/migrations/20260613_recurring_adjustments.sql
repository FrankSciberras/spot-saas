-- =============================================================================
-- RECURRING ADJUSTMENT RULES (define once, auto-apply to settlements)
-- =============================================================================
-- Builds on the frozen-adjustments work (20260612). Instead of typing the same
-- weekly deduction/bonus for every driver every period, a fleet operator defines
-- a RULE once — "Insurance €20/week (all drivers)", "Equipment €15/week
-- (driver X)", "Platform levy 2% of gross (all)" — and each new settlement
-- materializes the applicable rules into real driver_adjustments rows, which are
-- then frozen onto the settlement exactly like a manual adjustment.
--
--   recurring_adjustments — the rules (org-scoped; driver_id NULL = whole fleet).
--     amount_type 'fixed'           → amount is EUR per settlement,
--     amount_type 'percent_of_gross'→ amount is % of the settlement's gross fare.
--     active + start_date/end_date bound when a rule applies.
--
--   driver_adjustments.recurring_rule_id — marks an adjustment row as generated
--     by a rule (vs. typed by hand) and dedupes re-materialization for the same
--     rule+period. ON DELETE SET NULL so deleting a rule never deletes the
--     history it already produced (those rows stay frozen on their settlements).
--
-- The generated rows carry the rule's type, so the existing signed-net logic
-- (expense/deduction −, bonus/reimbursement +) and freezing apply unchanged.
--
-- Safe to run once. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. recurring_adjustments table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recurring_adjustments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- NULL = applies to every driver in the fleet; otherwise just this driver.
  driver_id       UUID REFERENCES drivers(id) ON DELETE CASCADE,
  type            adjustment_type NOT NULL,
  amount_type     TEXT NOT NULL DEFAULT 'fixed' CHECK (amount_type IN ('fixed', 'percent_of_gross')),
  amount          NUMERIC NOT NULL CHECK (amount >= 0),
  description     TEXT NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  -- Rule applies to settlement periods overlapping [start_date, end_date].
  start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_recurring_adjustments_org_id ON recurring_adjustments(organization_id);
CREATE INDEX IF NOT EXISTS idx_recurring_adjustments_driver_id ON recurring_adjustments(driver_id);

-- -----------------------------------------------------------------------------
-- 2. Link generated adjustment rows back to their rule (dedupe + provenance).
-- -----------------------------------------------------------------------------
ALTER TABLE driver_adjustments
  ADD COLUMN IF NOT EXISTS recurring_rule_id UUID REFERENCES recurring_adjustments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_driver_adjustments_recurring_rule_id
  ON driver_adjustments(recurring_rule_id);

-- -----------------------------------------------------------------------------
-- 3. RLS — members of the org can read its rules; writes go through admin-only
--    server actions (service role), so no write policies are needed.
-- -----------------------------------------------------------------------------
ALTER TABLE recurring_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their org recurring adjustments" ON recurring_adjustments;
CREATE POLICY "Members can view their org recurring adjustments"
  ON recurring_adjustments FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 4. updated_at trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_recurring_adjustments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recurring_adjustments_updated_at ON recurring_adjustments;
CREATE TRIGGER trigger_recurring_adjustments_updated_at
  BEFORE UPDATE ON recurring_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION update_recurring_adjustments_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Documentation
-- -----------------------------------------------------------------------------
COMMENT ON TABLE recurring_adjustments IS 'Per-fleet rules that auto-generate driver_adjustments on each settlement (rent contributions, levies, standing bonuses).';
COMMENT ON COLUMN recurring_adjustments.driver_id IS 'NULL = applies to every driver in the org; otherwise scoped to one driver.';
COMMENT ON COLUMN recurring_adjustments.amount_type IS 'fixed = amount is EUR; percent_of_gross = amount is % of the settlement gross fare.';
COMMENT ON COLUMN driver_adjustments.recurring_rule_id IS 'Set when this adjustment was generated by a recurring rule (vs. entered by hand). Dedupes re-materialization.';

SELECT 'Recurring adjustments installed.' AS message;
