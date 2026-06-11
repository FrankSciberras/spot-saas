-- =============================================================================
-- SECURITY: stop drivers from editing protected columns of their own record
-- =============================================================================
-- The "Drivers update own record in org" RLS policy (user_id = auth.uid()) lets
-- a driver UPDATE their own drivers row — but RLS cannot restrict WHICH columns.
-- That means a driver could call the Supabase client directly and set their own
-- pay split (settlement_driver_share_pct / settlement_preset_id / tips / fee%),
-- status, employment_type, etc. — a financial-privilege escalation.
--
-- This BEFORE UPDATE trigger restricts an *authenticated, non-admin* self-update
-- to a small allowlist of personal fields (phone, address). Fleet admins and
-- trusted server code (service role — no end-user JWT, so auth.uid() IS NULL)
-- are unaffected and may still update anything.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guard_driver_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone   TEXT := NEW.phone;
  v_address TEXT := NEW.address;
BEGIN
  -- Trusted server (service role) or a fleet admin → allow the update as-is.
  IF auth.uid() IS NULL OR public.is_org_admin(OLD.organization_id) THEN
    RETURN NEW;
  END IF;

  -- Otherwise this is a driver editing their own record: discard every change
  -- except the personal-contact allowlist.
  NEW := OLD;
  NEW.phone := v_phone;
  NEW.address := v_address;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_driver_self_update ON public.drivers;
CREATE TRIGGER trg_guard_driver_self_update
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_driver_self_update();

SELECT 'driver self-update guarded to phone/address only' AS message;
