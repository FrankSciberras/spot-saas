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
