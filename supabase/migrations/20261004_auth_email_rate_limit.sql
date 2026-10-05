-- =============================================================================
-- AUTH-EMAIL RATE LIMIT — cooldown + hourly cap for password-reset and
-- signup-code emails, per address AND per caller IP.
-- =============================================================================
-- The login page now offers a "Resend" button, so the limits have to hold up
-- against someone scripting it, not just a person clicking it. Each bucket
-- (e.g. 'reset:jo@fleet.com' or 'reset-ip:203.0.113.7') gets:
--   * a COOLDOWN  — minimum seconds between two sends, and
--   * a CAP       — at most p_max sends per p_window seconds (fixed window that
--                   starts at the first send).
-- lib/actions/auth-email.ts picks the numbers; this function only enforces
-- them, atomically, so two concurrent requests can't both slip through.
--
-- Supersedes password_reset_throttle / claim_password_reset (20260608), which
-- only had the cooldown. The old function is kept so a deploy that lands
-- before this migration still has a throttle to fall back on.
-- =============================================================================

CREATE TABLE IF NOT EXISTS auth_email_rate_limit (
  key          text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL,
  window_start timestamptz NOT NULL,
  window_count integer     NOT NULL DEFAULT 0
);

ALTER TABLE auth_email_rate_limit ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (and the SECURITY DEFINER function below)
-- ever touch this table.

-- Returns 0 if the caller may send now (and records the send), otherwise the
-- number of seconds until the next send would be allowed.
CREATE OR REPLACE FUNCTION public.claim_auth_email(
  p_key      text,
  p_cooldown integer,
  p_max      integer,
  p_window   integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key  text := lower(trim(p_key));
  v_now  timestamptz := now();
  r      public.auth_email_rate_limit%ROWTYPE;
  v_wait integer;
BEGIN
  -- Make sure the row exists, then lock it so concurrent claims queue up.
  INSERT INTO public.auth_email_rate_limit (key, last_sent_at, window_start, window_count)
  VALUES (v_key, '-infinity', v_now, 0)
  ON CONFLICT (key) DO NOTHING;

  SELECT * INTO r FROM public.auth_email_rate_limit WHERE key = v_key FOR UPDATE;

  -- The previous window has run out — start a fresh one.
  IF r.window_start <= v_now - make_interval(secs => p_window) THEN
    r.window_start := v_now;
    r.window_count := 0;
  END IF;

  -- Too soon after the last send.
  IF r.last_sent_at > v_now - make_interval(secs => p_cooldown) THEN
    v_wait := ceil(extract(epoch FROM r.last_sent_at + make_interval(secs => p_cooldown) - v_now));
    RETURN GREATEST(v_wait, 1);
  END IF;

  -- Used up this window's allowance.
  IF r.window_count >= p_max THEN
    v_wait := ceil(extract(epoch FROM r.window_start + make_interval(secs => p_window) - v_now));
    RETURN GREATEST(v_wait, 1);
  END IF;

  UPDATE public.auth_email_rate_limit
     SET last_sent_at = v_now,
         window_start = r.window_start,
         window_count = r.window_count + 1
   WHERE key = v_key;

  -- Opportunistic cleanup so junk keys (random addresses, rotating IPs) don't
  -- pile up forever. Cheap: only rows idle for over a day, a handful at a time.
  DELETE FROM public.auth_email_rate_limit
   WHERE key IN (
     SELECT key FROM public.auth_email_rate_limit
      WHERE last_sent_at < v_now - interval '1 day'
        AND window_start < v_now - interval '1 day'
      LIMIT 50
   );

  RETURN 0;
END;
$$;

-- Server-only: the app calls this with the service role. Not exposed to
-- browsers, so nobody can burn another person's allowance from the client.
REVOKE ALL ON FUNCTION public.claim_auth_email(text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auth_email(text, integer, integer, integer) TO service_role;

-- The old throttle was callable with the public anon key, which let anyone
-- keep a victim's address permanently "in cooldown" (no reset emails, ever).
-- Lock it down to the server too. (DO block: skip quietly if it was never made.)
DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.claim_password_reset(text, integer) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.claim_password_reset(text, integer) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

SELECT 'Auth-email rate limit installed.' AS message;
