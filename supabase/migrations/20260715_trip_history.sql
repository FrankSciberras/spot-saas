-- =============================================================================
-- TRIP HISTORY — the raw GPS trail summarised into trips and stops
--
-- driver_trip_segments — one row per trip (driving) or stop (waiting), built
-- by /api/cron/trips from driver_locations. The cron rebuilds a rolling 48h
-- window every hour, so rows inside that window are disposable; older rows are
-- the permanent record (tiny compared to the raw trail).
--
-- The same cron also enforces retention: raw driver_locations points older
-- than 90 days are deleted — trip segments are what's kept long-term.
-- IDEMPOTENT: re-runnable.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.driver_trip_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.driver_shifts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('trip', 'stop')),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  start_lat DOUBLE PRECISION NOT NULL,
  start_lng DOUBLE PRECISION NOT NULL,
  end_lat DOUBLE PRECISION NOT NULL,
  end_lng DOUBLE PRECISION NOT NULL,
  distance_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  max_speed_kmh INTEGER,
  point_count INTEGER NOT NULL DEFAULT 0,
  -- Segment still running when the cron last looked (driver still moving/stopped).
  is_open BOOLEAN NOT NULL DEFAULT FALSE,
  -- Zone name when a stop happened inside one of the fleet's geofences.
  place_hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_segments_org_time
  ON public.driver_trip_segments(organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_segments_driver_time
  ON public.driver_trip_segments(driver_id, started_at DESC);

-- Retention deletes scan by time alone — give the raw trail a plain time index.
CREATE INDEX IF NOT EXISTS idx_driver_locations_time
  ON public.driver_locations(recorded_at);

-- -----------------------------------------------------------------------------
-- RLS — read-only for the fleet (and each driver's own rows).
-- Rows are written exclusively by the cron via the service role (bypasses RLS).
-- -----------------------------------------------------------------------------
ALTER TABLE public.driver_trip_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View trip segments in org" ON public.driver_trip_segments;
CREATE POLICY "View trip segments in org"
  ON public.driver_trip_segments FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_staff(organization_id)
    OR driver_id = public.driver_id_for_org(organization_id)
  );

DROP POLICY IF EXISTS "Admins manage trip segments" ON public.driver_trip_segments;
CREATE POLICY "Admins manage trip segments"
  ON public.driver_trip_segments FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

SELECT 'Trip history ready: driver_trip_segments + retention index.' AS message;
