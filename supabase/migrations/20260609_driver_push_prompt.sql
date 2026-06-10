-- =============================================================================
-- DRIVER PUSH-NOTIFICATION PROMPT (per-fleet toggle)
-- =============================================================================
-- Lets a fleet operator (admin) decide whether drivers in their fleet who have
-- NOT enabled push notifications get nudged with the "Stay in the loop" prompt
-- on login. Defaults to TRUE so existing fleets keep today's behaviour.
--
-- The prompt only ever shows to a driver who has no push subscription, so this
-- toggle just controls whether that nudge appears at all for the fleet.
--
-- Safe to run once. Idempotent.
-- =============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS prompt_drivers_push BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN organizations.prompt_drivers_push IS
  'When TRUE, drivers without push notifications enabled see the "Stay in the loop" prompt on login. Set by the fleet operator in Settings.';
