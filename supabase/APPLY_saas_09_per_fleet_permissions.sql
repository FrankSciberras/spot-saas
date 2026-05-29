-- =============================================================================
-- APPLY: Phase 9 — per-fleet role permissions (run against production Supabase)
-- =============================================================================
-- Makes role_permissions per-fleet so each fleet operator controls their own
-- staff/driver permission matrix. Clones the current global matrix into every
-- fleet first, so NO fleet's effective permissions change on day one.
--
-- Idempotent + backfill-safe. Wrapped in a transaction: any failure rolls back.
-- =============================================================================

BEGIN;

-- 1. Add the org column (nullable for backfill).
ALTER TABLE public.role_permissions
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 2. Drop the old global uniqueness before cloning.
ALTER TABLE public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_resource_key;
DROP INDEX IF EXISTS role_permissions_role_resource_key;

-- 3. Clone the global template into every fleet, then drop the template rows.
DO $$
DECLARE
  o RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM public.role_permissions WHERE organization_id IS NULL) THEN
    FOR o IN SELECT id FROM public.organizations LOOP
      INSERT INTO public.role_permissions
        (organization_id, role, resource, can_view, can_create, can_edit, can_delete)
      SELECT o.id, tpl.role, tpl.resource, tpl.can_view, tpl.can_create, tpl.can_edit, tpl.can_delete
      FROM public.role_permissions tpl
      WHERE tpl.organization_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.role_permissions ex
          WHERE ex.organization_id = o.id
            AND ex.role = tpl.role
            AND ex.resource = tpl.resource
        );
    END LOOP;
    DELETE FROM public.role_permissions WHERE organization_id IS NULL;
  END IF;
END $$;

-- 4. New per-fleet uniqueness + index, then NOT NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_permissions_org_role_resource
  ON public.role_permissions(organization_id, role, resource);
CREATE INDEX IF NOT EXISTS idx_role_permissions_org_id ON public.role_permissions(organization_id);
ALTER TABLE public.role_permissions ALTER COLUMN organization_id SET NOT NULL;

-- 5. Auto-stamp organization_id on insert.
DROP TRIGGER IF EXISTS set_org_id ON public.role_permissions;
CREATE TRIGGER set_org_id
  BEFORE INSERT ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

-- 6. Org-scoped RLS (replaces the old global policies).
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Users can view permissions" ON public.role_permissions;

DROP POLICY IF EXISTS "View permissions in org" ON public.role_permissions;
CREATE POLICY "View permissions in org"
  ON public.role_permissions FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Admins manage permissions in org" ON public.role_permissions;
CREATE POLICY "Admins manage permissions in org"
  ON public.role_permissions FOR ALL
  TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- 7. Scope the enforcement function to the caller's org.
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
    WHERE rp.organization_id = p_org
      AND rp.role = effective_role
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

GRANT EXECUTE ON FUNCTION public.has_resource_permission_org(UUID, UUID, TEXT, TEXT) TO authenticated;

-- 8. Seed a default permission matrix for NEW fleets at creation time.
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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'create_organization_with_owner: no authenticated user';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  INSERT INTO public.users (id, email, role)
  VALUES (v_uid, COALESCE(v_email, v_uid::text || '@unknown.local'), 'admin')
  ON CONFLICT (id) DO NOTHING;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'create_organization_with_owner: name is required';
  END IF;

  v_base_slug := lower(regexp_replace(
                   COALESCE(NULLIF(trim(p_slug), ''), p_name),
                   '[^a-z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN
    v_base_slug := 'fleet';
  END IF;

  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  END LOOP;

  INSERT INTO public.organizations (name, slug)
  VALUES (trim(p_name), v_slug)
  RETURNING id INTO v_org_id;

  INSERT INTO public.memberships (organization_id, user_id, role)
  VALUES (v_org_id, v_uid, 'admin')
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  INSERT INTO public.role_permissions
    (organization_id, role, resource, can_view, can_create, can_edit, can_delete)
  SELECT v_org_id, r.role, res.resource,
         COALESCE(ov.can_view, FALSE),
         COALESCE(ov.can_create, FALSE),
         COALESCE(ov.can_edit, FALSE),
         COALESCE(ov.can_delete, FALSE)
  FROM (VALUES ('staff'), ('driver')) AS r(role)
  CROSS JOIN (VALUES
        ('dashboard'), ('drivers'), ('vehicles'), ('shifts'), ('rosters'),
        ('services'), ('damages'), ('notifications'), ('reports'),
        ('reminders'), ('settings')
      ) AS res(resource)
  LEFT JOIN (VALUES
        ('staff',  'damages',   TRUE,  TRUE,  TRUE,  FALSE),
        ('staff',  'reminders', TRUE,  TRUE,  TRUE,  TRUE),
        ('driver', 'damages',   TRUE,  FALSE, FALSE, FALSE)
      ) AS ov(role, resource, can_view, can_create, can_edit, can_delete)
    ON ov.role = r.role AND ov.resource = res.resource
  ON CONFLICT (organization_id, role, resource) DO NOTHING;

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(TEXT, TEXT) TO authenticated;

COMMIT;
