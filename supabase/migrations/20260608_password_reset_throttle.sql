-- =============================================================================
-- PASSWORD-RESET THROTTLE — at most one reset email per address per cooldown.
-- =============================================================================
-- The in-code reset flow (lib/actions/auth-email.ts) bypasses Supabase's mailer,
-- which means it also bypasses Supabase's built-in send throttle. This adds it
-- back: a tiny table + an ATOMIC "claim" function so a given email can only get
-- a reset email once per cooldown window (default 60s), race-safe under
-- concurrent requests.
-- =============================================================================

CREATE TABLE IF NOT EXISTS password_reset_throttle (
  email        text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE password_reset_throttle ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (and the SECURITY DEFINER function below)
-- ever touch this table.

-- Returns TRUE if the caller may send now (and records the send), FALSE if the
-- address is still within its cooldown. Atomic: the conditional ON CONFLICT
-- update means concurrent requests can't both win.
CREATE OR REPLACE FUNCTION public.claim_password_reset(
  p_email   text,
  p_cooldown integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  INSERT INTO public.password_reset_throttle (email, last_sent_at)
  VALUES (lower(trim(p_email)), now())
  ON CONFLICT (email) DO UPDATE
    SET last_sent_at = now()
    WHERE public.password_reset_throttle.last_sent_at < now() - make_interval(secs => GREATEST(p_cooldown, 0))
  RETURNING true INTO v_ok;

  RETURN COALESCE(v_ok, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_password_reset(text, integer) TO anon, authenticated, service_role;

SELECT 'Password-reset throttle installed.' AS message;
