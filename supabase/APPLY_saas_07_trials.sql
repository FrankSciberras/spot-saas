-- =============================================================================
-- APPLY: Phase 7 — trials & plans (run against production Supabase)
-- =============================================================================
-- Idempotent. Adds trial/plan columns to organizations, grandfathers existing
-- fleets onto an unlimited paid plan, makes the onboarding RPC start a 30-day
-- trial, and adds set_organization_plan() for stubbed plan activation.
-- =============================================================================

BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS plan             TEXT NOT NULL DEFAULT 'trial'
    CHECK (plan IN ('trial', 'starter', 'growth', 'scale'));
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS trial_ends_at    TIMESTAMPTZ;
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS plan_activated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_organizations_plan ON organizations(plan);
CREATE INDEX IF NOT EXISTS idx_organizations_trial_ends_at ON organizations(trial_ends_at);

UPDATE organizations
SET plan = 'scale',
    plan_activated_at = COALESCE(plan_activated_at, NOW())
WHERE plan = 'trial' AND trial_ends_at IS NULL;

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

  INSERT INTO public.organizations (name, slug, plan, trial_started_at, trial_ends_at)
  VALUES (trim(p_name), v_slug, 'trial', NOW(), NOW() + INTERVAL '30 days')
  RETURNING id INTO v_org_id;

  INSERT INTO public.memberships (organization_id, user_id, role)
  VALUES (v_org_id, v_uid, 'admin')
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_organization_plan(
  p_org  UUID,
  p_plan TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'set_organization_plan: no authenticated user';
  END IF;

  IF p_plan NOT IN ('starter', 'growth', 'scale') THEN
    RAISE EXCEPTION 'set_organization_plan: invalid plan %', p_plan;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE organization_id = p_org AND user_id = v_uid AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'set_organization_plan: not an admin of this organization';
  END IF;

  UPDATE public.organizations
  SET plan = p_plan,
      plan_activated_at = NOW(),
      status = 'active'
  WHERE id = p_org;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_organization_plan(UUID, TEXT) TO authenticated;

COMMIT;

-- Verify: show every fleet's plan + trial window.
SELECT name, plan, trial_ends_at, plan_activated_at, status
FROM organizations
ORDER BY created_at;
