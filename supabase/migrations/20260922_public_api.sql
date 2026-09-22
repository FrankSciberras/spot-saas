-- =============================================================================
-- PUBLIC REST API — keys, scopes, per-plan rate limits and request logging
-- =============================================================================
-- Larger fleets keep asking to push their own data in and pull it back out:
-- sync drivers from an HR system, mirror vehicles into a maintenance tool, post
-- fuel spend straight into the ledger from a card feed. Until now the only way
-- in was the cookie-authenticated dashboard API, which is not usable from
-- another server.
--
-- This migration adds a proper machine-to-machine surface:
--
--   * api_keys          — long-lived bearer credentials, ONE per integration.
--                         Only a SHA-256 hash of the secret is ever stored, so
--                         a database leak does not hand out working keys. Each
--                         key carries its own scope list, optional IP allow-list
--                         and optional expiry.
--   * api_rate_limits   — fixed-window counters (per minute + per day) consumed
--                         atomically in Postgres, so the limit holds even with
--                         several app instances behind the load balancer.
--   * api_request_logs  — one line per API call (no bodies, no secrets) for
--                         troubleshooting and abuse investigation.
--   * plans.api_*       — API access is a PAID TIER benefit. The entitlement
--                         (on/off, per-minute, per-day, key count) lives on the
--                         plan row so the platform admin edits it at /admin
--                         like every other plan limit, instead of it being
--                         hardcoded in the app.
--
-- Also: drivers.user_id becomes NULLABLE. The app has long handled drivers with
-- no linked login ("legacy drivers with no linked account" in the delete path),
-- but the column still refused them. The API needs to create driver RECORDS
-- from an external system without minting a Rovora account for each person.
--
-- IDEMPOTENT: re-runnable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Plan entitlements. NULL rate limits mean "unlimited"; api_enabled = false
--    (the default) means the tier has no API access at all.
-- -----------------------------------------------------------------------------
ALTER TABLE plans ADD COLUMN IF NOT EXISTS api_enabled           boolean NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS api_rate_limit_per_min integer;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS api_rate_limit_per_day integer;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS api_max_keys           integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN plans.api_enabled IS 'Does this tier include the public REST API?';
COMMENT ON COLUMN plans.api_rate_limit_per_min IS 'Requests per minute per API key. NULL = unlimited.';
COMMENT ON COLUMN plans.api_rate_limit_per_day IS 'Requests per day per API key. NULL = unlimited.';
COMMENT ON COLUMN plans.api_max_keys IS 'How many live API keys a fleet on this tier may hold.';

-- Seed the shipped catalogue: the API is a big-fleet feature. Starter and Pro
-- stay off; Fleet and Enterprise get it. The admin can change any of this.
UPDATE plans SET api_enabled = false, api_max_keys = 0,
                 api_rate_limit_per_min = NULL, api_rate_limit_per_day = NULL
  WHERE key IN ('starter', 'growth');

UPDATE plans SET api_enabled = true, api_max_keys = 5,
                 api_rate_limit_per_min = 120, api_rate_limit_per_day = 50000
  WHERE key = 'scale';

UPDATE plans SET api_enabled = true, api_max_keys = 25,
                 api_rate_limit_per_min = 600, api_rate_limit_per_day = 500000
  WHERE key = 'enterprise';

-- -----------------------------------------------------------------------------
-- 2. Drivers without a linked login. Multiple NULLs are allowed under the
--    existing UNIQUE(user_id), so one-account-per-driver still holds.
-- -----------------------------------------------------------------------------
ALTER TABLE drivers ALTER COLUMN user_id DROP NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. api_keys — the credentials themselves.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- What this key is for, e.g. "Payroll sync" — shown in the dashboard list.
  name            text NOT NULL,
  -- The first characters of the secret (e.g. 'rvk_live_7f2a9c31'), stored in
  -- clear so the operator can tell their keys apart. NOT enough to authenticate.
  key_prefix      text NOT NULL,
  -- SHA-256 of the FULL secret, hex. The secret itself is shown exactly once,
  -- at creation, and is not recoverable from this table.
  key_hash        text NOT NULL UNIQUE,
  -- Least privilege: a key can only do what is listed here. Values are the
  -- scope strings in lib/api/scopes.ts, e.g. 'drivers:read', 'vehicles:write'.
  scopes          text[] NOT NULL DEFAULT '{}',
  -- Optional extra hardening. Empty = callable from any address.
  allowed_ips     text[] NOT NULL DEFAULT '{}',
  -- Optional per-key ceilings, always clamped DOWN to the plan's limits so a
  -- key can be made stricter but never more permissive than the tier allows.
  rate_limit_per_min integer,
  rate_limit_per_day integer,
  expires_at      timestamptz,
  revoked_at      timestamptz,
  last_used_at    timestamptz,
  last_used_ip    text,
  request_count   bigint NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(organization_id);
-- The authentication hot path: hash lookup, live keys only.
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Fleet ADMINS may read their own fleet's keys (never another fleet's, and
-- never the secret — only the hash is stored, and the app selects columns
-- explicitly). Writes go through the service-role server actions in
-- lib/actions/api-keys.ts, which re-check the role and the plan entitlement.
DROP POLICY IF EXISTS "Fleet admins view own API keys" ON api_keys;
CREATE POLICY "Fleet admins view own API keys"
  ON api_keys FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = api_keys.organization_id
        AND m.user_id = auth.uid()
        AND m.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Platform admins view all API keys" ON api_keys;
CREATE POLICY "Platform admins view all API keys"
  ON api_keys FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = auth.uid()));

-- Column-level lockdown, under the RLS policies above. RLS decides WHICH rows a
-- fleet admin sees; these grants decide which COLUMNS, and `key_hash` is not one
-- of them — nobody needs to read it but the server-side authenticator, which
-- uses the service role. Writes are removed entirely: keys are created and
-- revoked only through the server actions in lib/actions/api-keys.ts, which
-- re-check the admin role and the plan entitlement first.
REVOKE ALL ON api_keys FROM anon;
REVOKE ALL ON api_keys FROM authenticated;
GRANT SELECT (
  id, organization_id, name, key_prefix, scopes, allowed_ips,
  rate_limit_per_min, rate_limit_per_day, expires_at, revoked_at,
  last_used_at, last_used_ip, request_count, created_by, created_at, updated_at
) ON api_keys TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. api_rate_limits — fixed-window counters, one row per (key, bucket, window).
--    Service-role only: RLS on with NO policy means no client can read or write
--    these, which is exactly what we want for a counter that gates access.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_rate_limits (
  key_id       uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  bucket       text NOT NULL CHECK (bucket IN ('minute', 'day')),
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, bucket, window_start)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window ON api_rate_limits(window_start);

ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

-- RLS with no policy already denies everything; the grants go too, so a
-- client cannot so much as probe the counter that gates its own access.
REVOKE ALL ON api_rate_limits FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. api_request_logs — an audit trail of API calls. No request or response
--    bodies are stored, so a log leak cannot expose fleet data or secrets.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_request_logs (
  id              bigserial PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  key_id          uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  method          text NOT NULL,
  path            text NOT NULL,
  status          integer NOT NULL,
  duration_ms     integer,
  ip              text,
  user_agent      text,
  -- Machine-readable failure reason ('invalid_key', 'rate_limited', …) so abuse
  -- patterns can be spotted without reading every line.
  error_code      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_logs_org_time ON api_request_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_key_time ON api_request_logs(key_id, created_at DESC);

ALTER TABLE api_request_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fleet admins view own API logs" ON api_request_logs;
CREATE POLICY "Fleet admins view own API logs"
  ON api_request_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = api_request_logs.organization_id
        AND m.user_id = auth.uid()
        AND m.role = 'admin'
    )
  );

-- Read-only for clients: log lines are written by the server, never by a user.
REVOKE ALL ON api_request_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON api_request_logs FROM authenticated;

-- -----------------------------------------------------------------------------
-- 6. api_rate_limit_consume — the atomic gate.
--
-- Increments the minute AND day counters for a key in one statement each and
-- reports whether the call is within both ceilings. Doing this in Postgres (not
-- in app memory) is what makes the limit real: two app containers, or a restart
-- mid-minute, cannot hand out extra requests.
--
-- NULL limit = unlimited for that bucket. A denied call still consumes, which
-- is the standard fixed-window behaviour — hammering a blocked key keeps it
-- blocked for the rest of the window rather than letting it probe for free.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api_rate_limit_consume(
  p_key_id        uuid,
  p_minute_limit  integer,
  p_day_limit     integer
)
RETURNS TABLE (
  allowed       boolean,
  minute_count  integer,
  day_count     integer,
  minute_reset  timestamptz,
  day_reset     timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minute_start timestamptz := date_trunc('minute', now());
  v_day_start    timestamptz := date_trunc('day', now());
  v_minute_count integer;
  v_day_count    integer;
BEGIN
  INSERT INTO api_rate_limits (key_id, bucket, window_start, count)
  VALUES (p_key_id, 'minute', v_minute_start, 1)
  ON CONFLICT (key_id, bucket, window_start)
  DO UPDATE SET count = api_rate_limits.count + 1
  RETURNING count INTO v_minute_count;

  INSERT INTO api_rate_limits (key_id, bucket, window_start, count)
  VALUES (p_key_id, 'day', v_day_start, 1)
  ON CONFLICT (key_id, bucket, window_start)
  DO UPDATE SET count = api_rate_limits.count + 1
  RETURNING count INTO v_day_count;

  -- Opportunistic housekeeping: ~1 call in 500 sweeps yesterday's windows away,
  -- so the counter table stays small without needing a scheduled job.
  IF random() < 0.002 THEN
    DELETE FROM api_rate_limits WHERE window_start < now() - interval '2 days';
  END IF;

  RETURN QUERY SELECT
    (p_minute_limit IS NULL OR v_minute_count <= p_minute_limit)
      AND (p_day_limit IS NULL OR v_day_count <= p_day_limit),
    v_minute_count,
    v_day_count,
    v_minute_start + interval '1 minute',
    v_day_start + interval '1 day';
END;
$$;

-- Only the service role (the API route handlers) may consume the limiter.
REVOKE ALL ON FUNCTION api_rate_limit_consume(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION api_rate_limit_consume(uuid, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION api_rate_limit_consume(uuid, integer, integer) TO service_role;

-- -----------------------------------------------------------------------------
-- 7. updated_at trigger for api_keys (reuses the existing helper).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS trg_api_keys_updated_at ON api_keys;
    CREATE TRIGGER trg_api_keys_updated_at
      BEFORE UPDATE ON api_keys
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
