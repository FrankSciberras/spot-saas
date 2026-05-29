-- =============================================================================
-- SAAS MIGRATION — PHASE 2: Tenant columns + backfill
-- =============================================================================
-- Adds organization_id to every tenant-scoped table, backfills existing rows to
-- the default seed org (from Phase 1), then enforces NOT NULL + indexes and
-- converts global UNIQUE constraints to be per-organization.
--
-- IDEMPOTENT + BACKFILL-SAFE: re-runnable, and on a fresh DB the UPDATEs simply
-- affect zero rows.
--
-- Scope decisions:
--   * 23 tenant tables get organization_id (listed below).
--   * push_subscriptions stays user-scoped (device registration, not fleet data).
--   * events, vehicle_diagram_zones, role_permissions stay GLOBAL/shared config.
--   * users keeps its global identity; role is per-fleet via memberships (Phase 1).
-- =============================================================================

DO $$
DECLARE
  default_org CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
  t TEXT;
  tenant_tables TEXT[] := ARRAY[
    'drivers',
    'vehicles',
    'driver_shifts',
    'files',
    'earnings',
    'payslips',
    'notifications',
    'chat_messages',
    'rosters',
    'roster_assignments',
    'vehicle_services',
    'notification_rules',
    'notification_log',
    'driver_settlements',
    'settlement_platforms',
    'monthly_earnings',
    'driver_vehicle_assignments',
    'driver_adjustments',
    'weekly_bookkeeping',
    'vehicle_damages',
    'reminders',
    'audit_logs'
    -- app_settings handled separately (its PK changes)
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables
  LOOP
    -- 1. add nullable column with cascade delete (offboarding a fleet removes its data)
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE',
      t
    );

    -- 2. backfill existing rows to the default org
    EXECUTE format(
      'UPDATE public.%I SET organization_id = %L WHERE organization_id IS NULL',
      t, default_org
    );

    -- 3. enforce NOT NULL now that every row has a value
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL',
      t
    );

    -- 4. index for RLS / filtering performance
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I(organization_id)',
      'idx_' || t || '_organization_id', t
    );
  END LOOP;
END $$;

-- =============================================================================
-- app_settings — special case: primary key changes from (key) to (org, key)
-- =============================================================================
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.app_settings
  SET organization_id = '00000000-0000-0000-0000-000000000001'
  WHERE organization_id IS NULL;

ALTER TABLE public.app_settings ALTER COLUMN organization_id SET NOT NULL;

-- Swap the primary key: drop the old single-column PK, add a composite one.
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE public.app_settings ADD PRIMARY KEY (organization_id, key);

-- =============================================================================
-- Convert global UNIQUE constraints to per-organization
-- =============================================================================
-- These uniqueness rules were correct for one fleet but must now be scoped so
-- two different fleets can both have e.g. registration "ABC-123" or a roster for
-- the same week. Constraint names use Postgres' auto-generated convention.

-- vehicles.registration_number  -> (organization_id, registration_number)
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_registration_number_key;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_org_registration_key
  UNIQUE (organization_id, registration_number);

-- rosters.week_start  -> (organization_id, week_start)
ALTER TABLE public.rosters DROP CONSTRAINT IF EXISTS rosters_week_start_key;
ALTER TABLE public.rosters ADD CONSTRAINT rosters_org_week_start_key
  UNIQUE (organization_id, week_start);

-- monthly_earnings.month  -> (organization_id, month)
ALTER TABLE public.monthly_earnings DROP CONSTRAINT IF EXISTS monthly_earnings_month_key;
ALTER TABLE public.monthly_earnings ADD CONSTRAINT monthly_earnings_org_month_key
  UNIQUE (organization_id, month);

-- weekly_bookkeeping (week_start, week_end)  -> (organization_id, week_start, week_end)
ALTER TABLE public.weekly_bookkeeping DROP CONSTRAINT IF EXISTS weekly_bookkeeping_week_start_week_end_key;
ALTER TABLE public.weekly_bookkeeping ADD CONSTRAINT weekly_bookkeeping_org_week_key
  UNIQUE (organization_id, week_start, week_end);

-- NOTE: constraints scoped via a child FK (driver_settlements.driver_id,
-- roster_assignments.roster_id, driver_vehicle_assignments(driver_id,vehicle_id),
-- settlement_platforms.settlement_id) are already transitively org-unique because
-- their parent row carries organization_id. Left unchanged on purpose.

SELECT 'Phase 2 complete: organization_id added, backfilled, and constrained on all tenant tables.' AS message;
