-- =============================================================================
-- LIVE LOCATION DURING SHIFTS (per-fleet toggle)
-- =============================================================================
-- Lets a fleet operator (admin) decide whether starting a shift in the Rovora
-- Driver app starts sharing the driver's live location. When TRUE the app also
-- checks the phone's location settings at shift start (fix-it pop-up) and
-- reminds on-shift drivers who aren't sharing. Defaults to TRUE so existing
-- fleets keep today's behaviour.
--
-- Only takes effect while the fleet's Live Tracking module is on.
--
-- Safe to run once. Idempotent.
-- =============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS track_location_on_shift BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN organizations.track_location_on_shift IS
  'When TRUE, starting a shift in the driver app starts live location sharing (and the app asks drivers to fix location access). Set by the fleet operator in Settings.';

SELECT 'organizations.track_location_on_shift added (default TRUE)' AS message;
