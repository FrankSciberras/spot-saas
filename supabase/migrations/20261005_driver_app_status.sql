-- =============================================================================
-- DRIVER APP STATUS — why isn't this on-shift driver sharing their location?
-- =============================================================================
-- The Live Map flags drivers who are on shift but not sharing location, but
-- the server only knew about phones that had ALREADY shared at least once
-- (driver_positions). The common reasons a driver never shares — they started
-- the shift in a web browser, never gave the app location permission, switched
-- location off, or tapped "Not now" — were only visible on the phone itself.
--
-- One row per driver row, written by POST /api/driver/app-status from the
-- driver portal (the Rovora Driver app is that portal in a WebView, and relays
-- its own status to it). The fleet's Live Map reads it to say, per driver,
-- exactly what's wrong and what to tell them (lib/tracking/sharing-diagnosis).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.driver_app_status (
  driver_id           UUID PRIMARY KEY REFERENCES public.drivers(id) ON DELETE CASCADE,
  organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Last time the portal was open inside the Rovora Driver app / a plain browser.
  app_seen_at         TIMESTAMPTZ,
  browser_seen_at     TIMESTAMPTZ,
  platform            TEXT,            -- 'android' | 'ios'
  app_version         TEXT,            -- e.g. '1.0.3' (app 1.0.3+ only)
  -- As last reported by the app.
  tracking            BOOLEAN,
  last_sent_at        TIMESTAMPTZ,     -- last location the phone sent
  last_error          TEXT,            -- e.g. 'Signed out — open the app and sign in again.'
  -- The app's own location check (app 1.0.3+): 'ok', 'services_off',
  -- 'no_permission', 'not_always' or 'approximate', and when it ran.
  location_access     TEXT,
  access_checked_at   TIMESTAMPTZ,
  -- Driver tapped "Not now" on the app's share-location prompt (app 1.0.3+).
  prompt_dismissed_at TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_app_status_org
  ON public.driver_app_status (organization_id);

-- Fleet admins/staff read their own fleet's rows; all writes go through the
-- server (service role) after it has resolved the caller's own driver row.
ALTER TABLE public.driver_app_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fleet staff see their drivers' app status" ON public.driver_app_status;
CREATE POLICY "Fleet staff see their drivers' app status"
  ON public.driver_app_status FOR SELECT TO authenticated
  USING (public.is_org_admin_or_staff(organization_id));

SELECT 'driver_app_status installed.' AS message;
