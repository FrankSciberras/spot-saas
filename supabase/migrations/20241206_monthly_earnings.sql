-- =============================================================================
-- Monthly Earnings Table
-- =============================================================================
-- Admin-only table for tracking monthly business financials

CREATE TABLE IF NOT EXISTS monthly_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Period
  month DATE NOT NULL UNIQUE, -- First day of month (e.g., 2024-01-01)
  
  -- Platform Revenue (Gross)
  bolt_gross DECIMAL(10, 2) NOT NULL DEFAULT 0,
  uber_gross DECIMAL(10, 2) NOT NULL DEFAULT 0,
  offapp_gross DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- VAT (manually entered)
  bolt_vat DECIMAL(10, 2) NOT NULL DEFAULT 0,
  uber_vat DECIMAL(10, 2) NOT NULL DEFAULT 0,
  offapp_vat DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Platform Commissions (what Bolt/Uber take from you)
  bolt_commission DECIMAL(10, 2) NOT NULL DEFAULT 0,
  uber_commission DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Driver Costs
  driver_settlements_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Operating Expenses
  rent DECIMAL(10, 2) NOT NULL DEFAULT 0,
  utilities DECIMAL(10, 2) NOT NULL DEFAULT 0,
  insurance DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ni_tax DECIMAL(10, 2) NOT NULL DEFAULT 0,
  services_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  fuel DECIMAL(10, 2) NOT NULL DEFAULT 0,
  vehicle_expenses DECIMAL(10, 2) NOT NULL DEFAULT 0,
  other_expenses DECIMAL(10, 2) NOT NULL DEFAULT 0,
  other_expenses_notes TEXT,
  
  -- Calculated Totals (stored for convenience)
  total_gross_revenue DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_vat DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_commissions DECIMAL(10, 2) NOT NULL DEFAULT 0,
  net_revenue DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_expenses DECIMAL(10, 2) NOT NULL DEFAULT 0,
  net_profit DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  notes TEXT,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_monthly_earnings_month ON monthly_earnings(month);
CREATE INDEX IF NOT EXISTS idx_monthly_earnings_status ON monthly_earnings(status);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_monthly_earnings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_monthly_earnings_updated_at ON monthly_earnings;
CREATE TRIGGER trigger_monthly_earnings_updated_at
  BEFORE UPDATE ON monthly_earnings
  FOR EACH ROW
  EXECUTE FUNCTION update_monthly_earnings_updated_at();

-- =============================================================================
-- Row Level Security (RLS) Policies
-- =============================================================================

ALTER TABLE monthly_earnings ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admin full access to monthly_earnings"
  ON monthly_earnings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
