-- =============================================================================
-- WEBSITE POP-UPS — set from Admin Console → Popups, shown on the public site.
-- =============================================================================
--   site_popups        one row per pop-up: what it says (title, text, image,
--                      button), where and when it shows (pages, devices,
--                      trigger, dates), and how often a visitor sees it.
--   site_popup_stats   per pop-up, per day: how many times it was shown,
--                      how many people pressed its button, and how many
--                      closed it.
--   site_popup_hit()   bumps one of those counters, called by
--                      /api/site-popups/hit (the browser sends a beacon).
--
-- The website never reads these tables directly: /api/site-popups (service
-- role) hands out only the pop-ups that are switched on and inside their
-- dates, so drafts stay private. Clicks ON a pop-up also reach the heatmap:
-- the pop-up's markup carries data-rv-popup="<id>" (see
-- components/marketing/popups/SitePopups.tsx).
--
-- Access: RLS on with NO policies; only the service role touches these.
-- Safe to run more than once.
-- =============================================================================

CREATE TABLE IF NOT EXISTS site_popups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Admin-only name, e.g. "Autumn offer — homepage". Also the analytics label.
  name            text        NOT NULL,
  enabled         boolean     NOT NULL DEFAULT false,
  -- 'modal' = centred over a dimmed page; 'slide' = small card in a corner.
  layout          text        NOT NULL DEFAULT 'modal' CHECK (layout IN ('modal', 'slide')),
  -- Content. tag = small label above the title ("Autumn offer").
  tag             text,
  title           text        NOT NULL,
  body            text,
  image_url       text,
  cta_label       text,
  cta_url         text,
  -- Optional second, quieter button that just closes it ("No thanks").
  dismiss_label   text,
  -- Where: '/' (homepage), '/pricing', '/blog/*' (a section). Empty = every
  -- public page. Login, auth and unsubscribe pages never show pop-ups.
  pages           text[]      NOT NULL DEFAULT '{}',
  devices         text        NOT NULL DEFAULT 'all' CHECK (devices IN ('all', 'desktop', 'mobile')),
  -- When: 'delay' = trigger_value seconds after the page opens; 'scroll' =
  -- once trigger_value % of the page has been scrolled; 'exit' = when the
  -- mouse heads for the tab bar (phones: halfway down the page).
  trigger         text        NOT NULL DEFAULT 'delay' CHECK (trigger IN ('delay', 'scroll', 'exit')),
  trigger_value   integer     NOT NULL DEFAULT 5 CHECK (trigger_value BETWEEN 0 AND 600),
  -- How often one visitor sees it: 'once' ever, once per 'visit', or again
  -- every frequency_days 'days'.
  frequency       text        NOT NULL DEFAULT 'once' CHECK (frequency IN ('once', 'visit', 'days')),
  frequency_days  integer     NOT NULL DEFAULT 7 CHECK (frequency_days BETWEEN 1 AND 365),
  -- Bumped by "Show again to everyone": visitors who saw an older version
  -- are eligible again.
  version         integer     NOT NULL DEFAULT 1,
  -- Whole days in Malta time, inclusive. NULL = no limit on that side.
  starts_on       date,
  ends_on         date,
  -- Higher wins when several pop-ups could show on the same page.
  priority        integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on)
);

CREATE INDEX IF NOT EXISTS idx_site_popups_enabled ON site_popups(enabled, priority DESC);

CREATE TABLE IF NOT EXISTS site_popup_stats (
  popup_id  uuid    NOT NULL REFERENCES site_popups(id) ON DELETE CASCADE,
  day       date    NOT NULL,
  views     integer NOT NULL DEFAULT 0,
  clicks    integer NOT NULL DEFAULT 0,
  closes    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (popup_id, day)
);

ALTER TABLE site_popups      ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_popup_stats ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role touches these tables.

COMMENT ON TABLE site_popups      IS 'Public-website pop-ups managed in Admin Console → Popups. Service role only. See migration 20261123_site_popups.';
COMMENT ON TABLE site_popup_stats IS 'Daily views / button clicks / closes per website pop-up. Service role only.';

-- -----------------------------------------------------------------------------
-- One counter bump. p_kind: 'view' | 'click' | 'close'. Ignores pop-ups that
-- don't exist (deleted while a visitor had it open).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.site_popup_hit(p_popup uuid, p_kind text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'Europe/Malta')::date;
BEGIN
  IF p_kind NOT IN ('view', 'click', 'close') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM site_popups WHERE id = p_popup) THEN
    RETURN;
  END IF;
  INSERT INTO site_popup_stats AS s (popup_id, day, views, clicks, closes)
  VALUES (p_popup, v_day,
          CASE WHEN p_kind = 'view'  THEN 1 ELSE 0 END,
          CASE WHEN p_kind = 'click' THEN 1 ELSE 0 END,
          CASE WHEN p_kind = 'close' THEN 1 ELSE 0 END)
  ON CONFLICT (popup_id, day) DO UPDATE
     SET views  = s.views  + EXCLUDED.views,
         clicks = s.clicks + EXCLUDED.clicks,
         closes = s.closes + EXCLUDED.closes;
END;
$$;

REVOKE ALL ON FUNCTION public.site_popup_hit(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_popup_hit(uuid, text) TO service_role;

SELECT 'Website pop-ups installed.' AS message;
