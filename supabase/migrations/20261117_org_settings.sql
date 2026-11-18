-- =============================================================================
-- FLEET SETTINGS + PERSONAL PREFERENCES (catalog in code, overrides in the DB)
-- =============================================================================
-- Until now every fleet setting was its own column on `organizations`, so each
-- new setting needed a migration. This works like org_modules instead:
--
--   * The MASTER LIST of settings — key, type, default, limits, which Settings
--     tab it lives on — is in code: lib/settings/catalog.ts.
--   * These tables store only the values someone CHANGED. No row = the
--     catalog default. Shipping a new setting needs NO migration and NO
--     backfill; every fleet just inherits its default until it changes it.
--
--   org_settings(organization_id, key, value)  — fleet-wide, set by admins
--   user_preferences(user_id, key, value)      — personal, set by each person
--
-- The app validates every value against the catalog before writing, and throws
-- away stored values that no longer validate (e.g. after a limit changes), so
-- an odd row can never break a page — it just falls back to the default.
--
-- SECURITY: writes are SERVICE-ROLE ONLY (lib/actions/settings.ts re-checks the
-- caller's role and scopes to their own fleet / their own user id). Browsers
-- may only READ their own fleet's settings and their own preferences.
--
-- The settings that already have their own organizations columns (shift
-- check, live tracking, speed limit, chat DMs, push prompt) stay where they
-- are — the driver app and crons read those columns directly.
--
-- IDEMPOTENT: safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. org_settings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_settings (
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Stable dotted key from lib/settings/catalog.ts, e.g. 'documents.expiry_warning_days'.
  key             text        NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$' AND char_length(key) <= 80),
  value           jsonb       NOT NULL CHECK (pg_column_size(value) <= 4096),
  updated_by      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, key)
);

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read their fleet settings" ON public.org_settings;
CREATE POLICY "Members read their fleet settings"
  ON public.org_settings FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

-- -----------------------------------------------------------------------------
-- 2. user_preferences
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  key        text        NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$' AND char_length(key) <= 80),
  value      jsonb       NOT NULL CHECK (pg_column_size(value) <= 4096),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "People read their own preferences" ON public.user_preferences;
CREATE POLICY "People read their own preferences"
  ON public.user_preferences FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 3. Documentation
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.org_settings IS 'Per-fleet setting OVERRIDES. No row = the default in lib/settings/catalog.ts. New settings need no migration.';
COMMENT ON TABLE public.user_preferences IS 'Per-person preference OVERRIDES (theme, landing page, …). No row = the default in lib/settings/catalog.ts.';

SELECT 'org_settings + user_preferences ready' AS message;
