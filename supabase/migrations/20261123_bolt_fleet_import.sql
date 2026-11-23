-- =============================================================================
-- BOLT FLEET IMPORT — bring a fleet's Bolt drivers & cars into Rovora
-- =============================================================================
-- Until now connecting Bolt only LINKED Bolt drivers / cars to Rovora records
-- that already existed. A new fleet had to type every driver and car in by
-- hand first, which is where many sign-ups stopped. Now, right after the key
-- is accepted, the admin sees everyone on Bolt and can add the whole fleet in
-- one go (or tick who to add). Later arrivals on Bolt are handled by the
-- fleet's choice: ask first (default), add automatically, or do nothing.
--
--   bolt_drivers / bolt_vehicles
--     * link_source  'import' = the Rovora record was CREATED from this Bolt
--                    record. Kept by every sync (like 'manual'), so renaming
--                    the driver or re-plating the car in Rovora never breaks
--                    the link — and a record deleted after import is not
--                    re-created.
--     * import_state 'pending' = new on Bolt since the first import, waiting
--                    for the admin (ask-first mode); 'ignored' = the admin
--                    chose not to add it. NULL = nothing decided.
--     * import_batch / imported_at — which import created the Rovora record,
--                    so that import can be undone.
--
--   bolt_connections
--     * new_member_mode    'review' (default) | 'auto' | 'off' — what happens
--                          when someone new joins the Bolt fleet.
--     * first_import_at    when the admin went through the first import. NULL
--                          = still to do, so the Bolt page leads with it.
--
--   organizations
--     * ride_platforms     which ride-hailing apps the fleet works with, from
--                          the one-tap question on the set-up screen
--                          ('bolt', 'uber', 'other'). NULL = not answered.
--
-- The bolt_* tables stay SERVICE-ROLE ONLY (see 20261110_bolt_integration.sql).
--
-- IDEMPOTENT: re-runnable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. bolt_drivers
-- -----------------------------------------------------------------------------
ALTER TABLE bolt_drivers DROP CONSTRAINT IF EXISTS bolt_drivers_link_source_check;
ALTER TABLE bolt_drivers
  ADD CONSTRAINT bolt_drivers_link_source_check CHECK (link_source IN ('auto', 'manual', 'import'));

ALTER TABLE bolt_drivers ADD COLUMN IF NOT EXISTS import_state text;
ALTER TABLE bolt_drivers DROP CONSTRAINT IF EXISTS bolt_drivers_import_state_check;
ALTER TABLE bolt_drivers
  ADD CONSTRAINT bolt_drivers_import_state_check CHECK (import_state IN ('pending', 'ignored'));

ALTER TABLE bolt_drivers ADD COLUMN IF NOT EXISTS import_batch uuid;
ALTER TABLE bolt_drivers ADD COLUMN IF NOT EXISTS imported_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bolt_drivers_import_batch
  ON bolt_drivers(organization_id, import_batch) WHERE import_batch IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. bolt_vehicles (had no link_source: links were always re-matched by plate)
-- -----------------------------------------------------------------------------
ALTER TABLE bolt_vehicles ADD COLUMN IF NOT EXISTS link_source text;
ALTER TABLE bolt_vehicles DROP CONSTRAINT IF EXISTS bolt_vehicles_link_source_check;
ALTER TABLE bolt_vehicles
  ADD CONSTRAINT bolt_vehicles_link_source_check CHECK (link_source IN ('auto', 'import'));

-- Existing plate matches are automatic ones.
UPDATE bolt_vehicles SET link_source = 'auto' WHERE vehicle_id IS NOT NULL AND link_source IS NULL;

ALTER TABLE bolt_vehicles ADD COLUMN IF NOT EXISTS import_state text;
ALTER TABLE bolt_vehicles DROP CONSTRAINT IF EXISTS bolt_vehicles_import_state_check;
ALTER TABLE bolt_vehicles
  ADD CONSTRAINT bolt_vehicles_import_state_check CHECK (import_state IN ('pending', 'ignored'));

ALTER TABLE bolt_vehicles ADD COLUMN IF NOT EXISTS import_batch uuid;
ALTER TABLE bolt_vehicles ADD COLUMN IF NOT EXISTS imported_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bolt_vehicles_import_batch
  ON bolt_vehicles(organization_id, import_batch) WHERE import_batch IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. bolt_connections
-- -----------------------------------------------------------------------------
ALTER TABLE bolt_connections ADD COLUMN IF NOT EXISTS new_member_mode text NOT NULL DEFAULT 'review';
ALTER TABLE bolt_connections DROP CONSTRAINT IF EXISTS bolt_connections_new_member_mode_check;
ALTER TABLE bolt_connections
  ADD CONSTRAINT bolt_connections_new_member_mode_check CHECK (new_member_mode IN ('review', 'auto', 'off'));

ALTER TABLE bolt_connections ADD COLUMN IF NOT EXISTS first_import_at timestamptz;

-- Fleets connected before this feature have already set up their drivers and
-- cars by hand; don't put an "import your fleet" screen in front of them.
-- Anyone on Bolt who isn't in Rovora still shows in the "Not in Rovora" list.
UPDATE bolt_connections SET first_import_at = created_at WHERE first_import_at IS NULL;

-- -----------------------------------------------------------------------------
-- 4. organizations.ride_platforms
-- -----------------------------------------------------------------------------
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ride_platforms text[];

COMMENT ON COLUMN organizations.ride_platforms IS
  'Ride-hailing apps the fleet works with, from the set-up screen: bolt, uber, other. NULL = not answered.';
