-- =============================================================================
-- Driver Adjustments Table
-- =============================================================================
-- Stores flexible expense, bonus, deduction, and reimbursement records for drivers.
-- This allows admins to track fuel expenses, bonuses, and other financial adjustments.

-- Create the adjustment type enum
DO $$ BEGIN
    CREATE TYPE adjustment_type AS ENUM ('expense', 'bonus', 'deduction', 'reimbursement', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create driver_adjustments table
CREATE TABLE IF NOT EXISTS driver_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    type adjustment_type NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    description TEXT NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_driver_adjustments_driver_id ON driver_adjustments(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_adjustments_date ON driver_adjustments(date DESC);
CREATE INDEX IF NOT EXISTS idx_driver_adjustments_type ON driver_adjustments(type);
CREATE INDEX IF NOT EXISTS idx_driver_adjustments_driver_date ON driver_adjustments(driver_id, date DESC);

-- Enable Row Level Security
ALTER TABLE driver_adjustments ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can do everything
CREATE POLICY "Admins can manage all adjustments" ON driver_adjustments
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

-- Policy: Staff can view all adjustments
CREATE POLICY "Staff can view all adjustments" ON driver_adjustments
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'staff'
        )
    );

-- Policy: Drivers can view their own adjustments
CREATE POLICY "Drivers can view own adjustments" ON driver_adjustments
    FOR SELECT
    TO authenticated
    USING (
        driver_id IN (
            SELECT id FROM drivers 
            WHERE user_id = auth.uid()
        )
    );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_driver_adjustments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_driver_adjustments_updated_at ON driver_adjustments;
CREATE TRIGGER trigger_driver_adjustments_updated_at
    BEFORE UPDATE ON driver_adjustments
    FOR EACH ROW
    EXECUTE FUNCTION update_driver_adjustments_updated_at();

-- Grant permissions
GRANT ALL ON driver_adjustments TO authenticated;
GRANT SELECT ON driver_adjustments TO anon;
