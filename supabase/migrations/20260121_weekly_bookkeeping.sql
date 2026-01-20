-- =============================================================================
-- Weekly Bookkeeping Table
-- =============================================================================
-- Flexible week-by-week bookkeeping with custom date periods (like settlements)

CREATE TABLE IF NOT EXISTS weekly_bookkeeping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Period identification (flexible dates like settlements)
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  week_label TEXT NOT NULL,  -- e.g., "Week 1", "23 Dec - 29 Dec"
  period_name TEXT,          -- Optional custom name
  
  -- Income (Platform Earnings - what you receive after their deductions)
  uber_earnings DECIMAL(10, 2) NOT NULL DEFAULT 0,
  bolt_earnings DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ecabs_earnings DECIMAL(10, 2) NOT NULL DEFAULT 0,
  other_earnings DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Expenses
  employees DECIMAL(10, 2) NOT NULL DEFAULT 0,        -- Driver settlements
  repairs DECIMAL(10, 2) NOT NULL DEFAULT 0,
  insurance DECIMAL(10, 2) NOT NULL DEFAULT 0,
  investments DECIMAL(10, 2) NOT NULL DEFAULT 0,
  vat DECIMAL(10, 2) NOT NULL DEFAULT 0,
  rent DECIMAL(10, 2) NOT NULL DEFAULT 0,
  employee_tax DECIMAL(10, 2) NOT NULL DEFAULT 0,
  other_expenses DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Calculated totals (stored for convenience)
  total_income DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_expenses DECIMAL(10, 2) NOT NULL DEFAULT 0,
  net_profit DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Notes
  notes TEXT,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one entry per date range
  UNIQUE(week_start, week_end)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_weekly_bookkeeping_dates ON weekly_bookkeeping(week_start, week_end);
CREATE INDEX IF NOT EXISTS idx_weekly_bookkeeping_start ON weekly_bookkeeping(week_start DESC);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_weekly_bookkeeping_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_weekly_bookkeeping_updated_at ON weekly_bookkeeping;
CREATE TRIGGER trigger_weekly_bookkeeping_updated_at
  BEFORE UPDATE ON weekly_bookkeeping
  FOR EACH ROW
  EXECUTE FUNCTION update_weekly_bookkeeping_updated_at();

-- =============================================================================
-- Row Level Security (RLS) Policies
-- =============================================================================

ALTER TABLE weekly_bookkeeping ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admin full access to weekly_bookkeeping"
  ON weekly_bookkeeping
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
