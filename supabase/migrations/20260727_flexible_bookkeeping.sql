-- =============================================================================
-- FLEXIBLE BOOKKEEPING — per-fleet categories, any period length, vehicle costs
-- =============================================================================
-- weekly_bookkeeping stored the whole ledger as TWELVE FIXED COLUMNS
-- (uber_earnings … other_expenses), so a fleet could never add "Fuel" or
-- "Tolls" without a migration, and the period was week-shaped by column name.
-- That same twelve-item list was hand-copied into seven places across the app.
--
-- This replaces the wide table with the shape already used for org_platforms —
-- the list becomes per-fleet DATA:
--
--   * org_finance_categories — key (stable id), display name, income/expense,
--     icon, colour, sort order, active flag. Operators add / rename / recolour /
--     deactivate categories. DEACTIVATING hides a category from new periods;
--     existing entries are untouched (and deleting one with entries is blocked
--     by ON DELETE RESTRICT — deactivate instead).
--   * bookkeeping_periods — the period itself, now with period_type
--     ('week' | 'month' | 'custom') so monthly bookkeeping is first-class.
--     Totals are maintained by trigger, so the stored figure can never drift
--     from the entries the way weekly_bookkeeping's did.
--   * bookkeeping_entries — one row per period per category. Adding a category
--     is now data entry, not a schema change.
--   * vehicle_recurring_costs — the fleet's own cost of running a vehicle
--     (lease, finance payment, road tax, insurance premium). Nothing in the
--     schema could express this before: vehicles has expiry DATES but no
--     amounts, and the only "rent" in the system is rent charged TO a driver.
--     Prorated into each period by day count in the app layer.
--
-- Seeding: seed_default_finance_categories(org) gives each fleet exactly the
-- twelve categories it has today, same keys as the old columns, so nothing
-- changes visually on day one. Backfill converts every existing
-- weekly_bookkeeping row into a period + its non-zero entries.
--
-- weekly_bookkeeping is deliberately LEFT IN PLACE and untouched — this
-- migration only ever reads it. Drop it in a later migration once the new
-- tables have been running in production for a while.
--
-- IDEMPOTENT: re-runnable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. org_finance_categories — the per-fleet chart of accounts.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_finance_categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Stable slug stored nowhere else, but kept human-readable so the accounting
  -- export and any future auto-fill can target a category by name.
  key             text NOT NULL,
  name            text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('income', 'expense')),
  icon            text NOT NULL DEFAULT 'dots',
  color           text NOT NULL DEFAULT '#2bbd7e',
  sort_order      integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  -- true for the two "Other" catch-alls: renameable, but not removable, so a
  -- fleet always has somewhere to put an uncategorised figure.
  is_system       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

CREATE INDEX IF NOT EXISTS idx_finance_categories_org_id
  ON org_finance_categories(organization_id);

-- -----------------------------------------------------------------------------
-- 2. bookkeeping_periods — period identity. Dates are arbitrary; period_type
--    only records what the operator MEANT, so the UI can label and default
--    sensibly and reports can group without guessing.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookkeeping_periods (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_type     text NOT NULL DEFAULT 'week'
                    CHECK (period_type IN ('week', 'month', 'custom')),
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  label           text NOT NULL,          -- e.g. "08 Jun - 14 Jun 2026", "July 2026"
  name            text,                   -- optional friendlier name
  notes           text,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'finalized')),
  -- Maintained by trigger from bookkeeping_entries. Never written by the app.
  total_income    numeric(12,2) NOT NULL DEFAULT 0,
  total_expenses  numeric(12,2) NOT NULL DEFAULT 0,
  net_profit      numeric(12,2) NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookkeeping_periods_date_order CHECK (end_date >= start_date),
  UNIQUE (organization_id, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS idx_bookkeeping_periods_org_id
  ON bookkeeping_periods(organization_id);
CREATE INDEX IF NOT EXISTS idx_bookkeeping_periods_start
  ON bookkeeping_periods(organization_id, start_date DESC);

-- -----------------------------------------------------------------------------
-- 3. bookkeeping_entries — one amount per category per period.
--    ON DELETE RESTRICT on the category is deliberate: a category that has been
--    used cannot be deleted out from under its history, only deactivated.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookkeeping_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_id       uuid NOT NULL REFERENCES bookkeeping_periods(id) ON DELETE CASCADE,
  category_id     uuid NOT NULL REFERENCES org_finance_categories(id) ON DELETE RESTRICT,
  -- Always positive; direction comes from the category's kind.
  amount          numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_bookkeeping_entries_org_id
  ON bookkeeping_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_bookkeeping_entries_period
  ON bookkeeping_entries(period_id);
CREATE INDEX IF NOT EXISTS idx_bookkeeping_entries_category
  ON bookkeeping_entries(category_id);

-- -----------------------------------------------------------------------------
-- 4. vehicle_recurring_costs — what a vehicle costs the FLEET to run.
--    vehicle_id NULL = a fleet-wide overhead (yard rent, fleet insurance).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicle_recurring_costs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vehicle_id      uuid REFERENCES vehicles(id) ON DELETE CASCADE,
  category_id     uuid NOT NULL REFERENCES org_finance_categories(id) ON DELETE RESTRICT,
  label           text NOT NULL,          -- "Lease — VW Passat"
  amount          numeric(12,2) NOT NULL CHECK (amount >= 0),
  -- "interval" is reserved in SQL, hence frequency.
  frequency       text NOT NULL DEFAULT 'monthly'
                    CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
  start_date      date NOT NULL DEFAULT CURRENT_DATE,
  end_date        date,                   -- NULL = open-ended
  is_active       boolean NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_recurring_costs_date_order
    CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_recurring_costs_org_id
  ON vehicle_recurring_costs(organization_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_recurring_costs_vehicle
  ON vehicle_recurring_costs(vehicle_id);

-- -----------------------------------------------------------------------------
-- 5. updated_at maintenance.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_bookkeeping_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_categories_updated_at ON org_finance_categories;
CREATE TRIGGER trg_finance_categories_updated_at
  BEFORE UPDATE ON org_finance_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_bookkeeping_updated_at();

DROP TRIGGER IF EXISTS trg_bookkeeping_periods_updated_at ON bookkeeping_periods;
CREATE TRIGGER trg_bookkeeping_periods_updated_at
  BEFORE UPDATE ON bookkeeping_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_bookkeeping_updated_at();

DROP TRIGGER IF EXISTS trg_bookkeeping_entries_updated_at ON bookkeeping_entries;
CREATE TRIGGER trg_bookkeeping_entries_updated_at
  BEFORE UPDATE ON bookkeeping_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_bookkeeping_updated_at();

DROP TRIGGER IF EXISTS trg_vehicle_recurring_costs_updated_at ON vehicle_recurring_costs;
CREATE TRIGGER trg_vehicle_recurring_costs_updated_at
  BEFORE UPDATE ON vehicle_recurring_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_bookkeeping_updated_at();

-- -----------------------------------------------------------------------------
-- 6. Period totals, maintained from the entries so they cannot drift.
--    (weekly_bookkeeping stored totals that the editor and the dashboard each
--    recomputed differently — this removes that whole class of bug.)
-- -----------------------------------------------------------------------------
-- Recompute one period's stored totals from its entries.
CREATE OR REPLACE FUNCTION public.refresh_bookkeeping_period_totals(p_period uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_period IS NULL THEN
    RETURN;
  END IF;

  UPDATE bookkeeping_periods p
  SET total_income   = COALESCE(agg.income, 0),
      total_expenses = COALESCE(agg.expenses, 0),
      net_profit     = COALESCE(agg.income, 0) - COALESCE(agg.expenses, 0)
  FROM (
    SELECT
      SUM(e.amount) FILTER (WHERE c.kind = 'income')  AS income,
      SUM(e.amount) FILTER (WHERE c.kind = 'expense') AS expenses
    FROM bookkeeping_entries e
    JOIN org_finance_categories c ON c.id = e.category_id
    WHERE e.period_id = p_period
  ) agg
  WHERE p.id = p_period;
END;
$$;

-- Branch on TG_OP rather than COALESCE(NEW.…, OLD.…): in PL/pgSQL, NEW is
-- unassigned during DELETE and touching NEW.period_id there raises
-- "record new is not assigned yet", which would break every entry deletion.
CREATE OR REPLACE FUNCTION public.recalc_bookkeeping_period_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_bookkeeping_period_totals(OLD.period_id);
    RETURN NULL;
  END IF;

  PERFORM public.refresh_bookkeeping_period_totals(NEW.period_id);

  -- An entry moved between periods leaves the old one stale too.
  IF TG_OP = 'UPDATE' AND OLD.period_id IS DISTINCT FROM NEW.period_id THEN
    PERFORM public.refresh_bookkeeping_period_totals(OLD.period_id);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookkeeping_entries_recalc ON bookkeeping_entries;
CREATE TRIGGER trg_bookkeeping_entries_recalc
  AFTER INSERT OR UPDATE OR DELETE ON bookkeeping_entries
  FOR EACH ROW EXECUTE FUNCTION public.recalc_bookkeeping_period_totals();

-- -----------------------------------------------------------------------------
-- 7. Autostamp organization_id on insert (same helper as other tenant tables).
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_org_id ON org_finance_categories;
CREATE TRIGGER set_org_id
  BEFORE INSERT ON org_finance_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

DROP TRIGGER IF EXISTS set_org_id ON bookkeeping_periods;
CREATE TRIGGER set_org_id
  BEFORE INSERT ON bookkeeping_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

DROP TRIGGER IF EXISTS set_org_id ON bookkeeping_entries;
CREATE TRIGGER set_org_id
  BEFORE INSERT ON bookkeeping_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

DROP TRIGGER IF EXISTS set_org_id ON vehicle_recurring_costs;
CREATE TRIGGER set_org_id
  BEFORE INSERT ON vehicle_recurring_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

-- -----------------------------------------------------------------------------
-- 8. RLS — admin-only, matching weekly_bookkeeping's existing policy exactly.
-- -----------------------------------------------------------------------------
ALTER TABLE org_finance_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookkeeping_periods      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookkeeping_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_recurring_costs  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage finance categories in org" ON org_finance_categories;
CREATE POLICY "Admins manage finance categories in org"
  ON org_finance_categories FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins manage bookkeeping periods in org" ON bookkeeping_periods;
CREATE POLICY "Admins manage bookkeeping periods in org"
  ON bookkeeping_periods FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins manage bookkeeping entries in org" ON bookkeeping_entries;
CREATE POLICY "Admins manage bookkeeping entries in org"
  ON bookkeeping_entries FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins manage vehicle recurring costs in org" ON vehicle_recurring_costs;
CREATE POLICY "Admins manage vehicle recurring costs in org"
  ON vehicle_recurring_costs FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- -----------------------------------------------------------------------------
-- 9. Seeder — EXACTLY the twelve categories the app hardcodes today, with the
--    same keys as the old weekly_bookkeeping columns (so the backfill and the
--    QuickBooks/Xero export line up) and the same colours/icons the editor
--    already renders. Nothing changes visually for an existing fleet.
--    Idempotent per org (skips orgs that already have rows).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_finance_categories(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.org_finance_categories WHERE organization_id = p_org) THEN
    RETURN;
  END IF;

  INSERT INTO public.org_finance_categories
    (organization_id, key, name, kind, icon, color, sort_order, is_system)
  VALUES
    -- Income — colours match the editor's stacked income bar.
    (p_org, 'uber_earnings',  'Uber',          'income',  'vehicle', '#a78bfa', 0, false),
    (p_org, 'bolt_earnings',  'Bolt',          'income',  'vehicle', '#34d399', 1, false),
    (p_org, 'ecabs_earnings', 'eCabs',         'income',  'vehicle', '#f5b54a', 2, false),
    (p_org, 'other_earnings', 'Other',         'income',  'dots',    '#2bbd7e', 3, true),
    -- Expenses — icons match the editor's expense grid.
    (p_org, 'employees',      'Employees',     'expense', 'staff',   '#38bdf8', 0, false),
    (p_org, 'repairs',        'Repairs',       'expense', 'wrench',  '#fb923c', 1, false),
    (p_org, 'insurance',      'Insurance',     'expense', 'doc',     '#a78bfa', 2, false),
    (p_org, 'investments',    'Investments',   'expense', 'chart',   '#34d399', 3, false),
    (p_org, 'vat',            'VAT',           'expense', 'book',    '#f472b6', 4, false),
    (p_org, 'rent',           'Rent',          'expense', 'vehicle', '#facc15', 5, false),
    (p_org, 'employee_tax',   'Employee tax',  'expense', 'settle',  '#22d3ee', 6, false),
    (p_org, 'other_expenses', 'Other',         'expense', 'dots',    '#64748b', 7, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_default_finance_categories(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 10. Seed on org creation. Done as an AFTER INSERT trigger rather than by
--     recreating create_organization_with_owner(), which five earlier
--     migrations already extend — redefining it here would silently drop
--     whichever of those ran last.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_finance_categories_on_org_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_default_finance_categories(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_finance_categories ON organizations;
CREATE TRIGGER trg_seed_finance_categories
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_finance_categories_on_org_insert();

-- -----------------------------------------------------------------------------
-- 11. Backfill — every existing fleet gets the default categories.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_default_finance_categories(r.id);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 12. Backfill — convert every weekly_bookkeeping row into a period. All of
--     them are weeks by definition. Totals are recomputed by trigger once the
--     entries land, so they are not copied here.
-- -----------------------------------------------------------------------------
INSERT INTO bookkeeping_periods
  (organization_id, period_type, start_date, end_date, label, name, notes, created_by, created_at)
SELECT
  wb.organization_id,
  'week',
  wb.week_start,
  wb.week_end,
  wb.week_label,
  wb.period_name,
  wb.notes,
  wb.created_by,
  wb.created_at
FROM weekly_bookkeeping wb
ON CONFLICT (organization_id, start_date, end_date) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 13. Backfill — one entry per non-zero column. Zero columns are skipped: the
--     UI renders every active category regardless and treats a missing entry
--     as 0, so storing twelve rows per period would be noise.
-- -----------------------------------------------------------------------------
INSERT INTO bookkeeping_entries (organization_id, period_id, category_id, amount)
SELECT p.organization_id, p.id, c.id, v.amount
FROM weekly_bookkeeping wb
JOIN bookkeeping_periods p
  ON  p.organization_id = wb.organization_id
  AND p.start_date      = wb.week_start
  AND p.end_date        = wb.week_end
CROSS JOIN LATERAL (VALUES
  ('uber_earnings',  wb.uber_earnings),
  ('bolt_earnings',  wb.bolt_earnings),
  ('ecabs_earnings', wb.ecabs_earnings),
  ('other_earnings', wb.other_earnings),
  ('employees',      wb.employees),
  ('repairs',        wb.repairs),
  ('insurance',      wb.insurance),
  ('investments',    wb.investments),
  ('vat',            wb.vat),
  ('rent',           wb.rent),
  ('employee_tax',   wb.employee_tax),
  ('other_expenses', wb.other_expenses)
) AS v(key, amount)
JOIN org_finance_categories c
  ON c.organization_id = wb.organization_id AND c.key = v.key
WHERE v.amount IS NOT NULL AND v.amount <> 0
ON CONFLICT (period_id, category_id) DO NOTHING;

SELECT 'Flexible bookkeeping (categories, periods, entries, vehicle costs) installed.' AS message;
