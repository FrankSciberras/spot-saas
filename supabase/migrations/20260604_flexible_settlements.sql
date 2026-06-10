-- =============================================================================
-- FLEXIBLE SETTLEMENTS (per-fleet revenue-sharing schemes)
-- =============================================================================
-- Until now the settlement maths were hardcoded for one operator's model:
--   * driver share fixed at 50% of gross fare (DRIVER_SHARE_PERCENT in
--     lib/config/settlements.ts),
--   * tips and campaigns ALWAYS paid 100% to the driver,
--   * the platform fee ALWAYS absorbed in full by the driver.
--
-- Real fleets differ: some split 55/45, some keep campaigns or tips for the
-- company, some share the platform commission. This migration turns each of
-- those fixed behaviours into a configurable PERCENTAGE, expressed as "how much
-- of X goes to / is borne by the DRIVER":
--
--   driver_share_pct      driver's cut of gross fare              (was fixed 50)
--   tips_driver_pct       share of tips paid to the driver        (was fixed 100)
--   campaigns_driver_pct  share of campaigns paid to the driver   (was fixed 100)
--   fee_driver_pct        share of the platform fee borne by the driver (was 100)
--
-- The knobs live in three places, resolved override -> default -> code default:
--   * organizations.*  — the fleet-wide DEFAULT scheme (NOT NULL, seeded to the
--     old hardcoded numbers so nothing changes until an operator edits them).
--   * drivers.*        — OPTIONAL per-driver override (NULL = inherit the org
--     default), e.g. a senior driver on a better 55/45 split.
--   * driver_settlements.* — a SNAPSHOT of the scheme actually used, frozen onto
--     each settlement at save time so editing an old record never silently
--     re-prices it against a scheme the operator has since changed.
--
-- All percentages are 0..100. Defaults reproduce today's behaviour exactly.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- organizations — the fleet-wide default scheme.
-- -----------------------------------------------------------------------------
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS settlement_driver_share_pct     numeric NOT NULL DEFAULT 50
    CHECK (settlement_driver_share_pct BETWEEN 0 AND 100);
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS settlement_tips_driver_pct      numeric NOT NULL DEFAULT 100
    CHECK (settlement_tips_driver_pct BETWEEN 0 AND 100);
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS settlement_campaigns_driver_pct numeric NOT NULL DEFAULT 100
    CHECK (settlement_campaigns_driver_pct BETWEEN 0 AND 100);
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS settlement_fee_driver_pct       numeric NOT NULL DEFAULT 100
    CHECK (settlement_fee_driver_pct BETWEEN 0 AND 100);

-- -----------------------------------------------------------------------------
-- drivers — optional per-driver override. NULL means "inherit the org default".
-- -----------------------------------------------------------------------------
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS settlement_driver_share_pct     numeric
    CHECK (settlement_driver_share_pct IS NULL OR settlement_driver_share_pct BETWEEN 0 AND 100);
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS settlement_tips_driver_pct      numeric
    CHECK (settlement_tips_driver_pct IS NULL OR settlement_tips_driver_pct BETWEEN 0 AND 100);
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS settlement_campaigns_driver_pct numeric
    CHECK (settlement_campaigns_driver_pct IS NULL OR settlement_campaigns_driver_pct BETWEEN 0 AND 100);
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS settlement_fee_driver_pct       numeric
    CHECK (settlement_fee_driver_pct IS NULL OR settlement_fee_driver_pct BETWEEN 0 AND 100);

-- -----------------------------------------------------------------------------
-- driver_settlements — the frozen snapshot of the scheme used for this record.
-- NOT NULL with the old hardcoded defaults so existing rows read back unchanged.
-- -----------------------------------------------------------------------------
ALTER TABLE driver_settlements
  ADD COLUMN IF NOT EXISTS driver_share_pct     numeric NOT NULL DEFAULT 50
    CHECK (driver_share_pct BETWEEN 0 AND 100);
ALTER TABLE driver_settlements
  ADD COLUMN IF NOT EXISTS tips_driver_pct      numeric NOT NULL DEFAULT 100
    CHECK (tips_driver_pct BETWEEN 0 AND 100);
ALTER TABLE driver_settlements
  ADD COLUMN IF NOT EXISTS campaigns_driver_pct numeric NOT NULL DEFAULT 100
    CHECK (campaigns_driver_pct BETWEEN 0 AND 100);
ALTER TABLE driver_settlements
  ADD COLUMN IF NOT EXISTS fee_driver_pct       numeric NOT NULL DEFAULT 100
    CHECK (fee_driver_pct BETWEEN 0 AND 100);

-- -----------------------------------------------------------------------------
-- Documentation
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN organizations.settlement_driver_share_pct     IS 'Fleet default: driver''s cut of gross fare (%). 50 = old behaviour.';
COMMENT ON COLUMN organizations.settlement_tips_driver_pct      IS 'Fleet default: share of tips paid to the driver (%). 100 = driver keeps all.';
COMMENT ON COLUMN organizations.settlement_campaigns_driver_pct IS 'Fleet default: share of campaigns paid to the driver (%). 100 = driver keeps all.';
COMMENT ON COLUMN organizations.settlement_fee_driver_pct       IS 'Fleet default: share of the platform fee borne by the driver (%). 100 = driver absorbs the full fee.';
COMMENT ON COLUMN drivers.settlement_driver_share_pct           IS 'Per-driver override of the fleet split (%). NULL = inherit org default.';
COMMENT ON COLUMN driver_settlements.driver_share_pct           IS 'Frozen snapshot of the driver share (%) used to price this settlement.';

SELECT 'Flexible settlements installed.' AS message;
