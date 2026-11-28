-- =============================================================================
-- ARCHIVE A DRIVER (keep their history, take away their access)
-- =============================================================================
-- A fleet can archive a driver who has left instead of deleting them. The
-- driver row stays — so their shifts, earnings, settlements, trips and safety
-- scores keep showing on the fleet's dashboards — but:
--   * their membership in the fleet is removed by the app (so they no longer
--     resolve to this fleet anywhere in the app, and RLS helpers built on
--     memberships stop matching them);
--   * if they belong to no other fleet, their login is banned (Supabase auth);
--   * driver_id_for_org() (below) stops resolving an archived driver, so even a
--     still-valid access token can no longer read or write their old fleet's
--     driver-scoped rows (earnings, shifts, positions…).
-- Restoring clears archived_at, re-adds the membership and lifts the ban.
--
-- Drivers cannot change archived_at on their own row: the existing
-- guard_driver_self_update trigger only lets a driver edit phone/address.
-- =============================================================================

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Most reads only want the current (non-archived) drivers of one fleet.
CREATE INDEX IF NOT EXISTS idx_drivers_org_not_archived
  ON public.drivers (organization_id)
  WHERE archived_at IS NULL;

-- The caller's driver id in a fleet — now only while they are not archived.
CREATE OR REPLACE FUNCTION public.driver_id_for_org(p_org UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.drivers
  WHERE user_id = auth.uid() AND organization_id = p_org AND archived_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.driver_id_for_org(UUID) TO authenticated;

SELECT 'drivers can now be archived (archived_at / archived_by)' AS message;
