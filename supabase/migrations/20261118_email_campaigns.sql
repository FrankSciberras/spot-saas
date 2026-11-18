-- =============================================================================
-- EMAIL CAMPAIGNS — platform-admin newsletters & product-update emails
-- =============================================================================
-- The platform admin ("Rovora HQ") writes an HTML email in the admin console
-- (Email campaigns tab), picks an audience (everyone / fleet operators /
-- drivers / a pasted list) and sends it through Resend from the noreply
-- address. Code: lib/actions/email-campaigns.ts.
--
-- Tables
--   email_templates     reusable HTML templates saved from the editor
--   email_campaigns     one row per send — what went out, to whom, results
--   email_unsubscribes  addresses that opted out of marketing email (via the
--                       link in the footer or the one-click List-Unsubscribe
--                       header). Marketing sends skip them.
--
-- SECURITY
--   * NOT tenant-scoped: these belong to the platform, like
--     platform_broadcasts. Only platform admins may read them.
--   * All writes go through trusted server code on the service-role client
--     (the admin console actions and the public unsubscribe endpoint, which
--     verifies a signed token first). The policies below are defense in depth.
--
-- IDEMPOTENT: safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. email_templates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  subject     text NOT NULL DEFAULT '',
  preheader   text NOT NULL DEFAULT '',
  html        text NOT NULL,
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_updated_at
  ON public.email_templates(updated_at DESC);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins manage email templates" ON public.email_templates;
CREATE POLICY "Platform admins manage email templates"
  ON public.email_templates FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 2. email_campaigns
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      uuid REFERENCES public.email_templates(id) ON DELETE SET NULL,
  subject          text NOT NULL,
  preheader        text,
  from_name        text,
  reply_to         text,
  -- The HTML as written (merge tags unresolved), so a send can be reviewed or
  -- reused later.
  html             text NOT NULL,
  -- Marketing sends skip unsubscribed addresses and carry the one-click
  -- List-Unsubscribe header. Service notices (outages, terms changes) don't.
  marketing        boolean NOT NULL DEFAULT true,
  audience         jsonb NOT NULL,
  target_summary   text,
  status           text NOT NULL DEFAULT 'sending'
                     CHECK (status IN ('sending', 'sent', 'partial', 'failed')),
  recipient_count  integer NOT NULL DEFAULT 0,  -- addresses we attempted
  sent_count       integer NOT NULL DEFAULT 0,  -- accepted by Resend
  failed_count     integer NOT NULL DEFAULT 0,  -- rejected by Resend
  skipped_count    integer NOT NULL DEFAULT 0,  -- left out because unsubscribed
  errors           jsonb,                       -- first few error messages
  sent_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_at
  ON public.email_campaigns(created_at DESC);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins read email campaigns" ON public.email_campaigns;
CREATE POLICY "Platform admins read email campaigns"
  ON public.email_campaigns FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 3. email_unsubscribes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_unsubscribes (
  email       text PRIMARY KEY CHECK (email = lower(email)),
  source      text NOT NULL DEFAULT 'link'
                CHECK (source IN ('link', 'one_click', 'admin')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_unsubscribes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins read email unsubscribes" ON public.email_unsubscribes;
CREATE POLICY "Platform admins read email unsubscribes"
  ON public.email_unsubscribes FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

SELECT 'Email campaigns installed.' AS message;
