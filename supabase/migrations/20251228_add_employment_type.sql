-- =============================================================================
-- ADD EMPLOYMENT_TYPE TO DRIVERS TABLE
-- Run this migration to add employment type tracking for drivers
-- =============================================================================

-- Create employment_type enum if it doesn't exist
DO $$ BEGIN
  CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'terminated');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add employment_type column to drivers table
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS employment_type employment_type;

-- Create index for filtering by employment type
CREATE INDEX IF NOT EXISTS idx_drivers_employment_type ON drivers(employment_type);

SELECT 'Employment type column added successfully!' as message;
