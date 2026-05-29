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
