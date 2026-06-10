-- =============================================================================
-- VEHICLE MODEL PRESETS (platform-admin-managed car diagram library)
-- =============================================================================
-- A GLOBAL library of car models, owned by the platform admin (the SaaS
-- operator — see platform_admins). Each preset has a friendly name, optional
-- make/model, a unique model_key (slug) and uploaded top/side diagram images.
-- The clickable damage zones traced over those images already live in
-- vehicle_diagram_zones (joined on model_key).
--
-- Roles:
--   * PLATFORM admins create/edit presets + trace zones (only them).
--   * FLEET operators only PICK a preset for a vehicle (vehicles.vehicle_model_id);
--     they can never edit zones or images.
--
-- This migration also fixes a pre-existing gap: the vehicle_diagram_zones write
-- policy used the deprecated users.role='admin' (an ORG-level role), which let a
-- fleet's own admin edit the shared diagram. We restrict it to platform admins.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- vehicle_models — the preset library (no organization_id: presets are global)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicle_models (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,                 -- e.g. 'Toyota Yaris Cross'
  make           text,
  model          text,
  model_key      text NOT NULL UNIQUE,          -- slug, e.g. 'toyota-yaris-cross'
  side_image_url text,                           -- uploaded side-view image (NULL = vector fallback)
  top_image_url  text,                           -- uploaded top-view image  (NULL = vector fallback)
  is_published   boolean NOT NULL DEFAULT true,  -- hide drafts from fleet operators
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vehicle_models ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read presets (needed for the vehicle dropdown).
DROP POLICY IF EXISTS "Authenticated can view vehicle models" ON vehicle_models;
CREATE POLICY "Authenticated can view vehicle models"
  ON vehicle_models FOR SELECT
  TO authenticated
  USING (true);

-- Only platform admins can write (defense in depth — real writes go through the
-- service-role server action in lib/actions/vehicle-models.ts).
DROP POLICY IF EXISTS "Platform admins manage vehicle models" ON vehicle_models;
CREATE POLICY "Platform admins manage vehicle models"
  ON vehicle_models FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- vehicles.vehicle_model_id — the operator's chosen preset for a vehicle
-- -----------------------------------------------------------------------------
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS vehicle_model_id uuid REFERENCES vehicle_models(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_vehicle_model_id ON vehicles(vehicle_model_id);

-- -----------------------------------------------------------------------------
-- Lock zone editing to PLATFORM admins (was deprecated users.role='admin')
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage diagram zones" ON vehicle_diagram_zones;
DROP POLICY IF EXISTS "Platform admins can manage diagram zones" ON vehicle_diagram_zones;
CREATE POLICY "Platform admins can manage diagram zones"
  ON vehicle_diagram_zones FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- Public storage bucket for preset images (writes via service role, like branding)
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-models', 'vehicle-models', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- -----------------------------------------------------------------------------
-- Seed the existing Toyota Yaris Cross as a selectable preset.
-- Images are left NULL on purpose: the current zones in vehicle_diagram_zones
-- were traced against the built-in vector art (CarDiagram fallback), so a NULL
-- image makes the seeded preset render exactly as it does today. New presets
-- created in /admin will carry their own uploaded images + traced zones.
-- model_key matches what the damages page derives from make='Toyota'
-- model='Yaris Cross', so existing Yaris vehicles keep working.
-- -----------------------------------------------------------------------------
INSERT INTO vehicle_models (name, make, model, model_key, is_published)
VALUES ('Toyota Yaris Cross', 'Toyota', 'Yaris Cross', 'toyota-yaris-cross', true)
ON CONFLICT (model_key) DO NOTHING;

SELECT 'Vehicle model presets installed.' AS message;
