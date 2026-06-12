-- =============================================================================
-- TRACKING INTELLIGENCE
--  1. Speeding alerts  — per-fleet speed limit; trigger logs + notifies
--  2. Connection-lost  — 'lost' event type (detected by /api/cron/tracking-watch)
--  3. Distance         — driver_distances() RPC sums the GPS trail
-- IDEMPOTENT: re-runnable.
-- =============================================================================

-- Per-fleet speed limit (km/h). NULL = speeding alerts disabled.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS speed_limit_kmh INTEGER
  CHECK (speed_limit_kmh IS NULL OR speed_limit_kmh BETWEEN 10 AND 250);

-- -----------------------------------------------------------------------------
-- Speeding events
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.speeding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  speed_kmh INTEGER NOT NULL,
  limit_kmh INTEGER NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_speeding_events_org_time
  ON public.speeding_events(organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_speeding_events_driver_time
  ON public.speeding_events(driver_id, occurred_at DESC);

ALTER TABLE public.speeding_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View speeding events in org" ON public.speeding_events;
CREATE POLICY "View speeding events in org"
  ON public.speeding_events FOR SELECT TO authenticated
  USING (public.is_org_admin_or_staff(organization_id));

DROP POLICY IF EXISTS "Admins manage speeding events" ON public.speeding_events;
CREATE POLICY "Admins manage speeding events"
  ON public.speeding_events FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

-- -----------------------------------------------------------------------------
-- Allow 'lost' in the tracking on/off log (written by the connection watcher).
-- -----------------------------------------------------------------------------
ALTER TABLE public.driver_tracking_events
  DROP CONSTRAINT IF EXISTS driver_tracking_events_event_check;
ALTER TABLE public.driver_tracking_events
  ADD CONSTRAINT driver_tracking_events_event_check
  CHECK (event IN ('started', 'stopped', 'lost'));

-- -----------------------------------------------------------------------------
-- Trigger v2: tracking log + zones (as before) + speeding detection.
-- Speeding dedup: at most one alert per driver per 10 minutes.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_driver_position()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g RECORD;
  v_last_event TEXT;
  v_dist DOUBLE PRECISION;
  v_driver_name TEXT;
  v_limit INTEGER;
  v_speed_kmh INTEGER;
BEGIN
  -- 1. Tracking on/off log
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_tracking THEN
      INSERT INTO driver_tracking_events (organization_id, driver_id, shift_id, event)
      VALUES (NEW.organization_id, NEW.driver_id, NEW.shift_id, 'started');
    END IF;
  ELSIF NEW.is_tracking IS DISTINCT FROM OLD.is_tracking THEN
    INSERT INTO driver_tracking_events (organization_id, driver_id, shift_id, event)
    VALUES (
      NEW.organization_id, NEW.driver_id, NEW.shift_id,
      CASE WHEN NEW.is_tracking THEN 'started' ELSE 'stopped' END
    );
  END IF;

  IF NEW.is_tracking THEN
    -- 2. Zone detection
    FOR g IN
      SELECT * FROM geofences
      WHERE organization_id = NEW.organization_id AND active
    LOOP
      v_dist := haversine_m(NEW.latitude, NEW.longitude, g.latitude, g.longitude);

      SELECT event INTO v_last_event
      FROM geofence_events
      WHERE driver_id = NEW.driver_id AND geofence_id = g.id
      ORDER BY occurred_at DESC
      LIMIT 1;

      IF v_dist <= g.radius_m AND (v_last_event IS NULL OR v_last_event = 'exit') THEN
        INSERT INTO geofence_events (organization_id, geofence_id, driver_id, event, latitude, longitude)
        VALUES (NEW.organization_id, g.id, NEW.driver_id, 'enter', NEW.latitude, NEW.longitude);

        IF g.notify_on IN ('enter', 'both') THEN
          SELECT full_name INTO v_driver_name FROM drivers WHERE id = NEW.driver_id;
          INSERT INTO notifications (organization_id, driver_id, title, body, type, action_url, target_role)
          VALUES (
            NEW.organization_id, NULL,
            'Zone alert: ' || g.name,
            COALESCE(v_driver_name, 'A driver') || ' entered "' || g.name || '"',
            'warning', '/fleet/tracking', 'admin'
          );
        END IF;

      ELSIF v_dist > g.radius_m + GREATEST(g.radius_m * 0.10, 30) AND v_last_event = 'enter' THEN
        INSERT INTO geofence_events (organization_id, geofence_id, driver_id, event, latitude, longitude)
        VALUES (NEW.organization_id, g.id, NEW.driver_id, 'exit', NEW.latitude, NEW.longitude);

        IF g.notify_on IN ('exit', 'both') THEN
          SELECT full_name INTO v_driver_name FROM drivers WHERE id = NEW.driver_id;
          INSERT INTO notifications (organization_id, driver_id, title, body, type, action_url, target_role)
          VALUES (
            NEW.organization_id, NULL,
            'Zone alert: ' || g.name,
            COALESCE(v_driver_name, 'A driver') || ' left "' || g.name || '"',
            'warning', '/fleet/tracking', 'admin'
          );
        END IF;
      END IF;
    END LOOP;

    -- 3. Speeding detection (one alert per driver per 10 minutes max)
    IF NEW.speed IS NOT NULL THEN
      SELECT speed_limit_kmh INTO v_limit
      FROM organizations WHERE id = NEW.organization_id;

      v_speed_kmh := ROUND(NEW.speed * 3.6);
      IF v_limit IS NOT NULL AND v_speed_kmh > v_limit THEN
        IF NOT EXISTS (
          SELECT 1 FROM speeding_events
          WHERE driver_id = NEW.driver_id
            AND occurred_at > NOW() - INTERVAL '10 minutes'
        ) THEN
          INSERT INTO speeding_events (organization_id, driver_id, speed_kmh, limit_kmh, latitude, longitude)
          VALUES (NEW.organization_id, NEW.driver_id, v_speed_kmh, v_limit, NEW.latitude, NEW.longitude);

          SELECT full_name INTO v_driver_name FROM drivers WHERE id = NEW.driver_id;
          INSERT INTO notifications (organization_id, driver_id, title, body, type, action_url, target_role)
          VALUES (
            NEW.organization_id, NULL,
            'Speeding alert',
            COALESCE(v_driver_name, 'A driver') || ' was doing ' || v_speed_kmh || ' km/h (limit ' || v_limit || ')',
            'warning', '/fleet/tracking', 'admin'
          );
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Distance per driver since a given time (metres), summed along the GPS trail.
-- Jumps over gaps > 5 minutes or > 2 km between points are skipped so parking
-- the phone overnight doesn't add phantom kilometres.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.driver_distances(p_since TIMESTAMPTZ)
RETURNS TABLE (driver_id UUID, distance_m DOUBLE PRECISION)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public AS $$
  WITH pts AS (
    SELECT
      dl.driver_id,
      dl.recorded_at,
      dl.latitude,
      dl.longitude,
      LAG(dl.latitude)  OVER w AS prev_lat,
      LAG(dl.longitude) OVER w AS prev_lng,
      LAG(dl.recorded_at) OVER w AS prev_at
    FROM driver_locations dl
    WHERE dl.recorded_at >= p_since
    WINDOW w AS (PARTITION BY dl.driver_id ORDER BY dl.recorded_at)
  ),
  segs AS (
    SELECT
      driver_id,
      haversine_m(prev_lat, prev_lng, latitude, longitude) AS seg_m
    FROM pts
    WHERE prev_lat IS NOT NULL
      AND recorded_at - prev_at <= INTERVAL '5 minutes'
      AND haversine_m(prev_lat, prev_lng, latitude, longitude) <= 2000
  )
  SELECT driver_id, COALESCE(SUM(seg_m), 0)::DOUBLE PRECISION
  FROM segs
  GROUP BY driver_id;
$$;

GRANT EXECUTE ON FUNCTION public.driver_distances(TIMESTAMPTZ) TO authenticated;

-- -----------------------------------------------------------------------------
-- Route trail for one driver (for playback on the fleet map). RLS applies.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.driver_route(p_driver UUID, p_since TIMESTAMPTZ)
RETURNS TABLE (latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, speed NUMERIC, recorded_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public AS $$
  SELECT latitude, longitude, speed, recorded_at
  FROM driver_locations
  WHERE driver_id = p_driver AND recorded_at >= p_since
  ORDER BY recorded_at
  LIMIT 3000;
$$;

GRANT EXECUTE ON FUNCTION public.driver_route(UUID, TIMESTAMPTZ) TO authenticated;

SELECT 'Tracking intelligence ready: speeding alerts, lost-connection events, distances, routes.' AS message;
