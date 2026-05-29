-- =============================================================================
-- SAAS MIGRATION — PHASE 1: Organizations & Memberships
-- =============================================================================
-- Turns the single-tenant fleet dashboard into a multi-tenant SaaS foundation.
--
-- Model: multi-fleet membership.
--   * organizations  = a fleet (tenant)
--   * memberships     = which users belong to which fleet, and their role there
--
-- Role moves OUT of users (global) and INTO memberships (per-fleet), so an owner
-- can belong to several fleets with different roles. The users table keeps the
-- single auth identity + profile fields.
--
-- This migration is IDEMPOTENT and BACKFILL-SAFE: it can run on a fresh empty DB
-- (seed/backfill become no-ops) or on a copy that still holds the old fleet's
-- data (existing users are migrated into a default seed organization).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- Deterministic seed-org id so later migrations (Phase 2 backfill) can reference
-- the same default organization without a lookup.
-- -----------------------------------------------------------------------------
-- Default organization id: 00000000-0000-0000-0000-000000000001

-- =============================================================================
-- ORGANIZATIONS (one row per fleet / tenant)
-- =============================================================================
CREATE TABLE IF NOT EXISTS organizations (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name               TEXT NOT NULL,
  slug               TEXT NOT NULL UNIQUE,
  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'suspended', 'cancelled')),
  -- Billing (populated in Phase 5; nullable for now)
  stripe_customer_id TEXT UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);

-- =============================================================================
-- MEMBERSHIPS (user x organization x role)
-- =============================================================================
-- Reuses the existing user_role enum ('admin','staff','driver').
CREATE TABLE IF NOT EXISTS memberships (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            user_role NOT NULL DEFAULT 'driver',
  also_staff      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_organization_id ON memberships(organization_id);
CREATE INDEX IF NOT EXISTS idx_memberships_role ON memberships(role);

-- updated_at triggers (reuses update_updated_at_column() from base schema)
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_memberships_updated_at ON memberships;
CREATE TRIGGER update_memberships_updated_at
  BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SEED DEFAULT ORGANIZATION + BACKFILL EXISTING USERS
-- =============================================================================
-- Create the seed org only if there are existing users to home, OR always create
-- it as the bootstrap tenant. Safe to keep on a fresh DB (it just sits empty).
INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Fleet', 'default')
ON CONFLICT (id) DO NOTHING;

-- Migrate every existing user into the default org, preserving their role and
-- also_staff flag. No-op on a fresh DB (no users yet).
INSERT INTO memberships (organization_id, user_id, role, also_staff)
SELECT
  '00000000-0000-0000-0000-000000000001',
  u.id,
  u.role,
  COALESCE(u.also_staff, FALSE)
FROM users u
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- NOTE: users.role and users.also_staff are intentionally LEFT IN PLACE for now.
-- They are deprecated (memberships is the source of truth going forward) but kept
-- to avoid breaking the existing app until Phase 4 (app-layer) lands. A later
-- cleanup migration can drop them once all reads go through memberships.

-- =============================================================================
-- MEMBERSHIP HELPER (SECURITY DEFINER — bypasses RLS to avoid recursion)
-- =============================================================================
-- Returns the set of organization ids the calling user belongs to.
-- Because policies on the `memberships` table itself need to reference
-- memberships, a normal subquery would cause infinite RLS recursion. A
-- SECURITY DEFINER function reads the table with RLS bypassed, breaking the
-- cycle. This is the single source of truth reused by Phase 3 policies too.
CREATE OR REPLACE FUNCTION public.current_user_orgs()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.memberships WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.current_user_orgs() TO authenticated;

-- =============================================================================
-- RLS ON THE NEW TABLES
-- =============================================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships   ENABLE ROW LEVEL SECURITY;

-- Members can see organizations they belong to.
DROP POLICY IF EXISTS "Members can view their organizations" ON organizations;
CREATE POLICY "Members can view their organizations"
  ON organizations FOR SELECT
  TO authenticated
  USING (id IN (SELECT public.current_user_orgs()));

-- Members can see membership rows within orgs they belong to (needed to resolve
-- roles / list teammates). Uses the SECURITY DEFINER helper to avoid recursion.
DROP POLICY IF EXISTS "Members can view memberships in their orgs" ON memberships;
CREATE POLICY "Members can view memberships in their orgs"
  ON memberships FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT public.current_user_orgs()));

SELECT 'Phase 1 complete: organizations + memberships created and backfilled.' AS message;
