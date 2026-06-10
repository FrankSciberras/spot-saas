-- =============================================================================
-- DYNAMIC PLANS / PACKAGES (platform-admin-managed pricing catalogue)
-- =============================================================================
-- Until now the plan catalogue lived in TWO hardcoded places that had already
-- drifted apart: lib/billing/plans.ts (flat $49 / $149 / Custom, used for limit
-- enforcement + the in-app billing screen) and the marketing landing page
-- (per-vehicle €12 / €9 / "Let's talk"). This migration makes the catalogue a
-- single DB-backed source of truth that the platform admin edits at /admin, and
-- that drives the marketing pricing, the onboarding wizard, the in-app billing
-- screen and the platform metrics alike.
--
-- Roles:
--   * PLATFORM admins create/edit packages (only them — writes go through the
--     service-role server action in lib/actions/plans.ts).
--   * Anyone (incl. logged-out marketing visitors) reads PUBLISHED packages.
--
-- `trial` stays a built-in state (a free 30-day grace period), NOT a sellable
-- package, so it is intentionally absent from this table.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- plans — the package catalogue. `key` matches organizations.plan.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL UNIQUE,            -- slug stored in organizations.plan, e.g. 'starter'
  name          text NOT NULL,                   -- display name, e.g. 'Starter'
  blurb         text,                            -- one-line description (marketing + admin)
  -- Pricing: price_label/price_unit are free-text DISPLAY; price_amount is the
  -- monthly figure used for MRR/ARR maths (0 for custom-priced tiers).
  price_label   text NOT NULL DEFAULT 'Custom',  -- e.g. '€49', 'Custom', "Let's talk"
  price_unit    text,                            -- e.g. '/ mo', '/ vehicle / mo' (NULL hides the suffix)
  price_amount  numeric NOT NULL DEFAULT 0,      -- monthly amount per account for metrics
  billing_note  text,                            -- e.g. 'Up to 10 vehicles · billed monthly'
  cap_label     text,                            -- short cap summary, e.g. 'Up to 10 drivers & vehicles'
  -- Enforcement limits. NULL = unlimited. The HIGHER of drivers/vehicles gates.
  max_drivers   integer,
  max_vehicles  integer,
  features      text[] NOT NULL DEFAULT '{}',    -- feature bullet list
  color         text,                            -- accent colour token / hex for pills + cards
  cta_label     text,                            -- marketing button text, e.g. 'Start free trial'
  cta_href      text,                            -- NULL = self-serve trial signup; else mailto/url
  is_custom     boolean NOT NULL DEFAULT false,  -- custom-priced (no self-serve activation)
  is_popular    boolean NOT NULL DEFAULT false,  -- 'Most popular' marketing badge
  is_published  boolean NOT NULL DEFAULT true,   -- hide drafts from public + operators
  sort_order    integer NOT NULL DEFAULT 0,      -- catalogue order (also the limit ranking)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plans_sort_order ON plans(sort_order);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon marketing visitors) can read PUBLISHED packages.
DROP POLICY IF EXISTS "Anyone can view published plans" ON plans;
CREATE POLICY "Anyone can view published plans"
  ON plans FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

-- Platform admins can read everything (incl. drafts) + write. Defense in depth;
-- real writes go through the service-role action in lib/actions/plans.ts.
DROP POLICY IF EXISTS "Platform admins manage plans" ON plans;
CREATE POLICY "Platform admins manage plans"
  ON plans FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- Seed the existing catalogue. Reconciles the two old hardcoded sources onto the
-- functional billing tiers (keys starter/growth/scale stay — organizations.plan
-- already references them). The admin can edit any of this at /admin afterwards.
-- -----------------------------------------------------------------------------
INSERT INTO plans (key, name, blurb, price_label, price_unit, price_amount, billing_note, cap_label, max_drivers, max_vehicles, features, color, cta_label, is_custom, is_popular, is_published, sort_order)
VALUES
  (
    'starter', 'Starter',
    'For owner-operators getting off spreadsheets.',
    '€49', '/ mo', 49,
    'Up to 10 vehicles · billed monthly',
    'Up to 10 drivers & vehicles',
    10, 10,
    ARRAY['Dashboard, drivers & vehicles', 'Shifts & rosters', 'Free driver app', 'Email support'],
    'var(--text-2)', 'Start free trial', false, false, true, 1
  ),
  (
    'growth', 'Growth',
    'For growing fleets that pay drivers weekly.',
    '€149', '/ mo', 149,
    'Up to 50 vehicles · billed monthly',
    'Up to 50 drivers & vehicles',
    50, 50,
    ARRAY['Everything in Starter', 'Financials & settlements', 'Maintenance & damages', 'Priority support'],
    'var(--accent)', 'Start free trial', false, true, true, 2
  ),
  (
    'scale', 'Scale',
    'For larger operators with custom needs.',
    'Custom', NULL, 0,
    '50+ vehicles · annual billing',
    'Unlimited drivers & vehicles',
    NULL, NULL,
    ARRAY['Everything in Growth', 'Dedicated subdomain', 'Guided onboarding & import', 'SLA & dedicated account manager'],
    '#a78bfa', 'Book a demo', true, false, true, 3
  )
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- organizations.plan — drop the hardcoded CHECK so new package keys are allowed.
-- (Validation now lives in the set_organization_plan RPC, against the plans table.)
-- The constraint name is auto-generated; drop defensively by discovering it.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT con.conname INTO v_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'organizations'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%plan%'
    AND pg_get_constraintdef(con.oid) ILIKE '%starter%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE organizations DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- set_organization_plan — validate against the plans table (published, non-custom)
-- instead of a hardcoded list, so newly added self-serve packages just work.
-- Custom-priced tiers can't be self-activated (operators must contact sales);
-- the platform admin can still assign any plan via lib/actions/platform-billing.
-- -----------------------------------------------------------------------------
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

  IF NOT EXISTS (
    SELECT 1 FROM public.plans
    WHERE key = p_plan AND is_published = true AND is_custom = false
  ) THEN
    RAISE EXCEPTION 'set_organization_plan: invalid or non-self-serve plan %', p_plan;
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

SELECT 'Dynamic plans installed.' AS message;
