-- =============================================================================
-- ADD SECONDARY DRIVER TO ROSTER ASSIGNMENTS
-- Run this in Supabase SQL Editor to add secondary driver support
-- =============================================================================

-- Add secondary_driver_id column to roster_assignments
ALTER TABLE roster_assignments 
ADD COLUMN IF NOT EXISTS secondary_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL;

-- Add index for secondary driver lookups
CREATE INDEX IF NOT EXISTS idx_roster_assignments_secondary_driver_id 
ON roster_assignments(secondary_driver_id);

-- Done!
SELECT 'Secondary driver column added successfully!' as message;
