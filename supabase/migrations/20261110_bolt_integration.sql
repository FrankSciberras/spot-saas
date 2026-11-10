-- =============================================================================
-- BOLT INTEGRATION — per-fleet connection to the Bolt Fleet API (v2)
-- =============================================================================
-- A fleet owner pastes the API key they created in the Bolt Fleet Portal
-- (Settings → Fleet API keys (v2)) into Rovora → Integrations → Bolt. From then
-- on Rovora pulls that fleet's Bolt drivers, vehicles and ride history on a
-- schedule and shows it at /fleet/bolt. This is entirely OPTIONAL: a fleet that
-- never connects has no rows in any of these tables.
--
--   * bolt_connections — one row per connected fleet: which Bolt company, the
--                        key (secret ENCRYPTED by the app before it is stored —
--                        see lib/crypto/secret-box.ts), and sync bookkeeping.
--   * bolt_drivers     — the fleet's drivers as Bolt sees them (status,
--                        suspensions, selected car) + an optional link to the
--                        matching Rovora driver.
--   * bolt_vehicles    — the fleet's vehicles as Bolt sees them + optional link
--                        to the matching Rovora vehicle.
--   * bolt_rides       — one row per ride OFFER (finished, rejected, cancelled…)
--                        with fare, tip, durations and distances. This is the
--                        raw material for acceptance rate, earnings and
--                        utilisation analysis.
--
-- SECURITY: all four tables are SERVICE-ROLE ONLY. RLS is on with no policies
-- and every grant is revoked, so no browser session can read or write them
-- directly. The app reads them in server code that has already checked the
-- caller is an ADMIN of the active fleet and filters by that organization_id.
-- Ride rows carry pickup/drop-off addresses, so this is deliberately strict.
--
-- IDEMPOTENT: re-runnable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. bolt_connections
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bolt_connections (
  organization_id      uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  -- The Bolt API key's public half. Shown (masked) in the UI so the operator
  -- can tell which key is in use.
  client_id            text NOT NULL,
  -- The key's secret, AES-256-GCM encrypted by the app. Never stored in clear.
  client_secret_enc    text NOT NULL,
  -- The Bolt company this fleet syncs. A key may reach several companies; the
  -- operator picks one when connecting.
  company_id           bigint NOT NULL,
  company_name         text,
  city_name            text,
  country_code         text,
  -- The fleet city's current offset from UTC in minutes (60 = UTC+1), read
  -- from the timestamps Bolt returns. Lets the dashboard know what "today"
  -- is for this fleet; refreshed on every sync so it follows summer time.
  utc_offset_minutes   integer NOT NULL DEFAULT 0,
  -- 'connected' = last sync worked; 'error' = Bolt refused the key (revoked,
  -- expired, company removed). The page shows last_error and a reconnect prompt.
  status               text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error')),
  last_error           text,
  last_synced_at       timestamptz,
  -- Ride history has been imported for [rides_synced_from, rides_synced_through].
  rides_synced_from    timestamptz,
  rides_synced_through timestamptz,
  connected_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bolt_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bolt_connections FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. bolt_drivers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bolt_drivers (
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  bolt_uuid             text NOT NULL,
  partner_uuid          text,
  first_name            text,
  last_name             text,
  display_name          text,
  email                 text,
  phone                 text,
  -- active | suspended | deactivated (Bolt's portal status).
  status                text,
  is_online             boolean NOT NULL DEFAULT false,
  added_to_fleet        timestamptz,
  deactivated_since     date,
  -- Bolt's current suspensions for this driver, e.g. an expired document:
  -- [{ category, type, document, start, end, message }, …]. Empty = none.
  suspensions           jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_vehicle_uuid text,
  selected_vehicle_reg  text,
  cash_rides_enabled    boolean,
  -- The matching Rovora driver, when there is one. 'auto' links are matched by
  -- email / phone / name on every sync; a 'manual' link is the operator's
  -- choice and is never overwritten by a sync.
  driver_id             uuid REFERENCES drivers(id) ON DELETE SET NULL,
  link_source           text CHECK (link_source IN ('auto', 'manual')),
  synced_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, bolt_uuid)
);

CREATE INDEX IF NOT EXISTS idx_bolt_drivers_driver ON bolt_drivers(driver_id) WHERE driver_id IS NOT NULL;

ALTER TABLE bolt_drivers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bolt_drivers FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. bolt_vehicles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bolt_vehicles (
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  bolt_uuid            text NOT NULL,
  registration_number  text,
  normalised_reg       text,
  vin                  text,
  make                 text,
  model                text,
  year                 integer,
  colour               text,
  seats                integer,
  status               text,
  added_to_fleet       timestamptz,
  deactivated_since    date,
  suspensions          jsonb NOT NULL DEFAULT '[]'::jsonb,
  branding_status      text,
  -- The matching Rovora vehicle (matched on registration number), if any.
  vehicle_id           uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  synced_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, bolt_uuid)
);

ALTER TABLE bolt_vehicles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bolt_vehicles FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. bolt_rides — one row per ride offer.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bolt_rides (
  organization_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_reference          text NOT NULL,
  -- finished | driver_rejected | driver_did_not_respond | rider_cancelled |
  -- rider_did_not_show | driver_cancelled_after_accept
  status                   text NOT NULL,
  ride_type                text,          -- regular | scheduled
  is_optional              boolean,
  category_name            text,          -- Bolt, Comfort, Pets, …
  payment_method           text,          -- in_app | cash | card_terminal | business
  created_by               text,          -- rider | fleet
  requested_at             timestamptz NOT NULL,
  -- The calendar day of the request IN THE FLEET'S OWN CITY (Bolt returns
  -- times with the city's offset), so "yesterday" means the fleet's yesterday.
  local_day                date NOT NULL,
  accepted_at              timestamptz,
  pickup_at                timestamptz,
  finished_at              timestamptz,
  driver_uuid              text,
  vehicle_uuid             text,
  vehicle_reg              text,
  currency                 text,
  price_total              numeric(12, 2),
  tip                      numeric(12, 2),
  booking_fee              numeric(12, 2),
  toll_fee                 numeric(12, 2),
  cancellation_fee         numeric(12, 2),
  ride_duration_seconds    integer,
  pickup_duration_seconds  integer,
  -- Pickup → drop-off distance, and the total including the drive to the pickup.
  trip_distance_km         numeric(10, 2),
  total_distance_km        numeric(10, 2),
  rating                   numeric(3, 1),
  driver_cancelled_reason  text,
  rider_cancelled_reason   text,
  pickup_address           text,
  pickup_lat               double precision,
  pickup_lng               double precision,
  dropoff_address          text,
  dropoff_lat              double precision,
  dropoff_lng              double precision,
  synced_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, order_reference)
);

-- The dashboard's hot path: "this fleet's rides between two days".
CREATE INDEX IF NOT EXISTS idx_bolt_rides_org_day ON bolt_rides(organization_id, local_day);
CREATE INDEX IF NOT EXISTS idx_bolt_rides_org_driver_day ON bolt_rides(organization_id, driver_uuid, local_day);

ALTER TABLE bolt_rides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bolt_rides FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. updated_at trigger for bolt_connections (reuses the existing helper).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS trg_bolt_connections_updated_at ON bolt_connections;
    CREATE TRIGGER trg_bolt_connections_updated_at
      BEFORE UPDATE ON bolt_connections
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
