-- =============================================================================
-- APPLY: Phase 8 — fleet branding (run against production Supabase)
-- =============================================================================
-- Idempotent. Adds logo_url + brand_color columns to organizations and creates
-- a public `branding` storage bucket for uploaded logos.
-- =============================================================================

BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS logo_url    TEXT;
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brand_color TEXT
    CHECK (brand_color IS NULL OR brand_color ~ '^#[0-9a-fA-F]{6}$');

INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO UPDATE SET public = true;

COMMIT;

-- Verify ------------------------------------------------------------------
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'organizations'
  AND column_name IN ('logo_url', 'brand_color')
ORDER BY column_name;

SELECT id, public FROM storage.buckets WHERE id = 'branding';
