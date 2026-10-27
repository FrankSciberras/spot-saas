-- =============================================================================
-- SAFETY EVENT DETAIL — "what actually happened" for each harsh event
--
-- Driver app 1.0.4 captures much more per harsh-driving event (all detected on
-- the phone; still no raw sensor streams leave it):
--   kind            + 'harsh_turn' (sharp cornering — sideways force)
--   speed_before_kmh / speed_after_kmh   GPS speed around the event
--   duration_ms     how long the force lasted
--   turn_rate       how fast the car was turning (°/s, from the gyroscope)
--   heading         direction of travel (° from north)
--   accuracy_m      GPS accuracy of the event location
--   classified_by   how the type was decided: 'sensor' (direction of the force,
--                   self-calibrated against GPS), 'gps' (speed change),
--                   'turn' (gyroscope turn rate) — NULL on older app versions
--   trail           a few GPS points around the event:
--                   [{ "lat", "lng", "s" (km/h), "dt" (seconds from event) }]
--   app_version     driver app version that recorded it
--
-- place_name (behaviour + speeding events) is a street-level address filled in
-- lazily by the server (/api/fleet/safety/places) the first time someone
-- opens the event — a cache so each spot is only looked up once.
--
-- Older app versions keep inserting the original columns only; everything here
-- is nullable. IDEMPOTENT: re-runnable.
-- =============================================================================

ALTER TABLE public.driver_behavior_events
  ADD COLUMN IF NOT EXISTS speed_before_kmh NUMERIC(6, 1),
  ADD COLUMN IF NOT EXISTS speed_after_kmh NUMERIC(6, 1),
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS turn_rate NUMERIC(6, 1),
  ADD COLUMN IF NOT EXISTS heading NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS accuracy_m NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS classified_by TEXT,
  ADD COLUMN IF NOT EXISTS trail JSONB,
  ADD COLUMN IF NOT EXISTS app_version TEXT,
  ADD COLUMN IF NOT EXISTS place_name TEXT;

ALTER TABLE public.driver_behavior_events
  DROP CONSTRAINT IF EXISTS driver_behavior_events_kind_check;
ALTER TABLE public.driver_behavior_events
  ADD CONSTRAINT driver_behavior_events_kind_check
  CHECK (kind IN ('harsh_brake', 'harsh_accel', 'harsh_turn', 'harsh_motion'));

ALTER TABLE public.speeding_events
  ADD COLUMN IF NOT EXISTS place_name TEXT;

SELECT 'Safety event detail ready: richer harsh-driving events + cornering + place names.' AS message;
