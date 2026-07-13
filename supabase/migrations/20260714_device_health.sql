-- =============================================================================
-- DEVICE HEALTH — battery + GPS/permission status per driver, with alerts
--
--  1. driver_positions gains battery + device-status columns, reported by the
--     driver app alongside each position (web fallback sends battery only).
--  2. device_health_events — log of low-battery / GPS-off / permission-lost.
--  3. Trigger v3: everything v2 did (tracking log, zones, speeding) + device
--     health detection. Alerts are edge-triggered (fire on the transition, not
--     on every update) so a phone sitting at 15% doesn't spam admins.
--
-- Run AFTER 20260616_tracking_intelligence (this replaces its trigger function
-- and keeps all of its behaviour).
-- IDEMPOTENT: re-runnable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Device status columns on the latest-position row.
-- location_permission: 'full' = background allowed, 'foreground_only' = only
-- while app is open, 'denied' = no access. NULL = not reported (old app / web).
-- -----------------------------------------------------------------------------
ALTER TABLE public.driver_positions
  ADD COLUMN IF NOT EXISTS battery_pct INTEGER
  CHECK (battery_pct IS NULL OR battery_pct BETWEEN 0 AND 100);

ALTER TABLE public.driver_positions
  ADD COLUMN IF NOT EXISTS battery_charging BOOLEAN;

ALTER TABLE public.driver_positions
  ADD COLUMN IF NOT EXISTS gps_enabled BOOLEAN;

ALTER TABLE public.driver_positions
  ADD COLUMN IF NOT EXISTS location_permission TEXT
  CHECK (location_permission IS NULL OR location_permission IN ('full', 'foreground_only', 'denied'));

-- -----------------------------------------------------------------------------
-- Device health event log (written only by the trigger, SECURITY DEFINER).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_health_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('low_battery', 'battery_critical', 'gps_off', 'permission_lost')),
  detail TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_health_org_time
  ON public.device_health_events(organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_health_driver_time
  ON public.device_health_events(driver_id, occurred_at DESC);

ALTER TABLE public.device_health_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View device health events in org" ON public.device_health_events;
CREATE POLICY "View device health events in org"
  ON public.device_health_events FOR SELECT TO authenticated
  USING (public.is_org_admin_or_staff(organization_id));

DROP POLICY IF EXISTS "Admins manage device health events" ON public.device_health_events;
CREATE POLICY "Admins manage device health events"
  ON public.device_health_events FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

-- -----------------------------------------------------------------------------
-- Trigger v3: tracking log + zones + speeding (as before) + device health.
--  * Battery: alert when it CROSSES below 20% (low) or 10% (critical) while
--    not charging; at most one battery alert per driver per hour.
--  * GPS off / permission lost: alert on the transition only.
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
  v_old_pct INTEGER;
  v_battery_event TEXT;
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

    -- 4. Device health
    -- Battery: edge-triggered on crossing 20% / 10% while not charging.
    v_old_pct := CASE WHEN TG_OP = 'UPDATE' THEN OLD.battery_pct ELSE NULL END;
    v_battery_event := NULL;
    IF NEW.battery_pct IS NOT NULL AND COALESCE(NEW.battery_charging, FALSE) = FALSE THEN
      IF NEW.battery_pct <= 10 AND (v_old_pct IS NULL OR v_old_pct > 10) THEN
        v_battery_event := 'battery_critical';
      ELSIF NEW.battery_pct <= 20 AND (v_old_pct IS NULL OR v_old_pct > 20) THEN
        v_battery_event := 'low_battery';
      END IF;
    END IF;

    IF v_battery_event IS NOT NULL THEN
      -- Battery jitters around thresholds: at most one battery alert per hour.
      IF NOT EXISTS (
        SELECT 1 FROM device_health_events
        WHERE driver_id = NEW.driver_id
          AND event IN ('low_battery', 'battery_critical')
          AND occurred_at > NOW() - INTERVAL '60 minutes'
      ) THEN
        INSERT INTO device_health_events (organization_id, driver_id, event, detail)
        VALUES (NEW.organization_id, NEW.driver_id, v_battery_event, NEW.battery_pct || '%');

        SELECT full_name INTO v_driver_name FROM drivers WHERE id = NEW.driver_id;
        INSERT INTO notifications (organization_id, driver_id, title, body, type, action_url, target_role)
        VALUES (
          NEW.organization_id, NULL,
          CASE WHEN v_battery_event = 'battery_critical' THEN 'Phone battery critical' ELSE 'Phone battery low' END,
          COALESCE(v_driver_name, 'A driver') || '''s phone battery is at ' || NEW.battery_pct
            || '% — tracking may stop soon.',
          'warning', '/fleet/tracking', 'admin'
        );
      END IF;
    END IF;

    -- GPS (location services) switched off — fires on the transition only.
    IF NEW.gps_enabled IS FALSE
       AND (TG_OP = 'INSERT' OR OLD.gps_enabled IS DISTINCT FROM NEW.gps_enabled) THEN
      INSERT INTO device_health_events (organization_id, driver_id, event)
      VALUES (NEW.organization_id, NEW.driver_id, 'gps_off');

      SELECT full_name INTO v_driver_name FROM drivers WHERE id = NEW.driver_id;
      INSERT INTO notifications (organization_id, driver_id, title, body, type, action_url, target_role)
      VALUES (
        NEW.organization_id, NULL,
        'Driver GPS turned off',
        COALESCE(v_driver_name, 'A driver') || ' has location services switched off — live tracking is paused.',
        'warning', '/fleet/tracking', 'admin'
      );
    END IF;

    -- Location permission removed or downgraded — fires on the transition only.
    IF NEW.location_permission IN ('foreground_only', 'denied')
       AND (TG_OP = 'INSERT' OR OLD.location_permission IS DISTINCT FROM NEW.location_permission) THEN
      INSERT INTO device_health_events (organization_id, driver_id, event, detail)
      VALUES (NEW.organization_id, NEW.driver_id, 'permission_lost', NEW.location_permission);

      SELECT full_name INTO v_driver_name FROM drivers WHERE id = NEW.driver_id;
      INSERT INTO notifications (organization_id, driver_id, title, body, type, action_url, target_role)
      VALUES (
        NEW.organization_id, NULL,
        'Tracking permission removed',
        COALESCE(v_driver_name, 'A driver')
          || CASE WHEN NEW.location_permission = 'denied'
               THEN ' removed location access for the driver app — tracking has stopped.'
               ELSE ' limited location to "while using the app" — background tracking will stop.' END,
        'warning', '/fleet/tracking', 'admin'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

SELECT 'Device health ready: battery/GPS/permission columns, events + alerts.' AS message;
