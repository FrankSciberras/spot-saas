-- =============================================================================
-- ROVORA AI — FLEET ASSISTANT: per-tier monthly € budgets, rate limits, a spend
-- ledger and conversation history
-- =============================================================================
-- The in-dashboard assistant calls a paid LLM API on every question, so every
-- fleet gets a hard monthly spending allowance (in euros) that depends on its
-- plan, plus per-person rate limits so one person can't burn the whole fleet's
-- allowance in an afternoon.
--
--   * plans.ai_*              — the allowance + limits per tier, edited by the
--                               platform admin at /admin → Packages like every
--                               other plan limit.
--   * assistant_usage         — the spend ledger: ONE row per question with its
--                               token counts and its cost in euros. The monthly
--                               allowance is the sum of this table, so it can't
--                               drift from what was actually spent.
--   * assistant_usage_begin() — the atomic gate. Locks the fleet, checks the
--                               per-minute + per-day limits for the person and
--                               the month's spend for the fleet, and RESERVES
--                               the most a question may cost before the LLM is
--                               called. The app then records the real cost. Two
--                               questions at the same moment can't both squeeze
--                               under the cap, and a crashed request still
--                               counts (at its reserved amount).
--   * assistant_conversations / assistant_messages — chat history, readable
--                               only by the person who asked. 90-day retention.
--
-- Trial fleets aren't a plan row; their allowance lives in the app
-- (lib/assistant/limits.ts) and can be overridden with env vars.
--
-- IDEMPOTENT: re-runnable. Re-running never overwrites allowances an admin has
-- already edited (the seed only runs when the columns are first added).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Plan entitlements
--    ai_enabled               does this tier include Rovora AI at all
--    ai_monthly_budget_eur    what one fleet on this tier may spend per calendar
--                             month (fleet time zone). 0 = nothing.
--    ai_rate_limit_per_min    questions per minute, per person
--    ai_rate_limit_per_day    questions per day, per person
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plans' AND column_name = 'ai_monthly_budget_eur'
  ) THEN
    ALTER TABLE plans ADD COLUMN ai_enabled            boolean       NOT NULL DEFAULT true;
    ALTER TABLE plans ADD COLUMN ai_monthly_budget_eur numeric(10,2) NOT NULL DEFAULT 1.00;
    ALTER TABLE plans ADD COLUMN ai_rate_limit_per_min integer       NOT NULL DEFAULT 6;
    ALTER TABLE plans ADD COLUMN ai_rate_limit_per_day integer       NOT NULL DEFAULT 60;

    -- Seed the shipped tiers. A typical question costs well under 1 cent, so
    -- €1 ≈ 150+ questions a month. The admin can change any of this at /admin.
    UPDATE plans SET ai_enabled = true, ai_monthly_budget_eur = 1.00,  ai_rate_limit_per_min = 4,  ai_rate_limit_per_day = 30  WHERE key = 'starter';
    UPDATE plans SET ai_enabled = true, ai_monthly_budget_eur = 4.00,  ai_rate_limit_per_min = 6,  ai_rate_limit_per_day = 80  WHERE key = 'growth';
    UPDATE plans SET ai_enabled = true, ai_monthly_budget_eur = 12.00, ai_rate_limit_per_min = 10, ai_rate_limit_per_day = 200 WHERE key = 'scale';
    UPDATE plans SET ai_enabled = true, ai_monthly_budget_eur = 40.00, ai_rate_limit_per_min = 15, ai_rate_limit_per_day = 500 WHERE key = 'enterprise';
  END IF;
END $$;

ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_ai_limits_valid;
ALTER TABLE plans ADD CONSTRAINT plans_ai_limits_valid CHECK (
  ai_monthly_budget_eur >= 0 AND ai_monthly_budget_eur <= 10000
  AND ai_rate_limit_per_min BETWEEN 1 AND 600
  AND ai_rate_limit_per_day BETWEEN 1 AND 100000
);

COMMENT ON COLUMN plans.ai_enabled IS 'Does this tier include the Rovora AI fleet assistant?';
COMMENT ON COLUMN plans.ai_monthly_budget_eur IS 'Most one fleet on this tier may spend on Rovora AI per calendar month, in euros.';
COMMENT ON COLUMN plans.ai_rate_limit_per_min IS 'Rovora AI questions per minute, per person.';
COMMENT ON COLUMN plans.ai_rate_limit_per_day IS 'Rovora AI questions per day, per person.';

-- -----------------------------------------------------------------------------
-- 2. Conversations + messages (chat history)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assistant_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user
  ON assistant_conversations(organization_id, user_id, updated_at DESC);

-- -----------------------------------------------------------------------------
-- 3. assistant_usage — the spend ledger (one row per question)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assistant_usage (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id             uuid REFERENCES users(id) ON DELETE SET NULL,
  conversation_id     uuid REFERENCES assistant_conversations(id) ON DELETE SET NULL,
  -- First day of the fleet-local calendar month this spend counts towards.
  period_month        date NOT NULL,
  -- reserved  = question in flight (counts at reserved_eur)
  -- done      = answered (counts at cost_eur)
  -- failed    = errored (counts at whatever it actually cost)
  -- abandoned = request died without reporting back (counts at reserved_eur)
  status              text NOT NULL DEFAULT 'reserved'
                      CHECK (status IN ('reserved', 'done', 'failed', 'abandoned')),
  model               text,
  input_tokens        integer NOT NULL DEFAULT 0,
  cached_input_tokens integer NOT NULL DEFAULT 0,
  output_tokens       integer NOT NULL DEFAULT 0,
  llm_calls           integer NOT NULL DEFAULT 0,
  tool_calls          integer NOT NULL DEFAULT 0,
  reserved_eur        numeric(12,6) NOT NULL DEFAULT 0,
  cost_eur            numeric(12,6) NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_assistant_usage_org_month ON assistant_usage(organization_id, period_month);
CREATE INDEX IF NOT EXISTS idx_assistant_usage_user_time ON assistant_usage(organization_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_usage_month ON assistant_usage(period_month);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL,
  -- [{label, href}] links shown under an answer
  sources         jsonb,
  tools_used      text[],
  usage_id        uuid REFERENCES assistant_usage(id) ON DELETE SET NULL,
  -- thumbs up (1) / down (-1) from the person who asked
  feedback        smallint CHECK (feedback IN (-1, 1)),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation ON assistant_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_created ON assistant_messages(created_at);

-- -----------------------------------------------------------------------------
-- 4. RLS. All writes go through the server (service role). A signed-in person
--    can read and delete ONLY their own conversations, in fleets they belong
--    to. The usage ledger is server-only (the dashboard reads it via the API).
-- -----------------------------------------------------------------------------
ALTER TABLE assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_usage         ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON assistant_usage FROM anon, authenticated;
REVOKE ALL ON assistant_conversations FROM anon;
REVOKE ALL ON assistant_messages FROM anon;
REVOKE INSERT, UPDATE ON assistant_conversations FROM authenticated;
REVOKE INSERT, UPDATE ON assistant_messages FROM authenticated;

DROP POLICY IF EXISTS "Own assistant conversations" ON assistant_conversations;
CREATE POLICY "Own assistant conversations"
  ON assistant_conversations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Delete own assistant conversations" ON assistant_conversations;
CREATE POLICY "Delete own assistant conversations"
  ON assistant_conversations FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Own assistant messages" ON assistant_messages;
CREATE POLICY "Own assistant messages"
  ON assistant_messages FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM assistant_conversations c
    WHERE c.id = assistant_messages.conversation_id
      AND c.user_id = auth.uid()
      AND public.is_org_member(c.organization_id)
  ));

-- -----------------------------------------------------------------------------
-- 5. assistant_usage_begin — the atomic gate, called BEFORE the LLM.
--
-- Returns allowed=false with a reason when the person is over a rate limit,
-- the fleet would go over its monthly allowance, or the whole platform would
-- go over its monthly ceiling. Otherwise inserts a 'reserved' ledger row worth
-- p_reserve_eur (the most one question may cost) and returns its id; the app
-- later sets the real cost with status 'done' / 'failed'.
--
-- NULL limit = no limit for that check. Denied questions are NOT recorded, so
-- they don't use up the rate limit.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assistant_usage_begin(
  p_org                 uuid,
  p_user                uuid,
  p_conversation        uuid,
  p_monthly_budget_eur  numeric,
  p_reserve_eur         numeric,
  p_per_min             integer,
  p_per_day             integer,
  p_platform_budget_eur numeric,
  p_time_zone           text DEFAULT 'Europe/Malta'
)
RETURNS TABLE (
  allowed         boolean,
  reason          text,
  usage_id        uuid,
  month_spent_eur numeric,
  minute_count    integer,
  day_count       integer,
  period_month    date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local      timestamp   := now() AT TIME ZONE p_time_zone;
  v_month      date        := date_trunc('month', v_local)::date;
  v_day_start  timestamptz := date_trunc('day', v_local) AT TIME ZONE p_time_zone;
  v_spent      numeric;
  v_platform   numeric;
  v_minute     integer;
  v_day        integer;
  v_id         uuid;
BEGIN
  -- One question at a time per fleet through this gate, so two simultaneous
  -- questions can't both fit under the last few cents of the allowance.
  PERFORM pg_advisory_xact_lock(hashtextextended('assistant_usage:' || p_org::text, 0));

  -- A reservation that never reported back (crash, deploy, timeout) is closed
  -- as abandoned and keeps counting at its reserved amount — we can't know it
  -- cost less, so assume it didn't.
  UPDATE assistant_usage u
     SET status = 'abandoned', cost_eur = u.reserved_eur, finished_at = now()
   WHERE u.organization_id = p_org
     AND u.status = 'reserved'
     AND u.created_at < now() - interval '15 minutes';

  SELECT count(*) FILTER (WHERE u.created_at > now() - interval '1 minute'),
         count(*) FILTER (WHERE u.created_at >= v_day_start)
    INTO v_minute, v_day
    FROM assistant_usage u
   WHERE u.organization_id = p_org
     AND u.user_id = p_user
     AND u.created_at >= LEAST(v_day_start, now() - interval '1 minute');

  SELECT COALESCE(sum(CASE WHEN u.status = 'reserved' THEN GREATEST(u.reserved_eur, u.cost_eur) ELSE u.cost_eur END), 0)
    INTO v_spent
    FROM assistant_usage u
   WHERE u.organization_id = p_org
     AND u.period_month = v_month;

  IF p_per_min IS NOT NULL AND v_minute >= p_per_min THEN
    RETURN QUERY SELECT false, 'rate_minute'::text, NULL::uuid, v_spent, v_minute, v_day, v_month;
    RETURN;
  END IF;

  IF p_per_day IS NOT NULL AND v_day >= p_per_day THEN
    RETURN QUERY SELECT false, 'rate_day'::text, NULL::uuid, v_spent, v_minute, v_day, v_month;
    RETURN;
  END IF;

  IF p_monthly_budget_eur IS NOT NULL AND v_spent + p_reserve_eur > p_monthly_budget_eur THEN
    RETURN QUERY SELECT false, 'budget'::text, NULL::uuid, v_spent, v_minute, v_day, v_month;
    RETURN;
  END IF;

  IF p_platform_budget_eur IS NOT NULL THEN
    SELECT COALESCE(sum(CASE WHEN u.status = 'reserved' THEN GREATEST(u.reserved_eur, u.cost_eur) ELSE u.cost_eur END), 0)
      INTO v_platform
      FROM assistant_usage u
     WHERE u.period_month = v_month;
    IF v_platform + p_reserve_eur > p_platform_budget_eur THEN
      RETURN QUERY SELECT false, 'platform_budget'::text, NULL::uuid, v_spent, v_minute, v_day, v_month;
      RETURN;
    END IF;
  END IF;

  INSERT INTO assistant_usage (organization_id, user_id, conversation_id, period_month, status, reserved_eur)
  VALUES (p_org, p_user, p_conversation, v_month, 'reserved', p_reserve_eur)
  RETURNING id INTO v_id;

  -- Opportunistic housekeeping (~1 call in 500): chat history is kept 90
  -- days; the spend ledger 400 days (a year of billing questions).
  IF random() < 0.002 THEN
    DELETE FROM assistant_conversations c WHERE c.updated_at < now() - interval '90 days';
    DELETE FROM assistant_usage u WHERE u.created_at < now() - interval '400 days';
  END IF;

  RETURN QUERY SELECT true, NULL::text, v_id, v_spent, v_minute + 1, v_day + 1, v_month;
END;
$$;

REVOKE ALL ON FUNCTION assistant_usage_begin(uuid, uuid, uuid, numeric, numeric, integer, integer, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION assistant_usage_begin(uuid, uuid, uuid, numeric, numeric, integer, integer, numeric, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION assistant_usage_begin(uuid, uuid, uuid, numeric, numeric, integer, integer, numeric, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. assistant_usage_summary — this month's spend for one fleet (summed in SQL;
--    a REST read would stop at the 1,000-row page limit on a busy fleet).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assistant_usage_summary(
  p_org       uuid,
  p_time_zone text DEFAULT 'Europe/Malta'
)
RETURNS TABLE (
  month_start date,
  spent_eur   numeric,
  questions   integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.month_start,
         COALESCE(sum(CASE WHEN u.status = 'reserved' THEN GREATEST(u.reserved_eur, u.cost_eur) ELSE u.cost_eur END), 0),
         count(u.id)::integer
    FROM (SELECT date_trunc('month', now() AT TIME ZONE p_time_zone)::date AS month_start) m
    LEFT JOIN assistant_usage u
      ON u.organization_id = p_org AND u.period_month = m.month_start
   GROUP BY m.month_start;
$$;

REVOKE ALL ON FUNCTION assistant_usage_summary(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION assistant_usage_summary(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION assistant_usage_summary(uuid, text) TO service_role;
