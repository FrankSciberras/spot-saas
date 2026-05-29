-- =============================================================================
-- SAAS MIGRATION — PHASE 7: Trials & Plans
-- =============================================================================
-- Adds a 30-day, no-credit-card trial to every newly self-serve created fleet,
-- plus a plan tier the fleet must move onto when the trial ends (or when it
-- outgrows its current tier).
--
-- Plan tiers (limits gate on BOTH drivers and vehicles — the higher of the two
-- counts decides the required tier):
--     trial    full access for 30 days (no caps)
--     starter  up to 10 drivers AND 10 vehicles
--     growth   up to 50 drivers AND 50 vehicles
--     scale    unlimited
--
-- Billing/charging (Stripe) is NOT wired here — plan activation is a stub: an
-- admin (the fleet's own admin, or a platform admin) sets the plan directly.
-- This is the seam a real Stripe Checkout + webhook will slot into later.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Columns
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Grandfather existing fleets: any org that already exists predates trials, so
-- put it on an unlimited paid plan rather than an instantly-expiring trial.
-- (On a fresh DB this matches no rows.)
-- -----------------------------------------------------------------------------
UPDATE organizations
SET plan = 'scale',
    plan_activated_at = COALESCE(plan_activated_at, NOW())
WHERE plan = 'trial' AND trial_ends_at IS NULL;

-- =============================================================================
-- Onboarding RPC — now starts a 30-day trial on the new fleet.
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

  -- New fleet starts a 30-day, no-card trial.
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

-- =============================================================================
-- Plan activation RPC (stub for Stripe). A fleet ADMIN can set their own fleet's
-- plan. SECURITY DEFINER so it can write organizations regardless of column-level
-- RLS, but it self-checks that the caller is an admin member of that org.
-- =============================================================================
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

  -- Caller must be an admin of the target org.
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

SELECT 'Phase 7 complete: trials + plans installed.' AS message;
