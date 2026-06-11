-- =============================================================================
-- FREEZE ADJUSTMENTS INTO SETTLEMENTS
-- =============================================================================
-- Driver adjustments (fuel, fines, bonuses, deductions) were only ever OVERLAID
-- on a settlement's payable balance — fetched live by date range every time the
-- settlement was viewed/exported and added on top of final_balance. That had two
-- problems:
--   1. The stored driver_settlements.final_balance did NOT reflect adjustments,
--      so the saved record disagreed with what the operator saw on screen.
--   2. Editing or deleting an old adjustment retroactively changed the displayed
--      payable of an ALREADY-FINALIZED (and possibly paid) settlement.
--
-- This freezes adjustments the same way the settlement scheme is frozen:
--   * driver_adjustments.settlement_id — links an adjustment to the settlement
--     that consumed it. ON DELETE SET NULL so deleting a settlement releases its
--     adjustments back to "unattached" (re-captured next time that period saves).
--   * driver_settlements.total_adjustments — the frozen NET of the linked
--     adjustments at save time (signed: expense/deduction negative,
--     bonus/reimbursement positive, other zero).
--
-- final_balance KEEPS its existing meaning (platform balance − tax − rent,
-- excluding adjustments); the amount actually owed is
-- final_balance + total_adjustments. This matches every existing consumer that
-- already computes "payable = final_balance + adjustments", so nothing
-- double-counts.
--
-- Safe to run once. Idempotent. Existing rows get total_adjustments = 0, i.e.
-- they read back exactly as before until re-saved.
-- =============================================================================

ALTER TABLE driver_settlements
  ADD COLUMN IF NOT EXISTS total_adjustments NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE driver_adjustments
  ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES driver_settlements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_driver_adjustments_settlement_id
  ON driver_adjustments(settlement_id);

COMMENT ON COLUMN driver_settlements.total_adjustments IS
  'Frozen net of the driver_adjustments linked to this settlement (signed). Amount owed = final_balance + total_adjustments.';
COMMENT ON COLUMN driver_adjustments.settlement_id IS
  'The settlement that consumed this adjustment (frozen at save). NULL = not yet attached to any settlement.';

SELECT 'Adjustment freezing installed.' AS message;
