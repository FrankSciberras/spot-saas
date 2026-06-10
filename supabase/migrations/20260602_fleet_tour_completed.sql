-- =============================================================================
-- FLEET TOUR — "seen once" flag (per user, server-side)
-- =============================================================================
-- The fleet onboarding tour (components/fleet/FleetTour.tsx) previously only
-- remembered completion in the browser's localStorage, so it re-appeared on
-- every new browser / device / incognito session. This timestamp persists the
-- "the operator has seen the tour" fact on the user account, so it shows only
-- once — the first time they ever sign in — across all their sessions.
-- NULL = not seen yet; set to now() when the tour first opens.
-- =============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS fleet_tour_completed_at timestamptz;
