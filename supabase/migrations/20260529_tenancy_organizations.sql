-- =============================================================================
-- TENANCY REFACTOR: multi-tenant organizations + org_id isolation
-- =============================================================================
-- Converts the single-tenant schema into a multi-tenant SaaS by:
--   1. Adding an `organizations` table (with freemium resource caps).
--   2. Adding a nullable `org_id` to every per-tenant table.
--   3. Adding `current_org_id()` helper (reads the caller's org from users).
--   4. Auto-stamping org_id on INSERT via a trigger (minimal app changes).
--   5. Enforcing isolation with ONE restrictive RLS policy per table
--      (ANDed on top of existing role/permission policies — nothing rewritten).
--   6. Making global UNIQUE constraints org-scoped (e.g. vehicle reg plates).
--   7. Bootstrapping a single org from the existing admin and backfilling.
--   8. Dropping the unused `events` table.
--
-- DESIGN NOTES
--   * org_id is left NULLABLE for now. Service-role inserts (cron jobs, invite
--     creation, etc.) bypass RLS and current_org_id() returns NULL for them,
--     so they cannot be forced NOT NULL until those ~13 routes are audited to
--     set org_id explicitly. Until then they are NOT tenant-isolated.
--   * Restrictive policies only apply to the cookie/anon client (normal app
--     traffic), which is exactly where we want automatic isolation.
--   * `app_settings` and `vehicle_diagram_zones` are intentionally left GLOBAL
--     (platform-level config / shared reference data), so they get no org_id.
--
-- Safe to run once on the freshly-installed schema. Mostly idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Drop the unused events table (decision: not used in the SaaS)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS events CASCADE;

-- -----------------------------------------------------------------------------
-- 1. organizations table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  plan          TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  -- Freemium resource caps. NULL = unlimited (used by paid plans).
  max_vehicles  INTEGER DEFAULT 5,
  max_drivers   INTEGER DEFAULT 5,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. current_org_id() helper — the anchor for all isolation.
--    SECURITY DEFINER so it bypasses RLS on users (no recursion).
-- -----------------------------------------------------------------------------
-- users.org_id must exist before this function can be created.
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION current_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.users WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION current_org_id() TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. set_org_id() trigger fn — auto-stamp org_id on insert when not supplied.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_org_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := current_org_id();
  END IF;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Add org_id + trigger + restrictive RLS to every per-tenant table.
--    (users handled separately above for column; gets trigger/policy here too.)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  per_tenant_tables TEXT[] := ARRAY[
    'users',
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
    'role_permissions',
    'vehicle_services',
    'notification_rules',
    'notification_log',
    'push_subscriptions',
    'driver_settlements',
    'settlement_platforms',
    'monthly_earnings',
    'driver_vehicle_assignments',
    'weekly_bookkeeping',
    'driver_adjustments',
    'vehicle_damages',
    'reminders',
    'audit_logs'
  ];
BEGIN
  FOREACH t IN ARRAY per_tenant_tables LOOP
    -- a) add org_id column (nullable for now)
    IF t <> 'users' THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE',
        t
      );
    END IF;

    -- b) index org_id for fast tenant filtering
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I(org_id)',
      'idx_' || t || '_org_id', t
    );

    -- c) auto-stamp trigger
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_org_id ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.%I
         FOR EACH ROW EXECUTE FUNCTION set_org_id()',
      t
    );

    -- d) restrictive isolation policy (ANDed with existing permissive policies)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON public.%I
         AS RESTRICTIVE
         FOR ALL
         USING (org_id = current_org_id())
         WITH CHECK (org_id = current_org_id())',
      t
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 5. organizations RLS — a user can see/manage only their own org.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view their org" ON organizations;
CREATE POLICY "Members can view their org"
  ON organizations FOR SELECT
  USING (id = current_org_id());

DROP POLICY IF EXISTS "Owner can update their org" ON organizations;
CREATE POLICY "Owner can update their org"
  ON organizations FOR UPDATE
  USING (id = current_org_id() AND owner_user_id = auth.uid())
  WITH CHECK (id = current_org_id() AND owner_user_id = auth.uid());

-- Note: org creation on signup is done server-side (service role), so no
-- INSERT policy is needed for the anon/cookie client here.

-- -----------------------------------------------------------------------------
-- 6. Make global UNIQUE constraints org-scoped.
--    (Default constraint names follow the {table}_{cols}_key convention.)
-- -----------------------------------------------------------------------------
-- vehicles.registration_number: two fleets may share a plate string.
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_registration_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicles_org_registration
  ON vehicles(org_id, registration_number);

-- rosters.week_start
ALTER TABLE rosters DROP CONSTRAINT IF EXISTS rosters_week_start_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rosters_org_week_start
  ON rosters(org_id, week_start);

-- monthly_earnings.month
ALTER TABLE monthly_earnings DROP CONSTRAINT IF EXISTS monthly_earnings_month_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_earnings_org_month
  ON monthly_earnings(org_id, month);

-- weekly_bookkeeping (week_start, week_end)
ALTER TABLE weekly_bookkeeping DROP CONSTRAINT IF EXISTS weekly_bookkeeping_week_start_week_end_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_bookkeeping_org_weeks
  ON weekly_bookkeeping(org_id, week_start, week_end);

-- role_permissions (role, resource) -> per org so each fleet owner controls
-- their own staff/driver permission matrix independently.
ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_resource_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_permissions_org_role_resource
  ON role_permissions(org_id, role, resource);

-- -----------------------------------------------------------------------------
-- 7. Bootstrap: create one org from the existing admin and backfill all rows.
--    Fresh DB => the only data is the admin user + seeded permission/rule rows.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_admin   users%ROWTYPE;
  v_org_id  UUID;
  t         TEXT;
  per_tenant_tables TEXT[] := ARRAY[
    'drivers','vehicles','driver_shifts','files','earnings','payslips',
    'notifications','chat_messages','rosters','roster_assignments',
    'role_permissions','vehicle_services','notification_rules','notification_log',
    'push_subscriptions','driver_settlements','settlement_platforms',
    'monthly_earnings','driver_vehicle_assignments','weekly_bookkeeping',
    'driver_adjustments','vehicle_damages','reminders','audit_logs'
  ];
BEGIN
  SELECT * INTO v_admin FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1;

  IF v_admin.id IS NULL THEN
    RAISE NOTICE 'No admin user found - skipping bootstrap. Create an admin, then re-run section 7.';
    RETURN;
  END IF;

  -- Create the bootstrap org if the admin has none yet.
  IF v_admin.org_id IS NULL THEN
    INSERT INTO organizations (name, owner_user_id, plan, max_vehicles, max_drivers)
    VALUES (COALESCE(v_admin.full_name, 'My Fleet'), v_admin.id, 'pro', NULL, NULL)
    RETURNING id INTO v_org_id;

    UPDATE users SET org_id = v_org_id WHERE org_id IS NULL;
  ELSE
    v_org_id := v_admin.org_id;
  END IF;

  -- Backfill every per-tenant table's existing rows to the bootstrap org.
  FOREACH t IN ARRAY per_tenant_tables LOOP
    EXECUTE format('UPDATE public.%I SET org_id = $1 WHERE org_id IS NULL', t)
    USING v_org_id;
  END LOOP;

  RAISE NOTICE 'Bootstrap complete. Org % owns all existing data.', v_org_id;
END $$;

-- =============================================================================
-- TODO (follow-up work, NOT in this migration):
--   * Signup flow: create org + set new admin's org_id + seed role_permissions
--     and notification_rules for that org.
--   * Invite flow (service role): set org_id explicitly to inviter's org.
--   * Audit the ~13 createAdminClient() routes to filter/set org_id.
--   * Once the above is done: make org_id NOT NULL on all per-tenant tables.
--   * Stripe + enforce organizations.max_vehicles / max_drivers caps.
-- =============================================================================
