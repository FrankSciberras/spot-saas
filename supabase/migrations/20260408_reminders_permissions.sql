-- =============================================================================
-- Reminder permissions for staff and driver+staff users
-- =============================================================================

-- Seed reminder permissions so staff can use reminders immediately.
INSERT INTO role_permissions (role, resource, can_view, can_create, can_edit, can_delete)
VALUES ('staff', 'reminders', true, true, true, true)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role, resource, can_view, can_create, can_edit, can_delete)
VALUES ('driver', 'reminders', false, false, false, false)
ON CONFLICT DO NOTHING;

-- Resolve the effective permission role, including driver accounts that also have staff access.
CREATE OR REPLACE FUNCTION public.permission_role_for_user(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN u.role = 'admin' THEN 'admin'
    WHEN u.role = 'staff' THEN 'staff'
    WHEN u.role = 'driver' AND COALESCE(u.also_staff, false) THEN 'staff'
    WHEN u.role = 'driver' THEN 'driver'
    ELSE NULL
  END
  FROM public.users u
  WHERE u.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.has_resource_permission(
  p_user_id uuid,
  p_resource text,
  p_action text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  effective_role text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT public.permission_role_for_user(p_user_id)
  INTO effective_role;

  IF effective_role IS NULL THEN
    RETURN false;
  END IF;

  IF effective_role = 'admin' THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    WHERE rp.role = effective_role
      AND rp.resource = p_resource
      AND CASE p_action
        WHEN 'view' THEN COALESCE(rp.can_view, false)
        WHEN 'create' THEN COALESCE(rp.can_create, false)
        WHEN 'edit' THEN COALESCE(rp.can_edit, false)
        WHEN 'delete' THEN COALESCE(rp.can_delete, false)
        ELSE false
      END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.permission_role_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_resource_permission(uuid, text, text) TO authenticated;

DROP POLICY IF EXISTS "Staff can view own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Staff can update assigned reminders" ON public.reminders;
DROP POLICY IF EXISTS "Staff can create own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Staff can update own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Staff can delete own reminders" ON public.reminders;

CREATE POLICY "Staff can view own reminders"
  ON public.reminders FOR SELECT
  TO authenticated
  USING (
    public.has_resource_permission(auth.uid(), 'reminders', 'view')
    AND (created_by = auth.uid() OR assigned_to = auth.uid())
  );

CREATE POLICY "Staff can create own reminders"
  ON public.reminders FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_resource_permission(auth.uid(), 'reminders', 'create')
    AND created_by = auth.uid()
  );

CREATE POLICY "Staff can update own reminders"
  ON public.reminders FOR UPDATE
  TO authenticated
  USING (
    public.has_resource_permission(auth.uid(), 'reminders', 'edit')
    AND (created_by = auth.uid() OR assigned_to = auth.uid())
  )
  WITH CHECK (
    public.has_resource_permission(auth.uid(), 'reminders', 'edit')
    AND (created_by = auth.uid() OR assigned_to = auth.uid())
  );

CREATE POLICY "Staff can delete own reminders"
  ON public.reminders FOR DELETE
  TO authenticated
  USING (
    public.has_resource_permission(auth.uid(), 'reminders', 'delete')
    AND (created_by = auth.uid() OR assigned_to = auth.uid())
  );
