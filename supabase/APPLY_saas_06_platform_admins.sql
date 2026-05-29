-- =============================================================================
-- APPLY: Phase 6 — platform_admins (run against production Supabase)
-- =============================================================================
-- Idempotent. Wrapped in a transaction. Creates the platform_admins allow-list,
-- the is_platform_admin() helper + RLS, and seeds the existing Default Fleet
-- admin(s) as the first platform admin(s).
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_admins (user_id)
SELECT user_id
FROM memberships
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND role = 'admin'
ON CONFLICT (user_id) DO NOTHING;

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

DROP POLICY IF EXISTS "Users can view their own platform admin row" ON platform_admins;
CREATE POLICY "Users can view their own platform admin row"
  ON platform_admins FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.platform_admins TO authenticated;

COMMIT;

-- Verify: should list the seeded platform admin(s) with their email.
SELECT pa.user_id, u.email
FROM platform_admins pa
JOIN users u ON u.id = pa.user_id;
