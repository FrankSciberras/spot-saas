-- =============================================================================
-- Settlement Paid Status
-- =============================================================================
-- Track when driver settlements have been paid out

-- Add paid_at column to driver_settlements
ALTER TABLE driver_settlements 
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for filtering by paid status
CREATE INDEX IF NOT EXISTS idx_driver_settlements_paid_at 
ON driver_settlements(paid_at);

-- Comment for documentation
COMMENT ON COLUMN driver_settlements.paid_at IS 'Timestamp when the settlement was paid out to the driver. NULL means unpaid.';
