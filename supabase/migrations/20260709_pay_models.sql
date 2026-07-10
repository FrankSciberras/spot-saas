-- =============================================================================
-- PAY MODELS: wage-based pay + per-preset settlement components
-- =============================================================================
-- Extends settlement presets beyond the Malta-style revenue split so fleets
-- anywhere can pay drivers a normal wage (hourly or fixed weekly), a revenue
-- share, or a mix of both.
--
-- The core idea is COMPONENTS: every line of a settlement (driver share of
-- fares, platform fee, cash collected, tips, campaigns, hourly wage, fixed
-- wage, tax, rent) can be switched on or off per preset. The `components`
-- JSONB holds { "<key>": bool } overrides; a missing key falls back to the
-- legacy default (classic split lines ON, wage lines OFF), so '{}' — the
-- default for every existing row — reproduces today's behaviour exactly.
-- Component keys: share, fee, cash, tips, campaigns, hours, fixed, tax, rent
-- (resolved in lib/config/settlements.ts).
--
-- driver_settlements gains frozen wage snapshots (like the scheme columns from
-- 20260604/20260610): hours worked, the hourly rate charged, the computed wage
-- amount and the component set — so editing a preset never re-prices history.
--
-- Safe to run once. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Preset wage fields + component toggles
-- -----------------------------------------------------------------------------
ALTER TABLE settlement_presets
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0);

ALTER TABLE settlement_presets
  ADD COLUMN IF NOT EXISTS fixed_wage_weekly NUMERIC NOT NULL DEFAULT 0 CHECK (fixed_wage_weekly >= 0);

ALTER TABLE settlement_presets
  ADD COLUMN IF NOT EXISTS components JSONB NOT NULL DEFAULT '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- 2. Frozen wage snapshot on settlements (defaults keep old rows unchanged)
-- -----------------------------------------------------------------------------
ALTER TABLE driver_settlements
  ADD COLUMN IF NOT EXISTS hours_worked NUMERIC NOT NULL DEFAULT 0 CHECK (hours_worked >= 0);

ALTER TABLE driver_settlements
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0);

ALTER TABLE driver_settlements
  ADD COLUMN IF NOT EXISTS wage_amount NUMERIC NOT NULL DEFAULT 0 CHECK (wage_amount >= 0);

ALTER TABLE driver_settlements
  ADD COLUMN IF NOT EXISTS components JSONB NOT NULL DEFAULT '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- 3. Documentation
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN settlement_presets.hourly_rate IS 'Hourly wage rate (EUR/hour) used when the "hours" component is enabled.';
COMMENT ON COLUMN settlement_presets.fixed_wage_weekly IS 'Fixed weekly wage (EUR) used when the "fixed" component is enabled.';
COMMENT ON COLUMN settlement_presets.components IS 'Per-preset settlement component toggles {key: bool}. Missing keys use the code defaults (split lines on, wage lines off) so {} = legacy behaviour.';
COMMENT ON COLUMN driver_settlements.hours_worked IS 'Frozen hours worked used to price this settlement (prefilled from shifts, editable).';
COMMENT ON COLUMN driver_settlements.hourly_rate IS 'Frozen hourly rate this settlement was priced with.';
COMMENT ON COLUMN driver_settlements.wage_amount IS 'Frozen wage line (hourly_rate x hours_worked + fixed weekly wage) included in this settlement.';
COMMENT ON COLUMN driver_settlements.components IS 'Frozen, fully-resolved component set this settlement was priced with.';

SELECT 'Pay models installed.' AS message;
