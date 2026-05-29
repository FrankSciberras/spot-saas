-- =============================================================================
-- SAAS MIGRATION — PHASE 6: Platform Admins (the SaaS owner tier)
-- =============================================================================
-- Introduces the THIRD identity tier, sitting ABOVE per-fleet memberships:
--
--   Tier 1  Platform admin  — the SaaS operator (us). Sees/manages ALL fleets,
--                             users and plans. Lives at /admin.
--   Tier 2  Fleet operator  — admin/staff membership in one fleet. Lives at
--                             /fleet (formerly /admin).
--   Tier 3  Driver          — driver membership. Lives at /driver.
--
-- Platform admin is deliberately NOT a membership role (the role enum stays
-- 'admin'|'staff'|'driver', scoped per-fleet). It is a separate allow-list table
-- so it cannot be granted accidentally through normal fleet membership flows.
--
-- Cross-org reads in the platform dashboard go through the service-role client
-- (createAdminClient), which bypasses RLS — so this table's RLS only needs to
-- let a user confirm their OWN platform-admin status from a normal session.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- SEED: promote the existing Default Fleet admin(s) to platform admin.
-- =============================================================================
-- On the migrated single-fleet DB the only admin of the Default Fleet is the
-- original owner (Frank) — this makes them the first platform admin. No-op on a
-- fresh DB with no Default Fleet admins.
INSERT INTO platform_admins (user_id)
SELECT user_id
FROM memberships
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND role = 'admin'
ON CONFLICT (user_id) DO NOTHING;

-- =============================================================================
-- HELPER + RLS
-- =============================================================================
-- SECURITY DEFINER check reusable by future RLS policies that want to grant
-- platform admins broad access without recursive lookups.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- A user may read ONLY their own platform-admin row (confirm own status).
DROP POLICY IF EXISTS "Users can view their own platform admin row" ON platform_admins;
CREATE POLICY "Users can view their own platform admin row"
  ON platform_admins FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

SELECT 'Phase 6 complete: platform_admins created and seeded.' AS message;
