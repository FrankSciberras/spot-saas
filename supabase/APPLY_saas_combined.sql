-- =====================================================================
-- SPOT SaaS multi-tenant migration — COMBINED (Phases 1-5)
-- Idempotent + backfill-safe. Run top-to-bottom in the Supabase SQL Editor.
-- Wrapped in a single transaction so a failure rolls everything back.
-- =====================================================================

BEGIN;

-- >>>>>>>>>>>>>>>>>> 20260529_saas_01_organizations.sql >>>>>>>>>>>>>>>>>>
-- =============================================================================
-- SAAS MIGRATION — PHASE 1: Organizations & Memberships
-- =============================================================================
-- Turns the single-tenant fleet dashboard into a multi-tenant SaaS foundation.
--
-- Model: multi-fleet membership.
--   * organizations  = a fleet (tenant)
--   * memberships     = which users belong to which fleet, and their role there
--
-- Role moves OUT of users (global) and INTO memberships (per-fleet), so an owner
-- can belong to several fleets with different roles. The users table keeps the
-- single auth identity + profile fields.
--
-- This migration is IDEMPOTENT and BACKFILL-SAFE: it can run on a fresh empty DB
-- (seed/backfill become no-ops) or on a copy that still holds the old fleet's
-- data (existing users are migrated into a default seed organization).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- Deterministic seed-org id so later migrations (Phase 2 backfill) can reference
-- the same default organization without a lookup.
-- -----------------------------------------------------------------------------
-- Default organization id: 00000000-0000-0000-0000-000000000001

-- =============================================================================
-- ORGANIZATIONS (one row per fleet / tenant)
-- =============================================================================
CREATE TABLE IF NOT EXISTS organizations (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name               TEXT NOT NULL,
  slug               TEXT NOT NULL UNIQUE,
  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'suspended', 'cancelled')),
  -- Billing (populated in Phase 5; nullable for now)
  stripe_customer_id TEXT UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);

-- =============================================================================
-- MEMBERSHIPS (user x organization x role)
-- =============================================================================
-- Reuses the existing user_role enum ('admin','staff','driver').
CREATE TABLE IF NOT EXISTS memberships (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            user_role NOT NULL DEFAULT 'driver',
  also_staff      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_organization_id ON memberships(organization_id);
CREATE INDEX IF NOT EXISTS idx_memberships_role ON memberships(role);

-- updated_at triggers (reuses update_updated_at_column() from base schema)
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_memberships_updated_at ON memberships;
CREATE TRIGGER update_memberships_updated_at
  BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SEED DEFAULT ORGANIZATION + BACKFILL EXISTING USERS
-- =============================================================================
-- Create the seed org only if there are existing users to home, OR always create
-- it as the bootstrap tenant. Safe to keep on a fresh DB (it just sits empty).
INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Fleet', 'default')
ON CONFLICT (id) DO NOTHING;

-- Migrate every existing user into the default org, preserving their role and
-- also_staff flag. No-op on a fresh DB (no users yet).
INSERT INTO memberships (organization_id, user_id, role, also_staff)
SELECT
  '00000000-0000-0000-0000-000000000001',
  u.id,
  u.role,
  COALESCE(u.also_staff, FALSE)
FROM users u
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- NOTE: users.role and users.also_staff are intentionally LEFT IN PLACE for now.
-- They are deprecated (memberships is the source of truth going forward) but kept
-- to avoid breaking the existing app until Phase 4 (app-layer) lands. A later
-- cleanup migration can drop them once all reads go through memberships.

-- =============================================================================
-- MEMBERSHIP HELPER (SECURITY DEFINER — bypasses RLS to avoid recursion)
-- =============================================================================
-- Returns the set of organization ids the calling user belongs to.
-- Because policies on the `memberships` table itself need to reference
-- memberships, a normal subquery would cause infinite RLS recursion. A
-- SECURITY DEFINER function reads the table with RLS bypassed, breaking the
-- cycle. This is the single source of truth reused by Phase 3 policies too.
CREATE OR REPLACE FUNCTION public.current_user_orgs()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.memberships WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.current_user_orgs() TO authenticated;

-- =============================================================================
-- RLS ON THE NEW TABLES
-- =============================================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships   ENABLE ROW LEVEL SECURITY;

-- Members can see organizations they belong to.
DROP POLICY IF EXISTS "Members can view their organizations" ON organizations;
CREATE POLICY "Members can view their organizations"
  ON organizations FOR SELECT
  TO authenticated
  USING (id IN (SELECT public.current_user_orgs()));

-- Members can see membership rows within orgs they belong to (needed to resolve
-- roles / list teammates). Uses the SECURITY DEFINER helper to avoid recursion.
DROP POLICY IF EXISTS "Members can view memberships in their orgs" ON memberships;
CREATE POLICY "Members can view memberships in their orgs"
  ON memberships FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT public.current_user_orgs()));

SELECT 'Phase 1 complete: organizations + memberships created and backfilled.' AS message;

-- >>>>>>>>>>>>>>>>>> 20260529_saas_02_tenant_columns.sql >>>>>>>>>>>>>>>>>>
-- =============================================================================
-- SAAS MIGRATION — PHASE 2: Tenant columns + backfill
-- =============================================================================
-- Adds organization_id to every tenant-scoped table, backfills existing rows to
-- the default seed org (from Phase 1), then enforces NOT NULL + indexes and
-- converts global UNIQUE constraints to be per-organization.
--
-- IDEMPOTENT + BACKFILL-SAFE: re-runnable, and on a fresh DB the UPDATEs simply
-- affect zero rows.
--
-- Scope decisions:
--   * 23 tenant tables get organization_id (listed below).
--   * push_subscriptions stays user-scoped (device registration, not fleet data).
--   * events, vehicle_diagram_zones, role_permissions stay GLOBAL/shared config.
--   * users keeps its global identity; role is per-fleet via memberships (Phase 1).
-- =============================================================================

DO $$
DECLARE
  default_org CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
  t TEXT;
  tenant_tables TEXT[] := ARRAY[
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
    'audit_logs'
    -- app_settings handled separately (its PK changes)
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables
  LOOP
    -- 1. add nullable column with cascade delete (offboarding a fleet removes its data)
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE',
      t
    );

    -- 2. backfill existing rows to the default org
    EXECUTE format(
      'UPDATE public.%I SET organization_id = %L WHERE organization_id IS NULL',
      t, default_org
    );

    -- 3. enforce NOT NULL now that every row has a value
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL',
      t
    );

    -- 4. index for RLS / filtering performance
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I(organization_id)',
      'idx_' || t || '_organization_id', t
    );
  END LOOP;
END $$;

-- =============================================================================
-- app_settings — special case: primary key changes from (key) to (org, key)
-- =============================================================================
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.app_settings
  SET organization_id = '00000000-0000-0000-0000-000000000001'
  WHERE organization_id IS NULL;

ALTER TABLE public.app_settings ALTER COLUMN organization_id SET NOT NULL;

-- Swap the primary key: drop the old single-column PK, add a composite one.
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE public.app_settings ADD PRIMARY KEY (organization_id, key);

-- =============================================================================
-- Convert global UNIQUE constraints to per-organization
-- =============================================================================
-- These uniqueness rules were correct for one fleet but must now be scoped so
-- two different fleets can both have e.g. registration "ABC-123" or a roster for
-- the same week. Constraint names use Postgres' auto-generated convention.

-- vehicles.registration_number  -> (organization_id, registration_number)
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_registration_number_key;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_org_registration_key
  UNIQUE (organization_id, registration_number);

-- rosters.week_start  -> (organization_id, week_start)
ALTER TABLE public.rosters DROP CONSTRAINT IF EXISTS rosters_week_start_key;
ALTER TABLE public.rosters ADD CONSTRAINT rosters_org_week_start_key
  UNIQUE (organization_id, week_start);

-- monthly_earnings.month  -> (organization_id, month)
ALTER TABLE public.monthly_earnings DROP CONSTRAINT IF EXISTS monthly_earnings_month_key;
ALTER TABLE public.monthly_earnings ADD CONSTRAINT monthly_earnings_org_month_key
  UNIQUE (organization_id, month);

-- weekly_bookkeeping (week_start, week_end)  -> (organization_id, week_start, week_end)
ALTER TABLE public.weekly_bookkeeping DROP CONSTRAINT IF EXISTS weekly_bookkeeping_week_start_week_end_key;
ALTER TABLE public.weekly_bookkeeping ADD CONSTRAINT weekly_bookkeeping_org_week_key
  UNIQUE (organization_id, week_start, week_end);

-- NOTE: constraints scoped via a child FK (driver_settlements.driver_id,
-- roster_assignments.roster_id, driver_vehicle_assignments(driver_id,vehicle_id),
-- settlement_platforms.settlement_id) are already transitively org-unique because
-- their parent row carries organization_id. Left unchanged on purpose.

SELECT 'Phase 2 complete: organization_id added, backfilled, and constrained on all tenant tables.' AS message;

-- >>>>>>>>>>>>>>>>>> 20260529_saas_03_rls.sql >>>>>>>>>>>>>>>>>>
-- =============================================================================
-- SAAS MIGRATION — PHASE 3: Org-scoped Row Level Security
-- =============================================================================
-- Rewrites every policy on the 23 tenant tables so a row is only reachable when
-- the caller is a member of that row's organization AND has the right role
-- within that organization. Role now comes from `memberships`, not `users`.
--
-- All helpers are SECURITY DEFINER + STABLE + search_path=public so they read
-- membership/role data with RLS bypassed (prevents recursion) and are safe to
-- call from policies. current_user_orgs() was created in Phase 1.
--
-- IMPORTANT: This migration must run AFTER Phase 2 (organization_id columns).
-- =============================================================================

-- =============================================================================
-- ORG-AWARE HELPER FUNCTIONS
-- =============================================================================

-- Caller's role within a specific org (NULL if not a member).
CREATE OR REPLACE FUNCTION public.org_role(p_org UUID)
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.memberships
  WHERE user_id = auth.uid() AND organization_id = p_org;
$$;

-- Is the caller a member of this org at all?
CREATE OR REPLACE FUNCTION public.is_org_member(p_org UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = auth.uid() AND organization_id = p_org
  );
$$;

-- Is the caller an admin of this org?
CREATE OR REPLACE FUNCTION public.is_org_admin(p_org UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = auth.uid() AND organization_id = p_org AND role = 'admin'
  );
$$;

-- Is the caller admin OR staff (or a driver flagged also_staff) within this org?
CREATE OR REPLACE FUNCTION public.is_org_admin_or_staff(p_org UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = auth.uid()
      AND organization_id = p_org
      AND (role IN ('admin', 'staff') OR (role = 'driver' AND COALESCE(also_staff, FALSE)))
  );
$$;

-- The caller's driver id within a specific org (drivers are per-org rows).
CREATE OR REPLACE FUNCTION public.driver_id_for_org(p_org UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.drivers
  WHERE user_id = auth.uid() AND organization_id = p_org;
$$;

-- Does the caller share at least one org with the target user? (for users table)
CREATE OR REPLACE FUNCTION public.shares_org_with(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships a
    JOIN public.memberships b ON a.organization_id = b.organization_id
    WHERE a.user_id = auth.uid() AND b.user_id = p_user
  );
$$;

-- Effective permission role within an org (admin/staff/driver), honouring also_staff.
CREATE OR REPLACE FUNCTION public.permission_role_for_org(p_user UUID, p_org UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN m.role = 'admin' THEN 'admin'
    WHEN m.role = 'staff' THEN 'staff'
    WHEN m.role = 'driver' AND COALESCE(m.also_staff, FALSE) THEN 'staff'
    WHEN m.role = 'driver' THEN 'driver'
    ELSE NULL
  END
  FROM public.memberships m
  WHERE m.user_id = p_user AND m.organization_id = p_org;
$$;

-- Resource permission check scoped to an org (uses the global role_permissions template).
CREATE OR REPLACE FUNCTION public.has_resource_permission_org(
  p_user UUID, p_org UUID, p_resource TEXT, p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  effective_role TEXT;
BEGIN
  IF p_user IS NULL OR p_org IS NULL THEN
    RETURN FALSE;
  END IF;

  effective_role := public.permission_role_for_org(p_user, p_org);
  IF effective_role IS NULL THEN
    RETURN FALSE;
  END IF;
  IF effective_role = 'admin' THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role = effective_role
      AND rp.resource = p_resource
      AND CASE p_action
        WHEN 'view' THEN COALESCE(rp.can_view, FALSE)
        WHEN 'create' THEN COALESCE(rp.can_create, FALSE)
        WHEN 'edit' THEN COALESCE(rp.can_edit, FALSE)
        WHEN 'delete' THEN COALESCE(rp.can_delete, FALSE)
        ELSE FALSE
      END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.org_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin_or_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_id_for_org(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_org_with(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permission_role_for_org(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_resource_permission_org(UUID, UUID, TEXT, TEXT) TO authenticated;

-- =============================================================================
-- MEMBERSHIP / ORGANIZATION MANAGEMENT (deferred from Phase 1)
-- =============================================================================
-- Org admins manage their org and its memberships. Uses is_org_admin (SECURITY
-- DEFINER) so referencing memberships from a memberships policy is safe.
DROP POLICY IF EXISTS "Org admins can update their organization" ON organizations;
CREATE POLICY "Org admins can update their organization"
  ON organizations FOR UPDATE TO authenticated
  USING (public.is_org_admin(id)) WITH CHECK (public.is_org_admin(id));

DROP POLICY IF EXISTS "Org admins can insert memberships" ON memberships;
CREATE POLICY "Org admins can insert memberships"
  ON memberships FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Org admins can update memberships" ON memberships;
CREATE POLICY "Org admins can update memberships"
  ON memberships FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Org admins can delete memberships" ON memberships;
CREATE POLICY "Org admins can delete memberships"
  ON memberships FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

-- =============================================================================
-- USERS (global identity — visibility scoped to shared orgs)
-- =============================================================================
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Admins/Staff can view all users" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins can insert users" ON users;
DROP POLICY IF EXISTS "Admins can delete users" ON users;

CREATE POLICY "Users can view profiles in shared orgs"
  ON users FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.shares_org_with(id));

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Self-insert on signup (e.g. trigger/callback); broader user creation happens
-- via the service role during onboarding (bypasses RLS).
CREATE POLICY "Users can insert self"
  ON users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- =============================================================================
-- DRIVERS
-- =============================================================================
DROP POLICY IF EXISTS "Drivers can view own record" ON drivers;
DROP POLICY IF EXISTS "Admins/Staff can view all drivers" ON drivers;
DROP POLICY IF EXISTS "Drivers can update own record" ON drivers;
DROP POLICY IF EXISTS "Admins can manage drivers" ON drivers;
DROP POLICY IF EXISTS "Staff can insert drivers" ON drivers;

CREATE POLICY "View drivers in org"
  ON drivers FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_staff(organization_id)
    OR user_id = auth.uid()
  );
CREATE POLICY "Drivers update own record in org"
  ON drivers FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Staff insert drivers in org"
  ON drivers FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_staff(organization_id));
CREATE POLICY "Admins manage drivers in org"
  ON drivers FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- =============================================================================
-- VEHICLES
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can view vehicles" ON vehicles;
DROP POLICY IF EXISTS "Admins can manage vehicles" ON vehicles;
DROP POLICY IF EXISTS "Staff can insert vehicles" ON vehicles;
DROP POLICY IF EXISTS "Staff can update vehicles" ON vehicles;

CREATE POLICY "View vehicles in org"
  ON vehicles FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "Staff insert vehicles in org"
  ON vehicles FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_staff(organization_id));
CREATE POLICY "Staff update vehicles in org"
  ON vehicles FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_staff(organization_id))
  WITH CHECK (public.is_org_admin_or_staff(organization_id));
CREATE POLICY "Admins manage vehicles in org"
  ON vehicles FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- =============================================================================
-- DRIVER_SHIFTS
-- =============================================================================
DROP POLICY IF EXISTS "Drivers can view own shifts" ON driver_shifts;
DROP POLICY IF EXISTS "Admins/Staff can view all shifts" ON driver_shifts;
DROP POLICY IF EXISTS "Drivers can insert own shifts" ON driver_shifts;
DROP POLICY IF EXISTS "Admins can manage shifts" ON driver_shifts;

CREATE POLICY "View shifts in org"
  ON driver_shifts FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_staff(organization_id)
    OR driver_id = public.driver_id_for_org(organization_id)
  );
CREATE POLICY "Drivers insert own shifts in org"
  ON driver_shifts FOR INSERT TO authenticated
  WITH CHECK (driver_id = public.driver_id_for_org(organization_id));
CREATE POLICY "Admins manage shifts in org"
  ON driver_shifts FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- =============================================================================
-- FILES
-- =============================================================================
DROP POLICY IF EXISTS "Drivers can view own files" ON files;
DROP POLICY IF EXISTS "Admins/Staff can view all files" ON files;
DROP POLICY IF EXISTS "Drivers can insert own files" ON files;
DROP POLICY IF EXISTS "Admins/Staff can insert files" ON files;
DROP POLICY IF EXISTS "Admins/Staff can update files" ON files;
DROP POLICY IF EXISTS "Admins can manage files" ON files;
DROP POLICY IF EXISTS "Drivers can view vehicle files" ON files;

CREATE POLICY "View files in org"
  ON files FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_staff(organization_id)
    OR (owner_type = 'driver' AND owner_id = public.driver_id_for_org(organization_id))
    OR (owner_type = 'vehicle' AND public.is_org_member(organization_id))
  );
CREATE POLICY "Drivers insert own files in org"
  ON files FOR INSERT TO authenticated
  WITH CHECK (
    (owner_type = 'driver' AND owner_id = public.driver_id_for_org(organization_id))
    OR public.is_org_admin_or_staff(organization_id)
  );
CREATE POLICY "Staff update files in org"
  ON files FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_staff(organization_id))
  WITH CHECK (public.is_org_admin_or_staff(organization_id));
CREATE POLICY "Admins manage files in org"
  ON files FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- =============================================================================
-- EARNINGS
-- =============================================================================
DROP POLICY IF EXISTS "Drivers can view own earnings" ON earnings;
DROP POLICY IF EXISTS "Admins/Staff can view all earnings" ON earnings;
DROP POLICY IF EXISTS "Admins can manage earnings" ON earnings;

CREATE POLICY "View earnings in org"
  ON earnings FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_staff(organization_id)
    OR driver_id = public.driver_id_for_org(organization_id)
  );
CREATE POLICY "Admins manage earnings in org"
  ON earnings FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- =============================================================================
-- PAYSLIPS
-- =============================================================================
DROP POLICY IF EXISTS "Drivers can view own payslips" ON payslips;
DROP POLICY IF EXISTS "Admins/Staff can view all payslips" ON payslips;
DROP POLICY IF EXISTS "Admins can manage payslips" ON payslips;

CREATE POLICY "View payslips in org"
  ON payslips FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_staff(organization_id)
    OR driver_id = public.driver_id_for_org(organization_id)
  );
CREATE POLICY "Admins manage payslips in org"
  ON payslips FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- =============================================================================
-- NOTIFICATIONS (driver_id NULL = broadcast within org, gated by target_role)
-- =============================================================================
DROP POLICY IF EXISTS "Drivers can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Admins/Staff can view all notifications" ON notifications;
DROP POLICY IF EXISTS "Admins can manage notifications" ON notifications;
DROP POLICY IF EXISTS "Drivers can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Drivers can delete own notifications" ON notifications;

CREATE POLICY "View notifications in org"
  ON notifications FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_staff(organization_id)
    OR driver_id = public.driver_id_for_org(organization_id)
    OR (driver_id IS NULL AND public.is_org_member(organization_id) AND target_role IN ('driver', 'all'))
  );
CREATE POLICY "Admins manage notifications in org"
  ON notifications FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY "Drivers update own notifications in org"
  ON notifications FOR UPDATE TO authenticated
  USING (
    driver_id = public.driver_id_for_org(organization_id)
    OR (driver_id IS NULL AND public.is_org_member(organization_id) AND target_role IN ('driver', 'all'))
  )
  WITH CHECK (
    driver_id = public.driver_id_for_org(organization_id)
    OR (driver_id IS NULL AND public.is_org_member(organization_id) AND target_role IN ('driver', 'all'))
  );
CREATE POLICY "Drivers delete own notifications in org"
  ON notifications FOR DELETE TO authenticated
  USING (
    driver_id = public.driver_id_for_org(organization_id)
    OR (driver_id IS NULL AND public.is_org_member(organization_id) AND target_role IN ('driver', 'all'))
  );

-- =============================================================================
-- CHAT_MESSAGES
-- =============================================================================
DROP POLICY IF EXISTS "Users can view own messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can send messages" ON chat_messages;
DROP POLICY IF EXISTS "Admins can view all messages" ON chat_messages;

CREATE POLICY "View chat messages in org"
  ON chat_messages FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      sender_user_id = auth.uid()
      OR recipient_user_id = auth.uid()
      OR public.is_org_admin(organization_id)
    )
  );
CREATE POLICY "Send chat messages in org"
  ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (sender_user_id = auth.uid() AND public.is_org_member(organization_id));

-- =============================================================================
-- ROSTERS
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can view published rosters" ON rosters;
DROP POLICY IF EXISTS "Admins/Staff can insert rosters" ON rosters;
DROP POLICY IF EXISTS "Admins/Staff can update rosters" ON rosters;
DROP POLICY IF EXISTS "Admins/Staff can delete rosters" ON rosters;

CREATE POLICY "View rosters in org"
  ON rosters FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (status = 'published' OR public.is_org_admin_or_staff(organization_id))
  );
CREATE POLICY "Staff insert rosters in org"
  ON rosters FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_staff(organization_id));
CREATE POLICY "Staff update rosters in org"
  ON rosters FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_staff(organization_id))
  WITH CHECK (public.is_org_admin_or_staff(organization_id));
CREATE POLICY "Staff delete rosters in org"
  ON rosters FOR DELETE TO authenticated
  USING (public.is_org_admin_or_staff(organization_id));

-- =============================================================================
-- ROSTER_ASSIGNMENTS
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can view assignments of published rosters" ON roster_assignments;
DROP POLICY IF EXISTS "Admins/Staff can insert roster assignments" ON roster_assignments;
DROP POLICY IF EXISTS "Admins/Staff can update roster assignments" ON roster_assignments;
DROP POLICY IF EXISTS "Admins/Staff can delete roster assignments" ON roster_assignments;

CREATE POLICY "View roster assignments in org"
  ON roster_assignments FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM rosters r
      WHERE r.id = roster_assignments.roster_id
        AND (r.status = 'published' OR public.is_org_admin_or_staff(organization_id))
    )
  );
CREATE POLICY "Staff insert roster assignments in org"
  ON roster_assignments FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_staff(organization_id));
CREATE POLICY "Staff update roster assignments in org"
  ON roster_assignments FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_staff(organization_id))
  WITH CHECK (public.is_org_admin_or_staff(organization_id));
CREATE POLICY "Staff delete roster assignments in org"
  ON roster_assignments FOR DELETE TO authenticated
  USING (public.is_org_admin_or_staff(organization_id));

-- =============================================================================
-- VEHICLE_SERVICES
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can view services" ON vehicle_services;
DROP POLICY IF EXISTS "Admins/Staff can insert services" ON vehicle_services;
DROP POLICY IF EXISTS "Admins/Staff can update services" ON vehicle_services;
DROP POLICY IF EXISTS "Admins can delete services" ON vehicle_services;

CREATE POLICY "View services in org"
  ON vehicle_services FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "Staff insert services in org"
  ON vehicle_services FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_staff(organization_id));
CREATE POLICY "Staff update services in org"
  ON vehicle_services FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_staff(organization_id))
  WITH CHECK (public.is_org_admin_or_staff(organization_id));
CREATE POLICY "Admins delete services in org"
  ON vehicle_services FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

-- =============================================================================
-- NOTIFICATION_RULES
-- =============================================================================
DROP POLICY IF EXISTS "Admins can manage notification rules" ON notification_rules;
DROP POLICY IF EXISTS "Staff can view notification rules" ON notification_rules;

CREATE POLICY "Staff view notification rules in org"
  ON notification_rules FOR SELECT TO authenticated
  USING (public.is_org_admin_or_staff(organization_id));
CREATE POLICY "Admins manage notification rules in org"
  ON notification_rules FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- =============================================================================
-- NOTIFICATION_LOG
-- =============================================================================
DROP POLICY IF EXISTS "Admins can view all logs" ON notification_log;
DROP POLICY IF EXISTS "Users can view their own logs" ON notification_log;

CREATE POLICY "View notification log in org"
  ON notification_log FOR SELECT TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR recipient_id = auth.uid()
  );

-- =============================================================================
-- DRIVER_SETTLEMENTS
-- =============================================================================
DROP POLICY IF EXISTS "Admin full access to settlements" ON driver_settlements;
DROP POLICY IF EXISTS "Staff can view settlements" ON driver_settlements;
DROP POLICY IF EXISTS "Drivers can view own settlements" ON driver_settlements;

CREATE POLICY "Admins manage settlements in org"
  ON driver_settlements FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY "View settlements in org"
  ON driver_settlements FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_staff(organization_id)
    OR (status = 'finalized' AND driver_id = public.driver_id_for_org(organization_id))
  );

-- =============================================================================
-- SETTLEMENT_PLATFORMS
-- =============================================================================
DROP POLICY IF EXISTS "Admin full access to settlement platforms" ON settlement_platforms;
DROP POLICY IF EXISTS "Staff can view settlement platforms" ON settlement_platforms;
DROP POLICY IF EXISTS "Drivers can view own settlement platforms" ON settlement_platforms;

CREATE POLICY "Admins manage settlement platforms in org"
  ON settlement_platforms FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY "View settlement platforms in org"
  ON settlement_platforms FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_staff(organization_id)
    OR EXISTS (
      SELECT 1 FROM driver_settlements ds
      WHERE ds.id = settlement_platforms.settlement_id
        AND ds.status = 'finalized'
        AND ds.driver_id = public.driver_id_for_org(organization_id)
    )
  );

-- =============================================================================
-- MONTHLY_EARNINGS (admin-only financials)
-- =============================================================================
DROP POLICY IF EXISTS "Admin full access to monthly_earnings" ON monthly_earnings;

CREATE POLICY "Admins manage monthly_earnings in org"
  ON monthly_earnings FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- =============================================================================
-- DRIVER_VEHICLE_ASSIGNMENTS
-- =============================================================================
DROP POLICY IF EXISTS "Admins/Staff can view driver vehicle assignments" ON driver_vehicle_assignments;
DROP POLICY IF EXISTS "Admins/Staff can insert driver vehicle assignments" ON driver_vehicle_assignments;
DROP POLICY IF EXISTS "Admins/Staff can update driver vehicle assignments" ON driver_vehicle_assignments;
DROP POLICY IF EXISTS "Admins/Staff can delete driver vehicle assignments" ON driver_vehicle_assignments;
DROP POLICY IF EXISTS "Drivers can view own vehicle assignments" ON driver_vehicle_assignments;

CREATE POLICY "View driver vehicle assignments in org"
  ON driver_vehicle_assignments FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_staff(organization_id)
    OR driver_id = public.driver_id_for_org(organization_id)
  );
CREATE POLICY "Staff insert driver vehicle assignments in org"
  ON driver_vehicle_assignments FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_staff(organization_id));
CREATE POLICY "Staff update driver vehicle assignments in org"
  ON driver_vehicle_assignments FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_staff(organization_id))
  WITH CHECK (public.is_org_admin_or_staff(organization_id));
CREATE POLICY "Staff delete driver vehicle assignments in org"
  ON driver_vehicle_assignments FOR DELETE TO authenticated
  USING (public.is_org_admin_or_staff(organization_id));

-- =============================================================================
-- DRIVER_ADJUSTMENTS
-- =============================================================================
DROP POLICY IF EXISTS "Admins can manage all adjustments" ON driver_adjustments;
DROP POLICY IF EXISTS "Staff can view all adjustments" ON driver_adjustments;
DROP POLICY IF EXISTS "Drivers can view own adjustments" ON driver_adjustments;

CREATE POLICY "Admins manage adjustments in org"
  ON driver_adjustments FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY "View adjustments in org"
  ON driver_adjustments FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_staff(organization_id)
    OR driver_id = public.driver_id_for_org(organization_id)
  );

-- The base table granted anon SELECT; revoke it (multi-tenant data must be authed).
REVOKE SELECT ON driver_adjustments FROM anon;

-- =============================================================================
-- WEEKLY_BOOKKEEPING (admin-only financials)
-- =============================================================================
DROP POLICY IF EXISTS "Admin full access to weekly_bookkeeping" ON weekly_bookkeeping;

CREATE POLICY "Admins manage weekly_bookkeeping in org"
  ON weekly_bookkeeping FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- =============================================================================
-- VEHICLE_DAMAGES
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can view vehicle damages" ON vehicle_damages;
DROP POLICY IF EXISTS "Admins can manage vehicle damages" ON vehicle_damages;
DROP POLICY IF EXISTS "Staff can insert vehicle damages" ON vehicle_damages;
DROP POLICY IF EXISTS "Staff can update vehicle damages" ON vehicle_damages;

CREATE POLICY "View vehicle damages in org"
  ON vehicle_damages FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "Staff insert vehicle damages in org"
  ON vehicle_damages FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_staff(organization_id));
CREATE POLICY "Staff update vehicle damages in org"
  ON vehicle_damages FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_staff(organization_id))
  WITH CHECK (public.is_org_admin_or_staff(organization_id));
CREATE POLICY "Admins manage vehicle damages in org"
  ON vehicle_damages FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- =============================================================================
-- APP_SETTINGS (per-org; closes the previous wide-open USING(true) policy)
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can read settings" ON app_settings;
DROP POLICY IF EXISTS "Service role can manage settings" ON app_settings;

CREATE POLICY "Members read settings in org"
  ON app_settings FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "Admins manage settings in org"
  ON app_settings FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));
-- (The service role still bypasses RLS entirely for trusted server jobs.)

-- =============================================================================
-- REMINDERS (permission-gated, now org-scoped)
-- =============================================================================
DROP POLICY IF EXISTS "Admins full access to reminders" ON reminders;
DROP POLICY IF EXISTS "Staff can view own reminders" ON reminders;
DROP POLICY IF EXISTS "Staff can update assigned reminders" ON reminders;
DROP POLICY IF EXISTS "Staff can create own reminders" ON reminders;
DROP POLICY IF EXISTS "Staff can update own reminders" ON reminders;
DROP POLICY IF EXISTS "Staff can delete own reminders" ON reminders;

CREATE POLICY "Admins manage reminders in org"
  ON reminders FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY "Staff view own reminders in org"
  ON reminders FOR SELECT TO authenticated
  USING (
    public.has_resource_permission_org(auth.uid(), organization_id, 'reminders', 'view')
    AND (created_by = auth.uid() OR assigned_to = auth.uid())
  );
CREATE POLICY "Staff create reminders in org"
  ON reminders FOR INSERT TO authenticated
  WITH CHECK (
    public.has_resource_permission_org(auth.uid(), organization_id, 'reminders', 'create')
    AND created_by = auth.uid()
  );
CREATE POLICY "Staff update reminders in org"
  ON reminders FOR UPDATE TO authenticated
  USING (
    public.has_resource_permission_org(auth.uid(), organization_id, 'reminders', 'edit')
    AND (created_by = auth.uid() OR assigned_to = auth.uid())
  )
  WITH CHECK (
    public.has_resource_permission_org(auth.uid(), organization_id, 'reminders', 'edit')
    AND (created_by = auth.uid() OR assigned_to = auth.uid())
  );
CREATE POLICY "Staff delete reminders in org"
  ON reminders FOR DELETE TO authenticated
  USING (
    public.has_resource_permission_org(auth.uid(), organization_id, 'reminders', 'delete')
    AND (created_by = auth.uid() OR assigned_to = auth.uid())
  );

-- =============================================================================
-- AUDIT_LOGS (admin read-only; writes via service role)
-- =============================================================================
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;

CREATE POLICY "Admins view audit logs in org"
  ON audit_logs FOR SELECT TO authenticated
  USING (public.is_org_admin(organization_id));

-- =============================================================================
-- HARDEN SECURITY DEFINER RPCs (they bypass RLS — must verify org membership)
-- =============================================================================

-- update_vehicle_mileage: callable by drivers during a shift. Must confirm the
-- caller belongs to the vehicle's organization.
CREATE OR REPLACE FUNCTION public.update_vehicle_mileage(
  p_vehicle_id UUID,
  p_mileage INTEGER
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vehicles v
    JOIN public.memberships m ON m.organization_id = v.organization_id
    WHERE v.id = p_vehicle_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for this vehicle';
  END IF;

  UPDATE public.vehicles
    SET mileage = p_mileage, updated_at = NOW()
    WHERE id = p_vehicle_id
      AND (mileage IS NULL OR mileage <= p_mileage);

  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.vehicles WHERE id = p_vehicle_id) THEN
      RAISE EXCEPTION 'Vehicle not found';
    END IF;
  END IF;
END;
$$;

-- create_service_notification: derive org from the vehicle, verify membership,
-- and stamp the notification with that organization_id (now NOT NULL).
CREATE OR REPLACE FUNCTION public.create_service_notification(
  p_vehicle_id UUID,
  p_vehicle_reg TEXT,
  p_title TEXT,
  p_body TEXT,
  p_type TEXT DEFAULT 'warning',
  p_action_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_notification_id UUID;
  v_org_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT v.organization_id INTO v_org_id
  FROM public.vehicles v
  WHERE v.id = p_vehicle_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid() AND m.organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Not authorized for this vehicle';
  END IF;

  INSERT INTO public.notifications (organization_id, driver_id, title, body, type, action_url, target_role)
  VALUES (v_org_id, NULL, p_title, p_body, p_type, p_action_url, 'admin')
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_vehicle_mileage(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_service_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

SELECT 'Phase 3 complete: org-scoped RLS applied to all tenant tables and SECURITY DEFINER RPCs hardened.' AS message;

-- >>>>>>>>>>>>>>>>>> 20260530_saas_04_autostamp_org.sql >>>>>>>>>>>>>>>>>>
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

-- >>>>>>>>>>>>>>>>>> 20260530_saas_05_onboarding_rpc.sql >>>>>>>>>>>>>>>>>>
-- =============================================================================
-- SAAS MIGRATION — PHASE 5 (4d): Self-serve onboarding RPC
-- =============================================================================
-- A brand-new authenticated user who belongs to NO organization cannot create
-- one under RLS: Phase 3 only grants organization INSERT/membership INSERT to
-- existing org admins, and a non-member is, by definition, not yet an admin of
-- anything. That is a chicken-and-egg problem for self-serve signup.
--
-- This SECURITY DEFINER function breaks the cycle: it atomically creates the
-- organization and an 'admin' membership for the calling user (auth.uid()),
-- bypassing RLS for just this bootstrap step. It is the ONLY sanctioned way for
-- a user to create a fleet from nothing.
--
-- Guards:
--   * Requires an authenticated caller (auth.uid() must be non-null).
--   * Validates / normalizes the slug; auto-deduplicates with a numeric suffix
--     so concurrent signups never collide on the UNIQUE(slug) constraint.
--   * Returns the new organization id.
--
-- IDEMPOTENT: CREATE OR REPLACE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  p_name TEXT,
  p_slug TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_email     TEXT;
  v_org_id    UUID;
  v_base_slug TEXT;
  v_slug      TEXT;
  v_suffix    INT := 1;
BEGIN
  -- Must be an authenticated end-user.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'create_organization_with_owner: no authenticated user';
  END IF;

  -- Self-serve signup creates an auth.users row but no public.users profile
  -- (there is no auth->public trigger). The memberships FK requires one, so
  -- ensure the profile exists before we create the membership. Pull the email
  -- from auth.users (readable here because the function is SECURITY DEFINER).
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  INSERT INTO public.users (id, email, role)
  VALUES (v_uid, COALESCE(v_email, v_uid::text || '@unknown.local'), 'admin')
  ON CONFLICT (id) DO NOTHING;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'create_organization_with_owner: name is required';
  END IF;

  -- Build a URL-safe base slug from the supplied slug (or the name).
  v_base_slug := lower(regexp_replace(
                   COALESCE(NULLIF(trim(p_slug), ''), p_name),
                   '[^a-z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN
    v_base_slug := 'fleet';
  END IF;

  -- Deduplicate against the UNIQUE(slug) constraint.
  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  END LOOP;

  INSERT INTO public.organizations (name, slug)
  VALUES (trim(p_name), v_slug)
  RETURNING id INTO v_org_id;

  -- The creator becomes an admin of the new fleet.
  INSERT INTO public.memberships (organization_id, user_id, role)
  VALUES (v_org_id, v_uid, 'admin')
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(TEXT, TEXT) TO authenticated;

SELECT 'Phase 4d complete: create_organization_with_owner() onboarding RPC installed.' AS message;

-- Default privileges in Supabase grant table access to authenticated/anon,
-- but make the new tables explicit to be safe.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memberships  TO authenticated;

COMMIT;

-- ---------- VERIFY (read-only) ----------
SELECT (SELECT count(*) FROM public.organizations) AS orgs,
       (SELECT count(*) FROM public.memberships)  AS memberships,
       (SELECT count(*) FROM public.users)        AS users;
SELECT m.user_id, u.email, m.role, m.organization_id
FROM public.memberships m JOIN public.users u ON u.id = m.user_id;
