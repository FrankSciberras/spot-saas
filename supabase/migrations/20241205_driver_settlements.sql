-- =============================================================================
-- Driver Settlements Tables
-- =============================================================================
-- Run this migration to create the tables for the driver settlement module.

-- Create driver_settlements table
CREATE TABLE IF NOT EXISTS driver_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  week_label TEXT NOT NULL,
  period_name TEXT,
  fss_tax DECIMAL(10, 2) NOT NULL DEFAULT 22,
  total_gross_fare DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_net DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_balance_before_tax DECIMAL(10, 2) NOT NULL DEFAULT 0,
  final_balance DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one settlement per driver per week
  UNIQUE(driver_id, week_start)
);

-- Create settlement_platforms table
CREATE TABLE IF NOT EXISTS settlement_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES driver_settlements(id) ON DELETE CASCADE,
  platform_id TEXT NOT NULL,
  platform_name TEXT NOT NULL,
  gross_fare DECIMAL(10, 2) NOT NULL DEFAULT 0,
  platform_fee_percent DECIMAL(5, 2) NOT NULL DEFAULT 20,
  fifty_percent DECIMAL(10, 2) NOT NULL DEFAULT 0,
  fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  net DECIMAL(10, 2) NOT NULL DEFAULT 0,
  cash_ride DECIMAL(10, 2) NOT NULL DEFAULT 0,
  tips DECIMAL(10, 2) NOT NULL DEFAULT 0,
  campaigns DECIMAL(10, 2) NOT NULL DEFAULT 0,
  balance DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_driver_settlements_driver_id ON driver_settlements(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_week_start ON driver_settlements(week_start);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_status ON driver_settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlement_platforms_settlement_id ON settlement_platforms(settlement_id);

-- Create updated_at trigger for driver_settlements
CREATE OR REPLACE FUNCTION update_driver_settlements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_driver_settlements_updated_at ON driver_settlements;
CREATE TRIGGER trigger_driver_settlements_updated_at
  BEFORE UPDATE ON driver_settlements
  FOR EACH ROW
  EXECUTE FUNCTION update_driver_settlements_updated_at();

-- =============================================================================
-- Row Level Security (RLS) Policies
-- =============================================================================

-- Enable RLS on both tables
ALTER TABLE driver_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_platforms ENABLE ROW LEVEL SECURITY;

-- Policies for driver_settlements
-- Admin can do everything
CREATE POLICY "Admin full access to settlements" ON driver_settlements
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Staff can view all settlements
CREATE POLICY "Staff can view settlements" ON driver_settlements
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'staff'
    )
  );

-- Drivers can view their own finalized settlements
CREATE POLICY "Drivers can view own settlements" ON driver_settlements
  FOR SELECT
  TO authenticated
  USING (
    status = 'finalized'
    AND driver_id IN (
      SELECT id FROM drivers
      WHERE user_id = auth.uid()
    )
  );

-- Policies for settlement_platforms
-- Admin can do everything
CREATE POLICY "Admin full access to settlement platforms" ON settlement_platforms
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Staff can view all settlement platforms
CREATE POLICY "Staff can view settlement platforms" ON settlement_platforms
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'staff'
    )
  );

-- Drivers can view platforms for their own finalized settlements
CREATE POLICY "Drivers can view own settlement platforms" ON settlement_platforms
  FOR SELECT
  TO authenticated
  USING (
    settlement_id IN (
      SELECT ds.id FROM driver_settlements ds
      JOIN drivers d ON ds.driver_id = d.id
      WHERE d.user_id = auth.uid()
      AND ds.status = 'finalized'
    )
  );

-- =============================================================================
-- Comments for documentation
-- =============================================================================
COMMENT ON TABLE driver_settlements IS 'Weekly driver settlement records with calculated balances';
COMMENT ON TABLE settlement_platforms IS 'Per-platform earnings breakdown for each settlement';
COMMENT ON COLUMN driver_settlements.fss_tax IS 'FSS/Tax deduction amount (default €22, editable per settlement)';
COMMENT ON COLUMN driver_settlements.final_balance IS 'Final amount owed to driver after all deductions';
COMMENT ON COLUMN settlement_platforms.fifty_percent IS 'Driver share (50% of gross fare)';
COMMENT ON COLUMN settlement_platforms.fee IS 'Platform fee amount';
COMMENT ON COLUMN settlement_platforms.net IS 'Net after fee (fifty_percent - fee)';
COMMENT ON COLUMN settlement_platforms.campaigns IS 'Campaign bonuses - 100% to driver';
COMMENT ON COLUMN settlement_platforms.balance IS 'Platform balance (net - cash_ride + tips + campaigns)';
