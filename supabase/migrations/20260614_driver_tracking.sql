-- =============================================================================
-- DRIVER LOCATION TRACKING
-- driver_positions  — one row per driver: latest known position (realtime map)
-- driver_locations  — append-only history trail (per shift / audit)
--
-- Written by drivers (web toggle today, mobile app later) directly via
-- supabase-js; RLS keeps everything org-scoped.
-- IDEMPOTENT: re-runnable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Latest position: one row per driver, upserted every few seconds while live.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_positions (
  driver_id UUID PRIMARY KEY REFERENCES public.drivers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.driver_shifts(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy NUMERIC(8, 2),   -- metres
  heading NUMERIC(6, 2),    -- degrees, 0 = north
  speed NUMERIC(8, 2),      -- m/s as reported by the device
  is_tracking BOOLEAN NOT NULL DEFAULT TRUE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_positions_org
  ON public.driver_positions(organization_id);

-- -----------------------------------------------------------------------------
-- History trail: sampled points (roughly one per minute while tracking).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.driver_shifts(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy NUMERIC(8, 2),
  heading NUMERIC(6, 2),
  speed NUMERIC(8, 2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_time
  ON public.driver_locations(driver_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_locations_org_time
  ON public.driver_locations(organization_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_locations_shift
  ON public.driver_locations(shift_id);

-- -----------------------------------------------------------------------------
-- Auto-stamp organization_id on insert (same trigger as other tenant tables).
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_org_id ON public.driver_positions;
CREATE TRIGGER set_org_id BEFORE INSERT ON public.driver_positions
  FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

DROP TRIGGER IF EXISTS set_org_id ON public.driver_locations;
CREATE TRIGGER set_org_id BEFORE INSERT ON public.driver_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

-- -----------------------------------------------------------------------------
-- RLS — drivers write their own row(s); admins/staff see the whole org.
-- -----------------------------------------------------------------------------
ALTER TABLE public.driver_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View positions in org" ON public.driver_positions;
CREATE POLICY "View positions in org"
  ON public.driver_positions FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_staff(organization_id)
    OR driver_id = public.driver_id_for_org(organization_id)
  );

DROP POLICY IF EXISTS "Drivers insert own position" ON public.driver_positions;
CREATE POLICY "Drivers insert own position"
  ON public.driver_positions FOR INSERT TO authenticated
  WITH CHECK (driver_id = public.driver_id_for_org(organization_id));

DROP POLICY IF EXISTS "Drivers update own position" ON public.driver_positions;
CREATE POLICY "Drivers update own position"
  ON public.driver_positions FOR UPDATE TO authenticated
  USING (driver_id = public.driver_id_for_org(organization_id))
  WITH CHECK (driver_id = public.driver_id_for_org(organization_id));

DROP POLICY IF EXISTS "Admins manage positions in org" ON public.driver_positions;
CREATE POLICY "Admins manage positions in org"
  ON public.driver_positions FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "View locations in org" ON public.driver_locations;
CREATE POLICY "View locations in org"
  ON public.driver_locations FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_staff(organization_id)
    OR driver_id = public.driver_id_for_org(organization_id)
  );

DROP POLICY IF EXISTS "Drivers insert own locations" ON public.driver_locations;
CREATE POLICY "Drivers insert own locations"
  ON public.driver_locations FOR INSERT TO authenticated
  WITH CHECK (driver_id = public.driver_id_for_org(organization_id));

DROP POLICY IF EXISTS "Admins manage locations in org" ON public.driver_locations;
CREATE POLICY "Admins manage locations in org"
  ON public.driver_locations FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- -----------------------------------------------------------------------------
-- Realtime: stream driver_positions changes to the fleet live map.
-- REPLICA IDENTITY FULL so UPDATE events carry the full row and the
-- organization_id filter works on every event type.
-- -----------------------------------------------------------------------------
ALTER TABLE public.driver_positions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'driver_positions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_positions;
  END IF;
END $$;

SELECT 'Driver tracking tables ready: driver_positions (realtime) + driver_locations (history).' AS message;
