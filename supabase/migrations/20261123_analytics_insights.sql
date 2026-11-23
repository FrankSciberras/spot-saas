-- =============================================================================
-- ANALYTICS INSIGHTS — the extra numbers behind Admin Console → Analytics.
-- =============================================================================
-- Adds, on top of 20261007_web_analytics.sql (run that first):
--
--   1. analytics_notes   things the browser MEASURES rather than does: the
--                        landing page's speed (Core Web Vitals), sections and
--                        product screenshots scrolling into view, visits to
--                        missing pages. Kept apart from analytics_events so they
--                        never count as an interaction (bounce rate stays
--                        honest) and never crowd the "What visitors click" list.
--      analytics_note()  ingest — called by /api/rv for beacons of type 'note'.
--
--   2. analytics_extras() everything the new Analytics tabs need from website
--                        data for one date range: scroll depth, engaged visits,
--                        interactions by device, sections / screenshots seen,
--                        page speed per page and device, missing pages and what
--                        linked to them, and the pages people read before
--                        signing up.
--
--   3. billing_events    a ledger of what happened to each subscription, written
--                        by the Stripe webhook (and "Import from Stripe" on the
--                        Analytics page): new subscriptions, renewals, upgrades,
--                        downgrades, cancellations with the reason the customer
--                        gave, failed payments and checkout problems. Until now
--                        only the CURRENT state was stored on organizations, so
--                        none of that history existed.
--
-- Access: RLS on with NO policies, functions granted to service_role only —
-- browsers can neither read nor write any of this. Safe to run more than once.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Website notes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Always part of an open visit; purged with it (25-month retention).
  session_id  uuid        NOT NULL REFERENCES analytics_sessions(id) ON DELETE CASCADE,
  visitor_id  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- 'Page speed' | 'Section viewed' | 'Screenshot viewed' | 'Page not found'
  name        text        NOT NULL,
  path        text,
  -- label (+ lcp/fcp/ttfb/inp/cls/load for speed, from for a missing page)
  props       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_analytics_notes_name_created ON analytics_notes(name, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_notes_session      ON analytics_notes(session_id);

ALTER TABLE analytics_notes ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE analytics_notes IS 'Marketing-site measurements (page speed, sections/screenshots seen, missing pages). Service role only. See migration 20261123_analytics_insights.';

-- One call per note beacon. p: { name, path, props, ip, ua, host, vid } — the
-- same fields /api/rv sends analytics_track(). Joins the visitor's visit from
-- the last few hours (a speed note is only sent when the tab is hidden, which
-- can be a while after the page view); never starts a visit of its own.
CREATE OR REPLACE FUNCTION public.analytics_note(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_name    text := left(p->>'name', 60);
  v_props   jsonb := CASE WHEN jsonb_typeof(p->'props') = 'object' THEN p->'props' ELSE '{}'::jsonb END;
  v_hash    text;
  v_cvid    text;
  v_session uuid;
  v_visitor text;
BEGIN
  IF v_name IS NULL OR v_name NOT IN ('Page speed', 'Section viewed', 'Screenshot viewed', 'Page not found') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad name');
  END IF;

  v_hash := 'h:' || left(encode(sha256(convert_to(
              analytics_salt() || '|' || coalesce(p->>'host', '') || '|' ||
              coalesce(p->>'ip', '') || '|' || coalesce(p->>'ua', ''), 'UTF8')), 'hex'), 32);
  IF coalesce(p->>'vid', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_cvid := 'c:' || (p->>'vid');
  END IF;

  SELECT id, visitor_id INTO v_session, v_visitor
    FROM analytics_sessions
   WHERE visitor_id IN (coalesce(v_cvid, v_hash), v_hash)
     AND last_seen_at > now() - interval '3 hours'
   ORDER BY last_seen_at DESC
   LIMIT 1;
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no visit');
  END IF;

  -- Once per visit is enough for each section / screenshot / page's speed, and
  -- a hard cap keeps a misbehaving tab from filling the table.
  IF EXISTS (SELECT 1 FROM analytics_notes
              WHERE session_id = v_session AND name = v_name
                AND props->>'label' IS NOT DISTINCT FROM v_props->>'label')
     OR (SELECT count(*) FROM analytics_notes WHERE session_id = v_session) >= 300 THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  INSERT INTO analytics_notes (session_id, visitor_id, name, path, props)
  VALUES (v_session, v_visitor, v_name, left(p->>'path', 300), v_props);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Extra website numbers for one date range (visits that STARTED in it).
--    p_filters narrows to matching visits, with the same keys as
--    analytics_dashboard(): channel, source, referrer, campaign, utm_source,
--    utm_medium, country, region, city, device, browser, os, language, entry,
--    exit, page.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_extras(
  p_from    timestamptz,
  p_to      timestamptz,
  p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
-- Runs as its owner so the scratch temp table never depends on the caller's
-- TEMP privilege. Only service_role may execute it (section 4).
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '64MB'
AS $$
DECLARE
  f          jsonb := coalesce(p_filters, '{}'::jsonb);
  v_filtered boolean := coalesce(p_filters, '{}'::jsonb) <> '{}'::jsonb;
  v_out      jsonb := '{}'::jsonb;
  v_part     jsonb;
BEGIN
  IF to_regclass('pg_temp._xs') IS NOT NULL THEN DROP TABLE pg_temp._xs; END IF;

  CREATE TEMP TABLE _xs ON COMMIT DROP AS
  SELECT s.id, s.visitor_id, coalesce(s.device, 'Unknown') AS device,
         s.pageviews, s.events, s.engaged_ms
    FROM analytics_sessions s
   WHERE s.started_at >= p_from AND s.started_at < p_to
     AND (f->>'channel'    IS NULL OR s.channel = f->>'channel')
     AND (f->>'source'     IS NULL OR coalesce(s.source, 'Direct') = f->>'source')
     AND (f->>'referrer'   IS NULL OR s.referrer = f->>'referrer')
     AND (f->>'campaign'   IS NULL OR s.utm_campaign = f->>'campaign')
     AND (f->>'utm_source' IS NULL OR s.utm_source = f->>'utm_source')
     AND (f->>'utm_medium' IS NULL OR s.utm_medium = f->>'utm_medium')
     AND (f->>'country'    IS NULL OR coalesce(s.country, '') = f->>'country')
     AND (f->>'region'     IS NULL OR s.region = f->>'region')
     AND (f->>'city'       IS NULL OR s.city = f->>'city')
     AND (f->>'device'     IS NULL OR coalesce(s.device, 'Unknown') = f->>'device')
     AND (f->>'browser'    IS NULL OR coalesce(s.browser, 'Unknown') = f->>'browser')
     AND (f->>'os'         IS NULL OR coalesce(s.os, 'Unknown') = f->>'os')
     AND (f->>'language'   IS NULL OR coalesce(nullif(lower(split_part(s.language, '-', 1)), ''), 'unknown') = f->>'language')
     AND (f->>'entry'      IS NULL OR s.entry_path = f->>'entry')
     AND (f->>'exit'       IS NULL OR s.exit_path = f->>'exit')
     AND (f->>'page'       IS NULL OR s.id IN (
            SELECT e.session_id FROM analytics_events e
             WHERE e.name = 'pageview' AND e.path = f->>'page' AND e.created_at >= p_from));
  CREATE INDEX ON _xs (id);
  ANALYZE _xs;

  -- ── How far down pages people scroll (page views we got a reading for) ──
  SELECT jsonb_build_object(
           'measured', count(*),
           'r25',  count(*) FILTER (WHERE e.scroll_pct >= 25),
           'r50',  count(*) FILTER (WHERE e.scroll_pct >= 50),
           'r75',  count(*) FILTER (WHERE e.scroll_pct >= 75),
           'r100', count(*) FILTER (WHERE e.scroll_pct >= 90),
           'avg_scroll', coalesce(round(avg(e.scroll_pct)), 0),
           'avg_engaged_ms', coalesce(round(avg(e.engaged_ms)), 0))
    INTO v_part
    FROM analytics_events e
    JOIN _xs s ON s.id = e.session_id
   WHERE e.name = 'pageview' AND e.created_at >= p_from
     AND (e.engaged_ms > 0 OR e.scroll_pct > 0);
  v_out := v_out || jsonb_build_object('scroll', v_part);

  -- ── Engaged visits: 10 s+ on screen, a second page, or a click ──
  SELECT jsonb_build_object(
           'visits',  (SELECT count(*) FROM _xs),
           'engaged', (SELECT count(*) FROM _xs WHERE engaged_ms >= 10000 OR pageviews >= 2 OR events >= 1),
           'by_device', coalesce((
             SELECT jsonb_agg(jsonb_build_object('device', device, 'visits', n, 'engaged', eng, 'bounces', b, 'engaged_ms', ms) ORDER BY n DESC)
               FROM (SELECT device, count(*) AS n,
                            count(*) FILTER (WHERE engaged_ms >= 10000 OR pageviews >= 2 OR events >= 1) AS eng,
                            count(*) FILTER (WHERE pageviews <= 1 AND events = 0) AS b,
                            coalesce(sum(engaged_ms), 0) AS ms
                       FROM _xs GROUP BY device) d), '[]'::jsonb))
    INTO v_part;
  v_out := v_out || jsonb_build_object('engagement', v_part);

  -- ── Interactions (clicks, video plays, sign-up errors…) split by device ──
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'label', label, 'device', device, 'count', n, 'visitors', v)
                            ORDER BY n DESC, name), '[]'::jsonb)
    INTO v_part
    FROM (SELECT e.name, e.props->>'label' AS label, s.device, count(*) AS n, count(DISTINCT e.visitor_id) AS v
            FROM analytics_events e
            JOIN _xs s ON s.id = e.session_id
           WHERE e.name NOT IN ('pageview', 'Consent', 'Signup', 'Lead', 'Signup step')
             AND e.created_at >= p_from AND e.created_at < p_to
           GROUP BY 1, 2, 3
           ORDER BY 4 DESC
           LIMIT 500) x;
  v_out := v_out || jsonb_build_object('interactions', v_part);

  -- ── Sections and screenshots seen, with how many visits saw that page ──
  WITH pv AS (
    SELECT e.path, count(DISTINCT e.session_id) AS visits
      FROM analytics_events e
      JOIN _xs s ON s.id = e.session_id
     WHERE e.name = 'pageview' AND e.created_at >= p_from
     GROUP BY 1
  ), seen AS (
    SELECT n.name, n.path, n.props->>'label' AS label, count(DISTINCT n.session_id) AS visits
      FROM analytics_notes n
      JOIN _xs s ON s.id = n.session_id
     WHERE n.name IN ('Section viewed', 'Screenshot viewed') AND n.created_at >= p_from
     GROUP BY 1, 2, 3
     ORDER BY 4 DESC
     LIMIT 300
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', seen.name, 'path', seen.path, 'label', seen.label,
                                               'visits', seen.visits, 'page_visits', coalesce(pv.visits, 0))
                            ORDER BY seen.visits DESC), '[]'::jsonb)
    INTO v_part
    FROM seen LEFT JOIN pv ON pv.path = seen.path;
  v_out := v_out || jsonb_build_object('seen', v_part);

  -- ── Page speed of landing pages: 75th percentile per page × device ──
  --    (lcp / fcp / ttfb / inp / load in ms; cls ×1000.) "slow" = a load whose
  --    largest content took over 4 s or whose server answer took over 1.8 s —
  --    Google's "poor" thresholds.
  WITH sp AS (
    SELECT coalesce(n.props->>'label', n.path) AS path, s.device,
           CASE WHEN jsonb_typeof(n.props->'lcp')  = 'number' THEN (n.props->>'lcp')::numeric  END AS lcp,
           CASE WHEN jsonb_typeof(n.props->'fcp')  = 'number' THEN (n.props->>'fcp')::numeric  END AS fcp,
           CASE WHEN jsonb_typeof(n.props->'ttfb') = 'number' THEN (n.props->>'ttfb')::numeric END AS ttfb,
           CASE WHEN jsonb_typeof(n.props->'inp')  = 'number' THEN (n.props->>'inp')::numeric  END AS inp,
           CASE WHEN jsonb_typeof(n.props->'cls')  = 'number' THEN (n.props->>'cls')::numeric  END AS cls,
           CASE WHEN jsonb_typeof(n.props->'load') = 'number' THEN (n.props->>'load')::numeric END AS load_ms
      FROM analytics_notes n
      JOIN _xs s ON s.id = n.session_id
     WHERE n.name = 'Page speed' AND n.created_at >= p_from
  )
  SELECT jsonb_build_object(
           'pages', coalesce((
             SELECT jsonb_agg(to_jsonb(x) ORDER BY x.samples DESC, x.path)
               FROM (SELECT path, device, count(*) AS samples,
                            count(*) FILTER (WHERE lcp > 4000 OR ttfb > 1800) AS slow,
                            round(percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp))  AS lcp,
                            round(percentile_cont(0.75) WITHIN GROUP (ORDER BY fcp))  AS fcp,
                            round(percentile_cont(0.75) WITHIN GROUP (ORDER BY ttfb)) AS ttfb,
                            round(percentile_cont(0.75) WITHIN GROUP (ORDER BY inp))  AS inp,
                            round(percentile_cont(0.75) WITHIN GROUP (ORDER BY cls))  AS cls,
                            round(percentile_cont(0.75) WITHIN GROUP (ORDER BY load_ms)) AS load_ms
                       FROM sp GROUP BY path, device
                      ORDER BY count(*) DESC
                      LIMIT 150) x), '[]'::jsonb),
           'devices', coalesce((
             SELECT jsonb_agg(to_jsonb(x) ORDER BY x.samples DESC)
               FROM (SELECT device, count(*) AS samples,
                            count(*) FILTER (WHERE lcp > 4000 OR ttfb > 1800) AS slow,
                            round(percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp))  AS lcp,
                            round(percentile_cont(0.75) WITHIN GROUP (ORDER BY fcp))  AS fcp,
                            round(percentile_cont(0.75) WITHIN GROUP (ORDER BY ttfb)) AS ttfb,
                            round(percentile_cont(0.75) WITHIN GROUP (ORDER BY inp))  AS inp,
                            round(percentile_cont(0.75) WITHIN GROUP (ORDER BY cls))  AS cls,
                            round(percentile_cont(0.75) WITHIN GROUP (ORDER BY load_ms)) AS load_ms
                       FROM sp GROUP BY device) x), '[]'::jsonb))
    INTO v_part;
  v_out := v_out || jsonb_build_object('speed', v_part);

  -- ── Missing pages, and what sent people there ──
  SELECT coalesce(jsonb_agg(jsonb_build_object('path', path, 'from', src, 'device', device, 'count', n, 'visitors', v)
                            ORDER BY n DESC, path), '[]'::jsonb)
    INTO v_part
    FROM (SELECT coalesce(n.props->>'label', n.path) AS path, coalesce(n.props->>'from', '(direct)') AS src, s.device,
                 count(*) AS n, count(DISTINCT n.visitor_id) AS v
            FROM analytics_notes n
            JOIN _xs s ON s.id = n.session_id
           WHERE n.name = 'Page not found' AND n.created_at >= p_from
           GROUP BY 1, 2, 3
           ORDER BY 4 DESC
           LIMIT 200) x;
  v_out := v_out || jsonb_build_object('not_found', v_part);

  -- ── Pages read before signing up: for each new fleet in the range, the
  --    pages its visitor viewed in the 30 days up to the signup ──
  WITH su AS (
    SELECT e.id, e.visitor_id, e.created_at
      FROM analytics_events e
     WHERE e.name = 'Signup' AND e.created_at >= p_from AND e.created_at < p_to
       AND e.session_id IS NOT NULL
       AND (NOT v_filtered OR e.session_id IN (SELECT id FROM _xs))
  ), seen AS (
    SELECT DISTINCT su.id, pv.path
      FROM su
      JOIN analytics_sessions s2
        ON s2.visitor_id = su.visitor_id
       AND s2.started_at >  su.created_at - interval '30 days'
       AND s2.started_at <= su.created_at
      JOIN analytics_events pv
        ON pv.session_id = s2.id AND pv.name = 'pageview' AND pv.created_at <= su.created_at
  )
  SELECT jsonb_build_object(
           'signups', (SELECT count(*) FROM su),
           'tracked', (SELECT count(DISTINCT id) FROM seen),
           'avg_pages', (SELECT coalesce(round(avg(c), 1), 0) FROM (SELECT id, count(*) AS c FROM seen GROUP BY id) y),
           'pages', coalesce((SELECT jsonb_agg(jsonb_build_object('path', path, 'signups', n) ORDER BY n DESC, path)
                                FROM (SELECT path, count(*) AS n FROM seen GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 40) x), '[]'::jsonb))
    INTO v_part;
  v_out := v_out || jsonb_build_object('before_signup', v_part);

  v_out := v_out || jsonb_build_object('notes_since', (SELECT min(created_at) FROM analytics_notes));
  RETURN v_out;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Billing events ledger
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Idempotency key, so a webhook retry or a second import never double-counts:
  --   sub:<id>:created · sub:<id>:cancelled · inv:<id>:paid · inv:<id>:failed ·
  --   evt:<stripe event id> · cs:<checkout session id>:expired · fail:<uuid>
  key                    text        NOT NULL UNIQUE,
  organization_id        uuid        REFERENCES organizations(id) ON DELETE SET NULL,
  occurred_at            timestamptz NOT NULL,
  kind                   text        NOT NULL CHECK (kind IN (
                           'subscribed',         -- a fleet started paying
                           'renewed',            -- a monthly renewal was paid
                           'upgraded',           -- moved to a pricier plan
                           'downgraded',         -- moved to a cheaper plan
                           'cancel_scheduled',   -- asked to cancel at period end
                           'reactivated',        -- took a scheduled cancellation back
                           'cancelled',          -- the subscription ended
                           'payment_failed',     -- a charge was declined (per invoice)
                           'checkout_failed',    -- our server couldn't open checkout
                           'checkout_abandoned'  -- opened the payment page, never paid
                         )),
  plan_from              text,
  plan_to                text,
  -- Money in major units (EUR), when the event has an amount.
  amount                 numeric(12, 2),
  currency               text,
  -- Cancellations: Stripe's feedback code (too_expensive, missing_features…)
  -- or reason; failed payments: the decline code / failure reason.
  reason                 text,
  -- Free text the customer typed when cancelling, if any.
  comment                text,
  -- Desktop | Mobile | Tablet, when known (checkout events).
  device                 text,
  -- Failed payments: how many times Stripe has tried this invoice so far.
  attempts               integer,
  -- Failed payments: the invoice was paid in the end.
  recovered              boolean     NOT NULL DEFAULT false,
  stripe_customer_id     text,
  stripe_subscription_id text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_occurred ON billing_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_billing_events_org      ON billing_events(organization_id, occurred_at);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE billing_events IS 'Subscription history from Stripe (new, renewals, plan changes, cancellations + reasons, failed payments). Service role only. See migration 20261123_analytics_insights.';

-- -----------------------------------------------------------------------------
-- 4. Server-only access
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.analytics_note(jsonb)                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_extras(timestamptz, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_note(jsonb)                            TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_extras(timestamptz, timestamptz, jsonb) TO service_role;

SELECT 'Analytics insights installed.' AS message;
