-- =============================================================================
-- PARTS & INVENTORY MODULE — stock of spare parts + usage linked to services
-- =============================================================================
-- New per-fleet module (catalog key 'parts'): operators keep a stock list of
-- parts (filters, tyres, pads…) with quantities, low-stock thresholds and unit
-- costs, and log usage against a vehicle (and optionally a service record),
-- which decrements stock. Mirrors the vehicle_services tenancy + RLS pattern
-- (is_org_member / is_org_admin_or_staff / is_org_admin helpers) and the
-- set_default_organization_id() autostamp used by other tenant tables.
-- IDEMPOTENT: re-runnable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- parts — the stock list.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  part_number     text,                              -- supplier / OEM reference
  category        text,                              -- free text, e.g. 'Filters'
  quantity        integer NOT NULL DEFAULT 0,        -- units currently in stock
  min_quantity    integer NOT NULL DEFAULT 0,        -- low-stock alert threshold
  unit_cost       numeric(10,2),                     -- cost per unit (EUR)
  supplier        text,
  location        text,                              -- shelf / garage / van
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parts_org_id ON parts(organization_id);

-- -----------------------------------------------------------------------------
-- part_usage — a withdrawal from stock, optionally tied to a vehicle/service.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS part_usage (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  part_id          uuid NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  vehicle_id       uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  service_id       uuid REFERENCES vehicle_services(id) ON DELETE SET NULL,
  quantity         integer NOT NULL CHECK (quantity > 0),
  unit_cost_at_use numeric(10,2),                    -- snapshot of parts.unit_cost
  used_at          date NOT NULL DEFAULT CURRENT_DATE,
  notes            text,
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_usage_org_id ON part_usage(organization_id);
CREATE INDEX IF NOT EXISTS idx_part_usage_part_id ON part_usage(part_id);
CREATE INDEX IF NOT EXISTS idx_part_usage_vehicle_id ON part_usage(vehicle_id);

-- -----------------------------------------------------------------------------
-- updated_at maintenance on parts.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_parts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parts_updated_at ON parts;
CREATE TRIGGER trg_parts_updated_at
  BEFORE UPDATE ON parts
  FOR EACH ROW EXECUTE FUNCTION public.set_parts_updated_at();

-- -----------------------------------------------------------------------------
-- Autostamp organization_id on insert (same helper as the other tenant tables).
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_org_id ON parts;
CREATE TRIGGER set_org_id
  BEFORE INSERT ON parts
  FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

DROP TRIGGER IF EXISTS set_org_id ON part_usage;
CREATE TRIGGER set_org_id
  BEFORE INSERT ON part_usage
  FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

-- -----------------------------------------------------------------------------
-- RLS — same shape as vehicle_services: members read, staff write, admins delete.
-- -----------------------------------------------------------------------------
ALTER TABLE parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE part_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View parts in org" ON parts;
CREATE POLICY "View parts in org" ON parts
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Staff insert parts in org" ON parts;
CREATE POLICY "Staff insert parts in org" ON parts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_staff(organization_id));

DROP POLICY IF EXISTS "Staff update parts in org" ON parts;
CREATE POLICY "Staff update parts in org" ON parts
  FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_staff(organization_id))
  WITH CHECK (public.is_org_admin_or_staff(organization_id));

DROP POLICY IF EXISTS "Admins delete parts in org" ON parts;
CREATE POLICY "Admins delete parts in org" ON parts
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "View part usage in org" ON part_usage;
CREATE POLICY "View part usage in org" ON part_usage
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Staff insert part usage in org" ON part_usage;
CREATE POLICY "Staff insert part usage in org" ON part_usage
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_staff(organization_id));

DROP POLICY IF EXISTS "Admins delete part usage in org" ON part_usage;
CREATE POLICY "Admins delete part usage in org" ON part_usage
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

SELECT 'Parts & inventory tables installed.' AS message;
