-- =============================================================================
-- SAAS MULTI-TENANT ISOLATION TEST
-- =============================================================================
-- Proves that org-scoped RLS (Phase 3) actually isolates fleets from each other.
-- Seeds two fleets (A and B) with overlapping data, then impersonates users via
-- the same JWT-claims mechanism Supabase uses at runtime (auth.uid() reads
-- request.jwt.claims->>'sub') and asserts cross-tenant reads return ZERO rows.
--
-- Runs in a single transaction and ROLLS BACK at the end, leaving no residue.
-- Any isolation failure aborts with a clear RAISE EXCEPTION.
--
-- PREREQUISITES: base schema (saas_install.sql) + the three 20260529_saas_*
-- migrations must already be applied to the target database.
--
-- USAGE (against local supabase):
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/saas_isolation_test.sql
-- =============================================================================

BEGIN;

-- Run the seed section with RLS bypassed (as table owner / superuser).
-- -----------------------------------------------------------------------------
-- Fixed UUIDs for readability
--   org A         = a0000000-0000-0000-0000-0000000000a0
--   org B         = b0000000-0000-0000-0000-0000000000b0
--   admin A user  = a1...  driver A user = a2...
--   admin B user  = b1...
-- -----------------------------------------------------------------------------

-- auth.users (FK target for public.users). Minimal viable insert for local dev.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('a1000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a@test.local',  '', now(), now(), now()),
  ('a2000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'driver-a@test.local', '', now(), now(), now()),
  ('b1000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-b@test.local',  '', now(), now(), now()),
  -- New self-serve signup user: has an auth identity but NO public.users profile
  -- and NO membership yet. Exercises the onboarding RPC below.
  ('c1000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'newuser-c@test.local', '', now(), now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, role) VALUES
  ('a1000000-0000-0000-0000-0000000000a1', 'admin-a@test.local',  'admin'),
  ('a2000000-0000-0000-0000-0000000000a2', 'driver-a@test.local', 'driver'),
  ('b1000000-0000-0000-0000-0000000000b1', 'admin-b@test.local',  'admin')
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, name, slug) VALUES
  ('a0000000-0000-0000-0000-0000000000a0', 'Fleet A', 'fleet-a'),
  ('b0000000-0000-0000-0000-0000000000b0', 'Fleet B', 'fleet-b')
ON CONFLICT (id) DO NOTHING;

INSERT INTO memberships (organization_id, user_id, role) VALUES
  ('a0000000-0000-0000-0000-0000000000a0', 'a1000000-0000-0000-0000-0000000000a1', 'admin'),
  ('a0000000-0000-0000-0000-0000000000a0', 'a2000000-0000-0000-0000-0000000000a2', 'driver'),
  ('b0000000-0000-0000-0000-0000000000b0', 'b1000000-0000-0000-0000-0000000000b1', 'admin')
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Tenant data in each fleet -----------------------------------------------------
INSERT INTO vehicles (id, organization_id, registration_number, make, model) VALUES
  ('a0000000-0000-0000-0000-00000000aaa1', 'a0000000-0000-0000-0000-0000000000a0', 'A-001', 'Toyota', 'Yaris'),
  ('b0000000-0000-0000-0000-00000000bbb1', 'b0000000-0000-0000-0000-0000000000b0', 'B-001', 'Toyota', 'Yaris');

-- Same registration in both fleets must be allowed (per-org uniqueness check).
INSERT INTO vehicles (id, organization_id, registration_number, make, model) VALUES
  ('a0000000-0000-0000-0000-00000000aaa2', 'a0000000-0000-0000-0000-0000000000a0', 'SHARED-REG', 'Kia', 'Niro'),
  ('b0000000-0000-0000-0000-00000000bbb2', 'b0000000-0000-0000-0000-0000000000b0', 'SHARED-REG', 'Kia', 'Niro');

INSERT INTO drivers (id, organization_id, user_id, full_name) VALUES
  ('a0000000-0000-0000-0000-00000000ad01', 'a0000000-0000-0000-0000-0000000000a0', 'a2000000-0000-0000-0000-0000000000a2', 'Driver A');

INSERT INTO driver_settlements (id, organization_id, driver_id, week_start, week_end, week_label, status) VALUES
  ('a0000000-0000-0000-0000-00000000a501', 'a0000000-0000-0000-0000-0000000000a0', 'a0000000-0000-0000-0000-00000000ad01', '2026-01-05', '2026-01-11', 'Wk A', 'finalized');

INSERT INTO app_settings (organization_id, key, value) VALUES
  ('a0000000-0000-0000-0000-0000000000a0', 'feature_x', 'true'::jsonb),
  ('b0000000-0000-0000-0000-0000000000b0', 'feature_x', 'false'::jsonb);

INSERT INTO audit_logs (organization_id, actor_role, action, entity_type, summary) VALUES
  ('a0000000-0000-0000-0000-0000000000a0', 'admin', 'create', 'vehicle', 'A created a vehicle'),
  ('b0000000-0000-0000-0000-0000000000b0', 'admin', 'create', 'vehicle', 'B created a vehicle');

-- =============================================================================
-- ASSERTIONS
-- =============================================================================
-- Helper to impersonate a user: switch to the authenticated role and set the JWT
-- sub claim. auth.uid() then resolves to that user inside RLS.
-- =============================================================================

-- ---- Acting as ADMIN A -------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

DO $$
BEGIN
  -- vehicles: sees exactly Fleet A's 2 vehicles, none of B's
  IF (SELECT count(*) FROM vehicles) <> 2 THEN
    RAISE EXCEPTION 'ADMIN A vehicles: expected 2, got %', (SELECT count(*) FROM vehicles);
  END IF;
  IF EXISTS (SELECT 1 FROM vehicles WHERE organization_id = 'b0000000-0000-0000-0000-0000000000b0') THEN
    RAISE EXCEPTION 'LEAK: Admin A can see Fleet B vehicles';
  END IF;

  -- app_settings: only Fleet A's row
  IF EXISTS (SELECT 1 FROM app_settings WHERE organization_id = 'b0000000-0000-0000-0000-0000000000b0') THEN
    RAISE EXCEPTION 'LEAK: Admin A can see Fleet B app_settings';
  END IF;

  -- audit_logs (admin-only): only Fleet A's
  IF (SELECT count(*) FROM audit_logs) <> 1 THEN
    RAISE EXCEPTION 'ADMIN A audit_logs: expected 1, got %', (SELECT count(*) FROM audit_logs);
  END IF;

  -- settlements: Fleet A's one row
  IF EXISTS (SELECT 1 FROM driver_settlements WHERE organization_id = 'b0000000-0000-0000-0000-0000000000b0') THEN
    RAISE EXCEPTION 'LEAK: Admin A can see Fleet B settlements';
  END IF;

  -- AUTO-STAMP (Phase 4): a single-org user inserting WITHOUT organization_id
  -- must have it auto-filled to their fleet by the set_org_id BEFORE INSERT
  -- trigger (and pass the RLS WITH CHECK that runs after the trigger).
  INSERT INTO vehicles (registration_number, make, model)
    VALUES ('AUTOSTAMP-A', 'Test', 'Trigger');
  IF NOT EXISTS (
    SELECT 1 FROM vehicles
    WHERE registration_number = 'AUTOSTAMP-A'
      AND organization_id = 'a0000000-0000-0000-0000-0000000000a0'
  ) THEN
    RAISE EXCEPTION 'AUTO-STAMP FAIL: insert without organization_id was not stamped to Fleet A';
  END IF;

  -- MEMBERSHIP INSERT (Phase 4f invite boundary): an org admin may add members
  -- to THEIR OWN fleet, but RLS WITH CHECK must block adding to any other fleet.
  -- Admin A adds admin-B's user into Fleet A -> allowed.
  INSERT INTO memberships (organization_id, user_id, role)
    VALUES ('a0000000-0000-0000-0000-0000000000a0', 'b1000000-0000-0000-0000-0000000000b1', 'driver');
  IF NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE organization_id = 'a0000000-0000-0000-0000-0000000000a0'
      AND user_id = 'b1000000-0000-0000-0000-0000000000b1'
  ) THEN
    RAISE EXCEPTION 'INVITE FAIL: Admin A could not add a member to their own Fleet A';
  END IF;
  -- Clean up so the added user does not pollute later per-user assertions.
  DELETE FROM memberships
    WHERE organization_id = 'a0000000-0000-0000-0000-0000000000a0'
      AND user_id = 'b1000000-0000-0000-0000-0000000000b1';

  RAISE NOTICE 'PASS: Admin A sees only Fleet A data (+ insert auto-stamped to Fleet A)';
END $$;

-- Admin A attempting to add a member to Fleet B must be blocked by RLS.
DO $$
DECLARE
  v_leaked BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO memberships (organization_id, user_id, role)
      VALUES ('b0000000-0000-0000-0000-0000000000b0', 'a1000000-0000-0000-0000-0000000000a1', 'driver');
    v_leaked := true;
  EXCEPTION WHEN insufficient_privilege THEN
    v_leaked := false;  -- expected: RLS WITH CHECK rejects cross-org membership
  END;
  IF v_leaked THEN
    RAISE EXCEPTION 'LEAK: Admin A inserted a membership into Fleet B';
  END IF;
  RAISE NOTICE 'PASS: Admin A blocked from adding members to Fleet B (invite boundary)';
END $$;

RESET ROLE;

-- ---- Acting as ADMIN B -------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"b1000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

DO $$
BEGIN
  IF (SELECT count(*) FROM vehicles) <> 2 THEN
    RAISE EXCEPTION 'ADMIN B vehicles: expected 2, got %', (SELECT count(*) FROM vehicles);
  END IF;
  IF EXISTS (SELECT 1 FROM vehicles WHERE organization_id = 'a0000000-0000-0000-0000-0000000000a0') THEN
    RAISE EXCEPTION 'LEAK: Admin B can see Fleet A vehicles';
  END IF;
  -- Admin B has no drivers/settlements
  IF (SELECT count(*) FROM driver_settlements) <> 0 THEN
    RAISE EXCEPTION 'LEAK: Admin B can see settlements (expected 0, got %)', (SELECT count(*) FROM driver_settlements);
  END IF;
  RAISE NOTICE 'PASS: Admin B sees only Fleet B data';
END $$;

RESET ROLE;

-- ---- Acting as DRIVER A ------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);

DO $$
BEGIN
  -- Driver A is a member of Fleet A: can view Fleet A vehicles, none of B's
  IF EXISTS (SELECT 1 FROM vehicles WHERE organization_id = 'b0000000-0000-0000-0000-0000000000b0') THEN
    RAISE EXCEPTION 'LEAK: Driver A can see Fleet B vehicles';
  END IF;
  -- Driver A can see their own finalized settlement
  IF (SELECT count(*) FROM driver_settlements) <> 1 THEN
    RAISE EXCEPTION 'Driver A settlements: expected 1 (own finalized), got %', (SELECT count(*) FROM driver_settlements);
  END IF;
  -- Driver A is NOT admin -> cannot see admin-only audit_logs
  IF (SELECT count(*) FROM audit_logs) <> 0 THEN
    RAISE EXCEPTION 'LEAK: Driver A can see audit_logs (admin-only), got %', (SELECT count(*) FROM audit_logs);
  END IF;
  RAISE NOTICE 'PASS: Driver A scoped correctly (own data, no admin tables, no Fleet B)';
END $$;

RESET ROLE;

-- ---- Acting as NEW SIGNUP USER C (self-serve onboarding) ---------------------
-- A brand-new user with an auth identity but no profile and no membership must
-- be able to bootstrap their own fleet via the SECURITY DEFINER onboarding RPC
-- (RLS has no org-INSERT policy for non-members). The RPC must also create the
-- missing public.users profile and make the caller an admin of the new org.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

DO $$
DECLARE
  v_new_org UUID;
  v_role    user_role;
BEGIN
  -- Pre-condition: user C belongs to nothing and has no profile.
  IF EXISTS (SELECT 1 FROM memberships WHERE user_id = 'c1000000-0000-0000-0000-0000000000c1') THEN
    RAISE EXCEPTION 'ONBOARDING PRECONDITION: user C already has a membership';
  END IF;

  -- Create the fleet through the RPC.
  v_new_org := public.create_organization_with_owner('Fleet C', NULL);
  IF v_new_org IS NULL THEN
    RAISE EXCEPTION 'ONBOARDING FAIL: RPC returned NULL org id';
  END IF;

  -- Profile must now exist.
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = 'c1000000-0000-0000-0000-0000000000c1') THEN
    RAISE EXCEPTION 'ONBOARDING FAIL: public.users profile was not created';
  END IF;

  -- Caller must be an admin member of the new org.
  SELECT role INTO v_role FROM memberships
    WHERE user_id = 'c1000000-0000-0000-0000-0000000000c1'
      AND organization_id = v_new_org;
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'ONBOARDING FAIL: creator is not admin (got %)', v_role;
  END IF;

  -- New admin sees their own fleet, and still none of A/B's data (RLS holds).
  IF EXISTS (SELECT 1 FROM vehicles WHERE organization_id IN
       ('a0000000-0000-0000-0000-0000000000a0','b0000000-0000-0000-0000-0000000000b0')) THEN
    RAISE EXCEPTION 'LEAK: new user C can see Fleet A/B vehicles';
  END IF;

  RAISE NOTICE 'PASS: self-serve onboarding created Fleet C with C as admin (isolated)';
END $$;

RESET ROLE;

DO $$ BEGIN RAISE NOTICE '==== ALL ISOLATION ASSERTIONS PASSED ===='; END $$;

ROLLBACK;
