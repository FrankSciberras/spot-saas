-- =============================================================================
-- TRACKING RECOVERY — keeping on-shift drivers on the Live Map
-- =============================================================================
-- 1. 'resumed' tracking events (+ a detail line): the watcher logs "signal back
--    after 37 min" when a lost driver's phone starts sending again, so the
--    Activity feed tells the whole story, not just "lost".
-- 2. organizations.require_location_for_shift: fleet rule — drivers can only go
--    online from the Rovora Driver app with location working.
-- 3. driver_nudges: every "please open the app" alert sent to a driver, by a
--    person (sent_by) or automatically by the watcher (sent_by NULL). Feeds the
--    Activity feed and rate-limits nudges.
-- 4. driver_app_status.auto_restarted_at: the app restarted sharing on its own
--    after the phone had stopped it (app 1.0.3+).
-- Safe to re-run.
-- =============================================================================

-- 1. Tracking events --------------------------------------------------------
ALTER TABLE public.driver_tracking_events
  DROP CONSTRAINT IF EXISTS driver_tracking_events_event_check;
ALTER TABLE public.driver_tracking_events
  ADD CONSTRAINT driver_tracking_events_event_check
  CHECK (event IN ('started', 'stopped', 'lost', 'resumed'));

ALTER TABLE public.driver_tracking_events
  ADD COLUMN IF NOT EXISTS detail TEXT;

-- 2. Fleet rule -------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS require_location_for_shift BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.organizations.require_location_for_shift IS
  'When TRUE, drivers can only start a shift from the Rovora Driver app with location access working.';

-- 3. Nudges -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_nudges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id       UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  sent_by         UUID REFERENCES public.users(id) ON DELETE SET NULL, -- NULL = automatic
  reason          TEXT,
  channels        TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_nudges_org_time
  ON public.driver_nudges (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_nudges_driver_time
  ON public.driver_nudges (driver_id, created_at DESC);

ALTER TABLE public.driver_nudges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fleet staff see their nudges" ON public.driver_nudges;
CREATE POLICY "Fleet staff see their nudges"
  ON public.driver_nudges FOR SELECT TO authenticated
  USING (public.is_org_admin_or_staff(organization_id));

-- 4. App status (only if 20261005_driver_app_status has been run) -----------
DO $$
BEGIN
  IF to_regclass('public.driver_app_status') IS NOT NULL THEN
    ALTER TABLE public.driver_app_status ADD COLUMN IF NOT EXISTS auto_restarted_at TIMESTAMPTZ;
  END IF;
END $$;

SELECT 'Tracking recovery installed.' AS message;
