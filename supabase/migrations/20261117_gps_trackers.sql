-- =============================================================================
-- GPS TRACKERS — connect a fleet's GPS / telematics account to Rovora
-- =============================================================================
-- A fleet that already runs hardware trackers (Teltonika, Ruptela, OBD
-- plug-ins…) on a GPS platform (Traccar, flespi, Wialon, Navixy, Samsara,
-- Geotab, Mapon…) pastes that platform's API key into Rovora → GPS trackers.
-- From then on Rovora reads the LATEST position of every tracker about once a
-- minute, links each tracker to one of the fleet's vehicles, and the Live Map
-- can show vehicles (from the trackers) next to — or instead of — drivers
-- (from the driver app).
--
-- Entirely OPTIONAL: a fleet that never connects has no rows here, and the
-- Live Map simply shows driver phones as before.
--
--   * gps_connections      — one row per connected GPS account. The secret part
--                            of the credentials is ENCRYPTED by the app before
--                            it is stored (lib/crypto/secret-box.ts).
--                            SERVICE-ROLE ONLY: no browser session can read it.
--   * gps_devices          — one row per tracker: latest position, speed,
--                            ignition, odometer + which Rovora vehicle it's in.
--                            Admins/staff of the fleet can READ it (the Live
--                            Map streams it via Realtime); only the server writes.
--   * gps_device_locations — sampled history trail per tracker (route playback,
--                            km per day). Same access rules as gps_devices.
--
-- IDEMPOTENT: re-runnable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. gps_connections (service-role only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gps_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Which GPS platform: 'traccar' | 'flespi' | 'wialon' | 'navixy' | 'samsara'
  -- | 'geotab' | 'mapon' … (see lib/gps/providers). Not a CHECK so adding a
  -- provider never needs a migration.
  provider         text NOT NULL,
  -- Server / region for platforms that have more than one (self-hosted
  -- Traccar, Wialon Local, Navixy EU vs US, Samsara EU…). NULL = default.
  server_url       text,
  -- Something the operator recognises the account by, e.g. "fleet@acme.mt"
  -- or "key …f3a9". Never a secret.
  account_label    text,
  -- AES-256-GCM sealed JSON of the credentials (token / password / key).
  credentials_enc  text NOT NULL,
  -- 'connected' = last sync worked; 'error' = the platform refused the
  -- credentials (revoked key, changed password). The page shows last_error.
  status           text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error')),
  last_error       text,
  last_synced_at   timestamptz,
  device_count     integer NOT NULL DEFAULT 0,
  connected_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gps_connections_org ON public.gps_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_gps_connections_synced ON public.gps_connections(last_synced_at NULLS FIRST);

ALTER TABLE public.gps_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gps_connections FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. gps_devices (read: fleet admins/staff · write: server only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gps_devices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id    uuid NOT NULL REFERENCES public.gps_connections(id) ON DELETE CASCADE,
  provider         text NOT NULL,
  -- The tracker's id on the GPS platform.
  external_id      text NOT NULL,
  name             text,
  -- IMEI / serial number, when the platform shares it.
  unique_id        text,
  -- Number plate as the GPS platform knows it (used for auto-linking).
  plate            text,
  -- The Rovora vehicle this tracker is fitted in. 'auto' links are matched by
  -- plate / name on every sync; a 'manual' link is the operator's choice and is
  -- never overwritten. One tracker per vehicle (index below).
  vehicle_id       uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  link_source      text CHECK (link_source IN ('auto', 'manual')),
  -- Latest known position (NULL until the tracker has reported once).
  latitude         double precision,
  longitude        double precision,
  speed_kmh        real,
  heading          real,
  ignition         boolean,
  odometer_km      double precision,
  recorded_at      timestamptz,
  synced_at        timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_gps_devices_org ON public.gps_devices(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gps_devices_vehicle
  ON public.gps_devices(vehicle_id) WHERE vehicle_id IS NOT NULL;

ALTER TABLE public.gps_devices ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.gps_devices FROM anon, authenticated;
REVOKE ALL ON public.gps_devices FROM anon;
GRANT SELECT ON public.gps_devices TO authenticated;

DROP POLICY IF EXISTS "View GPS devices in org" ON public.gps_devices;
CREATE POLICY "View GPS devices in org"
  ON public.gps_devices FOR SELECT TO authenticated
  USING (public.is_org_admin_or_staff(organization_id));

-- -----------------------------------------------------------------------------
-- 3. gps_device_locations — history trail (one point per sync when it moved)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gps_device_locations (
  id               bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  device_id        uuid NOT NULL REFERENCES public.gps_devices(id) ON DELETE CASCADE,
  vehicle_id       uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  latitude         double precision NOT NULL,
  longitude        double precision NOT NULL,
  speed_kmh        real,
  heading          real,
  ignition         boolean,
  recorded_at      timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gps_device_locations_device_time
  ON public.gps_device_locations(device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_gps_device_locations_org_time
  ON public.gps_device_locations(organization_id, recorded_at DESC);

ALTER TABLE public.gps_device_locations ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.gps_device_locations FROM anon, authenticated;
REVOKE ALL ON public.gps_device_locations FROM anon;
GRANT SELECT ON public.gps_device_locations TO authenticated;

DROP POLICY IF EXISTS "View GPS history in org" ON public.gps_device_locations;
CREATE POLICY "View GPS history in org"
  ON public.gps_device_locations FOR SELECT TO authenticated
  USING (public.is_org_admin_or_staff(organization_id));

-- -----------------------------------------------------------------------------
-- 4. Realtime: stream tracker moves to the Live Map.
-- -----------------------------------------------------------------------------
ALTER TABLE public.gps_devices REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'gps_devices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gps_devices;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Rovora GPS (Rovora's own Traccar server): a tracker belongs to ONE fleet.
--    unique_id is the tracker's IMEI. Trackers from a fleet's own GPS company
--    are not affected (two fleets may both see the same Wialon unit).
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_gps_devices_rovora_imei
  ON public.gps_devices(unique_id) WHERE provider = 'rovora';

-- -----------------------------------------------------------------------------
-- 6. Privacy: hardware trackers report 24/7, but EU guidance (WP29 Opinion
--    2/2017 §5.7) says tracking drivers outside working time is rarely lawful.
--    ON (default) = a car only shows on the Live Map, and its route is only
--    kept, while a driver is on shift in it. Admins can switch it off in
--    GPS trackers → Privacy.
-- -----------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS gps_hide_off_shift boolean NOT NULL DEFAULT true;

SELECT 'GPS tracker tables ready: gps_connections (server only), gps_devices (realtime), gps_device_locations.' AS message;
