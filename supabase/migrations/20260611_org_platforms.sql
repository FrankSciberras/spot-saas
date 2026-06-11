-- =============================================================================
-- ORG PLATFORMS (per-fleet editable ride platforms)
-- =============================================================================
-- The ride platforms (Bolt / Uber / Ecabs) and their default fee % were
-- hardcoded in lib/config/settlements.ts, so a fleet working with a different
-- platform — or a different commission — couldn't be represented. This makes
-- the platform list per-org data:
--
--   * org_platforms — key (stable id used as settlement_platforms.platform_id),
--     display name, default fee %, emoji icon, color, sort order, active flag.
--   * Operators add / rename / re-fee / deactivate platforms in Settlement
--     Rules. DEACTIVATING hides a platform from new settlements; existing
--     settlements are untouched (they snapshot platform_id + name + fee).
--
-- Seeding: seed_default_platforms(org) gives each org the classic three
-- platforms at 10%; called for all existing orgs (backfill) and from
-- create_organization_with_owner for new fleets. The code also falls back to
-- the hardcoded list when an org has zero platform rows, so nothing breaks if
-- this migration lags a deploy.
--
-- Safe to run once. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. org_platforms table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_platforms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Stable identifier stored on settlement_platforms.platform_id. Slug-like.
  key             TEXT NOT NULL,
  name            TEXT NOT NULL,
  default_fee_pct NUMERIC NOT NULL DEFAULT 10 CHECK (default_fee_pct BETWEEN 0 AND 100),
  icon            TEXT NOT NULL DEFAULT '🚗',
  color           TEXT NOT NULL DEFAULT '#2bbd7e',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, key)
);

CREATE INDEX IF NOT EXISTS idx_org_platforms_org_id ON org_platforms(organization_id);

-- -----------------------------------------------------------------------------
-- 2. RLS — members read their fleet's platforms; writes go through admin-only
--    server actions (service role), so no write policies are needed.
-- -----------------------------------------------------------------------------
ALTER TABLE org_platforms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their org platforms" ON org_platforms;
CREATE POLICY "Members can view their org platforms"
  ON org_platforms FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 3. updated_at trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_org_platforms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_org_platforms_updated_at ON org_platforms;
CREATE TRIGGER trigger_org_platforms_updated_at
  BEFORE UPDATE ON org_platforms
  FOR EACH ROW
  EXECUTE FUNCTION update_org_platforms_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Seeder — the classic three platforms at 10%, matching the old hardcoded
--    list exactly. Idempotent per org (skips orgs that already have rows).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_platforms(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.org_platforms WHERE organization_id = p_org) THEN
    RETURN;
  END IF;

  INSERT INTO public.org_platforms (organization_id, key, name, default_fee_pct, icon, color, sort_order)
  VALUES
    (p_org, 'bolt',  'Bolt',  10, '⚡', '#34D186', 0),
    (p_org, 'uber',  'Uber',  10, '🚗', '#000000', 1),
    (p_org, 'ecabs', 'Ecabs', 10, '🚕', '#FFB800', 2);
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_default_platforms(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Seed on org creation: recreate create_organization_with_owner with a call
--    to the platform seeder. (Body mirrors 20260606_seed_notification_rules.sql.)
-- -----------------------------------------------------------------------------
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

  -- Give the new fleet a working set of default notification rules + platforms.
  PERFORM public.seed_default_notification_rules(v_org_id);
  PERFORM public.seed_default_platforms(v_org_id);

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Backfill: every existing org without platforms gets the defaults.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_default_platforms(r.id);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 7. Documentation
-- -----------------------------------------------------------------------------
COMMENT ON TABLE org_platforms IS 'Per-fleet ride platforms (name, default fee %, icon) used to build settlement entry forms. Deactivate instead of delete when a platform was used historically.';
COMMENT ON COLUMN org_platforms.key IS 'Stable slug stored as settlement_platforms.platform_id; never changes after creation.';

SELECT 'Org platforms installed.' AS message;
