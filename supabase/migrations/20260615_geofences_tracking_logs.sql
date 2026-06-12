-- =============================================================================
-- GEOFENCE ZONES + TRACKING ACTIVITY LOGS
--
-- geofences              — circular zones drawn by fleet operators on the map
-- geofence_events        — enter/exit log per driver per zone
-- driver_tracking_events — when each driver started/stopped sharing location
--
-- Detection runs inside the database via a trigger on driver_positions, so it
-- works identically for the native app and the web fallback, and can't be
-- bypassed by the client. Zone alerts are delivered through the existing
-- notifications table (target_role='admin').
-- IDEMPOTENT: re-runnable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Zones
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_m INTEGER NOT NULL CHECK (radius_m BETWEEN 50 AND 50000),
  notify_on TEXT NOT NULL DEFAULT 'enter' CHECK (notify_on IN ('enter', 'exit', 'both')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geofences_org ON public.geofences(organization_id);

-- -----------------------------------------------------------------------------
-- Zone enter/exit events
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.geofence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  geofence_id UUID NOT NULL REFERENCES public.geofences(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('enter', 'exit')),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geofence_events_state
  ON public.geofence_events(driver_id, geofence_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_geofence_events_org_time
  ON public.geofence_events(organization_id, occurred_at DESC);

-- -----------------------------------------------------------------------------
-- Tracking on/off log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.driver_shifts(id) ON DELETE SET NULL,
  event TEXT NOT NULL CHECK (event IN ('started', 'stopped')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_org_time
  ON public.driver_tracking_events(organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_events_driver_time
  ON public.driver_tracking_events(driver_id, occurred_at DESC);

-- -----------------------------------------------------------------------------
-- RLS — operators view/manage; events are written only by the trigger
-- (SECURITY DEFINER), never directly by clients.
-- -----------------------------------------------------------------------------
ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geofence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_tracking_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View geofences in org" ON public.geofences;
CREATE POLICY "View geofences in org"
  ON public.geofences FOR SELECT TO authenticated
  USING (public.is_org_admin_or_staff(organization_id));

DROP POLICY IF EXISTS "Admins manage geofences" ON public.geofences;
CREATE POLICY "Admins manage geofences"
  ON public.geofences FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "View geofence events in org" ON public.geofence_events;
CREATE POLICY "View geofence events in org"
  ON public.geofence_events FOR SELECT TO authenticated
  USING (public.is_org_admin_or_staff(organization_id));

DROP POLICY IF EXISTS "Admins manage geofence events" ON public.geofence_events;
CREATE POLICY "Admins manage geofence events"
  ON public.geofence_events FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "View tracking events in org" ON public.driver_tracking_events;
CREATE POLICY "View tracking events in org"
  ON public.driver_tracking_events FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_staff(organization_id)
    OR driver_id = public.driver_id_for_org(organization_id)
  );

DROP POLICY IF EXISTS "Admins manage tracking events" ON public.driver_tracking_events;
CREATE POLICY "Admins manage tracking events"
  ON public.driver_tracking_events FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

-- -----------------------------------------------------------------------------
-- Distance helper (metres between two lat/lng points)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.haversine_m(
  lat1 DOUBLE PRECISION, lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION, lon2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE AS $$
  SELECT 6371000 * 2 * asin(least(1, sqrt(
    pow(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * pow(sin(radians(lon2 - lon1) / 2), 2)
  )));
$$;

-- -----------------------------------------------------------------------------
-- The watcher: runs on every position update.
--  1. Logs started/stopped transitions of is_tracking.
--  2. Detects zone enter/exit. State comes from the last recorded event per
--     (driver, zone), so GPS gaps don't cause duplicates; exit uses a 10%
--     hysteresis margin so boundary jitter doesn't flap.
--  3. Inserts an admin notification per alert (existing notifications table).
-- SECURITY DEFINER: drivers' own RLS doesn't allow writing event tables.
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

  -- 2. Zone detection (only while actively tracking)
  IF NEW.is_tracking THEN
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

      -- Exit needs 10% (min 30m) beyond the radius — hysteresis against jitter.
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS process_position ON public.driver_positions;
CREATE TRIGGER process_position
  AFTER INSERT OR UPDATE ON public.driver_positions
  FOR EACH ROW EXECUTE FUNCTION public.process_driver_position();

-- -----------------------------------------------------------------------------
-- Max speed per driver since a given time (RLS of the caller applies).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.driver_max_speeds(p_since TIMESTAMPTZ)
RETURNS TABLE (driver_id UUID, max_speed DOUBLE PRECISION)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public AS $$
  SELECT driver_id, MAX(speed)::DOUBLE PRECISION AS max_speed
  FROM driver_locations
  WHERE recorded_at >= p_since AND speed IS NOT NULL
  GROUP BY driver_id;
$$;

GRANT EXECUTE ON FUNCTION public.driver_max_speeds(TIMESTAMPTZ) TO authenticated;

SELECT 'Geofence zones + tracking activity logs ready.' AS message;
