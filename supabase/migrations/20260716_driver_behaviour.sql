-- =============================================================================
-- DRIVER BEHAVIOUR — harsh braking / rapid acceleration events
--
-- driver_behavior_events — written by the driver app when its motion sensor
-- detects a sustained harsh manoeuvre (detection happens ON the phone; only
-- tiny event rows are uploaded, never raw sensor data).
--   kind: harsh_brake | harsh_accel | harsh_motion (couldn't tell which —
--         no usable GPS speed around the event).
--   magnitude: peak acceleration of the burst in m/s².
--
-- Together with speeding_events and driver_distances() this feeds the
-- /fleet/safety scores and the weekly safety report cron.
-- IDEMPOTENT: re-runnable.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.driver_behavior_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.driver_shifts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('harsh_brake', 'harsh_accel', 'harsh_motion')),
  magnitude NUMERIC(6, 2),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_behavior_events_org_time
  ON public.driver_behavior_events(organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_behavior_events_driver_time
  ON public.driver_behavior_events(driver_id, occurred_at DESC);

-- Auto-stamp organization_id on insert (same trigger as other tenant tables).
DROP TRIGGER IF EXISTS set_org_id ON public.driver_behavior_events;
CREATE TRIGGER set_org_id BEFORE INSERT ON public.driver_behavior_events
  FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

-- -----------------------------------------------------------------------------
-- RLS — drivers write their own events; the fleet reads them.
-- -----------------------------------------------------------------------------
ALTER TABLE public.driver_behavior_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View behavior events in org" ON public.driver_behavior_events;
CREATE POLICY "View behavior events in org"
  ON public.driver_behavior_events FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_staff(organization_id)
    OR driver_id = public.driver_id_for_org(organization_id)
  );

DROP POLICY IF EXISTS "Drivers insert own behavior events" ON public.driver_behavior_events;
CREATE POLICY "Drivers insert own behavior events"
  ON public.driver_behavior_events FOR INSERT TO authenticated
  WITH CHECK (driver_id = public.driver_id_for_org(organization_id));

DROP POLICY IF EXISTS "Admins manage behavior events" ON public.driver_behavior_events;
CREATE POLICY "Admins manage behavior events"
  ON public.driver_behavior_events FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

SELECT 'Driver behaviour ready: driver_behavior_events (harsh braking/acceleration).' AS message;
