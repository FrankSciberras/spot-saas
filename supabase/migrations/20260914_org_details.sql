-- =============================================================================
-- FLEET DETAILS — editable by the fleet's admins from /fleet/settings.
-- =============================================================================
-- Contact + business identity for the fleet. Used on settlement PDFs and in
-- driver-facing emails ("your fleet office"), and by the platform admin.
-- =============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS legal_name     text,
  ADD COLUMN IF NOT EXISTS vat_number     text,
  ADD COLUMN IF NOT EXISTS contact_email  text,
  ADD COLUMN IF NOT EXISTS contact_phone  text,
  ADD COLUMN IF NOT EXISTS address        text,
  ADD COLUMN IF NOT EXISTS website        text;

SELECT 'organizations: legal_name, vat_number, contact_email, contact_phone, address, website added' AS message;
