-- =============================================================================
-- Settlement Month Tagging
-- =============================================================================
-- Simple addition to tag weekly settlements with a calendar month for grouping.

-- Add settlement_month column to driver_settlements
-- This stores the first day of the month (e.g., 2024-12-01 for December 2024)
ALTER TABLE driver_settlements 
ADD COLUMN IF NOT EXISTS settlement_month DATE;

-- Create index for filtering by month
CREATE INDEX IF NOT EXISTS idx_driver_settlements_settlement_month 
ON driver_settlements(settlement_month);

-- Comment for documentation
COMMENT ON COLUMN driver_settlements.settlement_month IS 'Calendar month this settlement belongs to (first day of month, e.g., 2024-12-01)';
