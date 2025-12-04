-- Add TAG License expiry date column to drivers table
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS tag_license_expiry_date DATE;

-- Add TAG_LICENSE to document_type enum if not exists
DO $$ BEGIN
  ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'TAG_LICENSE';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

SELECT 'TAG License field added successfully!' as message;
