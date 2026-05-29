-- =============================================================================
-- SAAS MIGRATION — PHASE 8: Fleet branding (white-label)
-- =============================================================================
-- Lets each fleet operator brand their dashboard: a logo (shown top-left in the
-- sidebar) and a single brand/accent colour that recolours primary actions,
-- links and active states. Branding is per-organization, so it automatically
-- cascades to that fleet's drivers (they share the same active org).
--
--   logo_url     public URL of the uploaded logo in the `branding` storage
--                bucket (NULL = use the default Spot logo)
--   brand_color  hex string like '#2f6bff' (NULL = use the default palette)
--
-- Logo files are written server-side with the service-role key (see
-- lib/actions/branding.ts), so the bucket needs no row-level policies for
-- writes; reads are public so <img>/next-image can load them directly.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Columns
-- -----------------------------------------------------------------------------
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS logo_url    TEXT;
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brand_color TEXT
    CHECK (brand_color IS NULL OR brand_color ~ '^#[0-9a-fA-F]{6}$');

-- -----------------------------------------------------------------------------
-- Public storage bucket for logos. Idempotent.
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO UPDATE SET public = true;

SELECT 'Phase 8 complete: fleet branding installed.' AS message;
