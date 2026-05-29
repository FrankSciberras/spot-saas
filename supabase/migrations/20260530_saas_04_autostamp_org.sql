-- =============================================================================
-- SAAS MIGRATION — PHASE 4: Auto-stamp organization_id on insert
-- =============================================================================
-- Phase 2 made organization_id NOT NULL on every tenant table. The existing app
-- code (50+ insert sites) does not yet supply organization_id, so those inserts
-- would fail the NOT NULL constraint.
--
-- This migration adds a BEFORE INSERT trigger that fills organization_id from the
-- calling user's membership when it is left NULL:
--   * If the user belongs to exactly ONE organization  -> fill it (the common
--     case — most users are in a single fleet). Existing code keeps working.
--   * If the user belongs to 0 or >1 organizations      -> leave NULL, so the
--     NOT NULL constraint rejects the insert. This FORCES multi-org callers to
--     stamp organization_id explicitly (which the app does from the active-org
--     cookie), preventing ambiguous writes to the wrong fleet.
--   * If there is no auth.uid() (service_role / admin client) -> leave NULL.
--     Trusted server code that bypasses RLS MUST set organization_id itself.
--
-- An explicit organization_id always wins — the trigger never overwrites it.
-- RLS WITH CHECK (Phase 3) still validates the final value belongs to the caller,
-- so this trigger is a convenience, not a security boundary.
--
-- IDEMPOTENT: re-runnable (CREATE OR REPLACE + DROP/CREATE TRIGGER).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_default_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org   UUID;
  v_count INT;
BEGIN
  -- Explicit value always wins.
  IF NEW.organization_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- No end-user identity (service_role / admin client) -> must stamp explicitly.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Auto-fill only when the membership is unambiguous (exactly one org).
  SELECT count(*) INTO v_count
    FROM public.memberships
    WHERE user_id = auth.uid();

  IF v_count = 1 THEN
    SELECT organization_id INTO v_org
      FROM public.memberships
      WHERE user_id = auth.uid();
    NEW.organization_id := v_org;
  END IF;
  -- v_count = 0 or > 1: leave NULL on purpose; NOT NULL constraint will reject.

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_default_organization_id() TO authenticated;

-- -----------------------------------------------------------------------------
-- Attach the trigger to every org-scoped table (23 total: the 22 tenant tables
-- from Phase 2 + app_settings).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  org_tables TEXT[] := ARRAY[
    'drivers',
    'vehicles',
    'driver_shifts',
    'files',
    'earnings',
    'payslips',
    'notifications',
    'chat_messages',
    'rosters',
    'roster_assignments',
    'vehicle_services',
    'notification_rules',
    'notification_log',
    'driver_settlements',
    'settlement_platforms',
    'monthly_earnings',
    'driver_vehicle_assignments',
    'driver_adjustments',
    'weekly_bookkeeping',
    'vehicle_damages',
    'reminders',
    'audit_logs',
    'app_settings'
  ];
BEGIN
  FOREACH t IN ARRAY org_tables
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_org_id ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_org_id BEFORE INSERT ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id()',
      t
    );
  END LOOP;
END $$;

SELECT 'Phase 4 complete: organization_id auto-stamp trigger installed on all tenant tables.' AS message;
