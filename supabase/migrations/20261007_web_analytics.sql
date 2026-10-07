-- =============================================================================
-- WEB ANALYTICS — first-party, privacy-friendly visitor stats for the public
-- marketing site, shown to the platform admin in Admin Console → Analytics.
-- =============================================================================
-- How it works
--   • The browser sends a tiny beacon to /api/rv for each page view, interaction
--     and "time on page" update. The route classifies the visit (traffic source,
--     channel, country, device…) and calls analytics_track() below with the
--     SERVICE ROLE. Signups and contact-form leads are recorded server-side by
--     the actions that create them, so they count even if the beacon is blocked.
--   • Cookieless by default. A visitor is identified by
--       sha256(daily_salt | site | ip | user-agent)
--     where daily_salt is random, rotates every UTC day and is DELETED the next
--     day — so the hash can never be recomputed or linked across days, and no
--     IP address or user-agent string is ever stored. Nothing is written to the
--     visitor's device.
--   • Visitors who click "Allow" on the cookie banner get a random first-party
--     id cookie (rv_vid) instead, which lets us recognise returning visitors and
--     credit a signup to the channel that first brought them, days earlier.
--   • A "session" (a visit) is a run of activity with gaps under 30 minutes.
--   • Raw rows are kept for 25 months (so a year can be compared with the last),
--     then purged automatically — see analytics_salt().
--
-- Access: RLS enabled with NO policies and functions granted to service_role
-- only — browsers can neither read nor write any of this directly.
--
-- Safe to run more than once.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------

-- Today's random salt for the cookieless visitor hash. Yesterday's row is
-- deleted as soon as today's is created.
CREATE TABLE IF NOT EXISTS analytics_salts (
  day  date PRIMARY KEY,
  salt text NOT NULL
);

-- One row per visit.
CREATE TABLE IF NOT EXISTS analytics_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'h:<hash>' (cookieless, changes daily) or 'c:<uuid>' (allowed cookies).
  visitor_id    text        NOT NULL,
  consented     boolean     NOT NULL DEFAULT false,
  started_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  pageviews     integer     NOT NULL DEFAULT 0,
  -- Interactions other than page views (CTA clicks, outbound links, …).
  events        integer     NOT NULL DEFAULT 0,
  -- Time the page was actually visible, summed over the visit.
  engaged_ms    bigint      NOT NULL DEFAULT 0,
  entry_path    text,
  exit_path     text,
  -- Where the visit came from. referrer is host + path only (never a query).
  referrer      text,
  referrer_host text,
  source        text,
  channel       text        NOT NULL DEFAULT 'Direct',
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_term      text,
  utm_content   text,
  -- Location: ISO-3166 alpha-2 country; region/city only when the CDN supplies them.
  country       text,
  region        text,
  city          text,
  timezone      text,
  language      text,
  -- Desktop | Mobile | Tablet
  device        text,
  browser       text,
  os            text,
  screen_width  integer
);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_started  ON analytics_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_visitor  ON analytics_sessions(visitor_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_lastseen ON analytics_sessions(last_seen_at);

-- One row per page view, interaction or conversion.
CREATE TABLE IF NOT EXISTS analytics_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL only for a server-side conversion from a visitor we never saw browse
  -- (beacon blocked) — still counted as a signup/lead, source unknown.
  session_id  uuid REFERENCES analytics_sessions(id) ON DELETE CASCADE,
  visitor_id  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- 'pageview', a conversion ('Signup', 'Lead'), or an interaction name.
  name        text        NOT NULL,
  path        text,
  props       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Page views only: visible time on the page and deepest scroll (0-100).
  engaged_ms  integer     NOT NULL DEFAULT 0,
  scroll_pct  smallint    NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name    ON analytics_events(name, created_at);

ALTER TABLE analytics_salts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events   ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role touches these tables.

COMMENT ON TABLE analytics_sessions IS 'Marketing-site visits (first-party analytics). Service role only. See migration 20261007_web_analytics.';
COMMENT ON TABLE analytics_events   IS 'Marketing-site page views, interactions and conversions. Service role only.';
COMMENT ON TABLE analytics_salts    IS 'Daily random salt for the cookieless visitor hash; previous days are deleted.';

-- -----------------------------------------------------------------------------
-- 2. Daily salt (+ retention purge, piggy-backed on the first hit of each day)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_salt()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_salt  text;
BEGIN
  SELECT salt INTO v_salt FROM analytics_salts WHERE day = v_today;
  IF v_salt IS NOT NULL THEN
    RETURN v_salt;
  END IF;

  INSERT INTO analytics_salts (day, salt)
  VALUES (v_today, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  ON CONFLICT (day) DO NOTHING;

  SELECT salt INTO v_salt FROM analytics_salts WHERE day = v_today;

  -- First hit of a new day: forget yesterday's salt for good, and drop rows
  -- past the retention window.
  DELETE FROM analytics_salts    WHERE day < v_today;
  DELETE FROM analytics_events   WHERE created_at < now() - interval '25 months';
  DELETE FROM analytics_sessions WHERE started_at < now() - interval '25 months';

  RETURN v_salt;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Ingest. One call per beacon. p fields:
--      type        pageview | event | engagement | conversion
--      ip, ua, host                    -> cookieless hash (never stored)
--      vid                             -> consented visitor uuid, or null
--      pv                              -> page-view id (pageview / engagement)
--      name, path, props               -> the event
--      engaged_ms, scroll_pct          -> engagement deltas
--      referrer, referrer_host, source, channel, utm_*, country, region, city,
--      timezone, language, device, browser, os, screen_width
--                                      -> session attributes (new visits only)
--    Returns {"ok": bool, "session": uuid|null}.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_track(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_type     text := p->>'type';
  v_hash     text;
  v_cvid     text;
  v_visitor  text;
  v_session  uuid;
  v_pv       uuid;
  v_path     text := left(p->>'path', 300);
  v_name     text := left(coalesce(p->>'name', 'pageview'), 80);
  v_props    jsonb := CASE WHEN jsonb_typeof(p->'props') = 'object' THEN p->'props' ELSE '{}'::jsonb END;
  v_engaged  integer := LEAST(GREATEST(coalesce((p->>'engaged_ms')::integer, 0), 0), 1800000);
  v_scroll   smallint := LEAST(GREATEST(coalesce((p->>'scroll_pct')::integer, 0), 0), 100);
  v_window   interval := interval '30 minutes';
BEGIN
  IF v_type NOT IN ('pageview', 'event', 'engagement', 'conversion') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad type');
  END IF;

  v_hash := 'h:' || left(encode(sha256(convert_to(
              analytics_salt() || '|' || coalesce(p->>'host', '') || '|' ||
              coalesce(p->>'ip', '') || '|' || coalesce(p->>'ua', ''), 'UTF8')), 'hex'), 32);

  IF coalesce(p->>'vid', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_cvid := 'c:' || (p->>'vid');
  END IF;
  v_visitor := coalesce(v_cvid, v_hash);

  IF coalesce(p->>'pv', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_pv := (p->>'pv')::uuid;
  END IF;

  -- ── Time-on-page update for an existing page view ──
  IF v_type = 'engagement' THEN
    IF v_pv IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'no pageview');
    END IF;
    UPDATE analytics_events
       SET engaged_ms = LEAST(engaged_ms + v_engaged, 3600000),
           scroll_pct = GREATEST(scroll_pct, v_scroll)
     WHERE id = v_pv
       AND name = 'pageview'
       AND visitor_id IN (v_visitor, v_hash)
    RETURNING session_id INTO v_session;

    IF v_session IS NOT NULL AND v_engaged > 0 THEN
      UPDATE analytics_sessions
         SET engaged_ms   = engaged_ms + v_engaged,
             last_seen_at = GREATEST(last_seen_at, now())
       WHERE id = v_session;
    END IF;
    RETURN jsonb_build_object('ok', v_session IS NOT NULL, 'session', v_session);
  END IF;

  -- ── Find the visit this belongs to ──
  IF v_type = 'conversion' THEN
    -- Credit the visitor's most recent visit, however long ago (onboarding
    -- itself isn't tracked, so the marketing visit may be hours old).
    SELECT id INTO v_session FROM analytics_sessions
     WHERE visitor_id = v_visitor
     ORDER BY last_seen_at DESC LIMIT 1;
    IF v_session IS NULL AND v_cvid IS NOT NULL THEN
      SELECT id INTO v_session FROM analytics_sessions
       WHERE visitor_id = v_hash
       ORDER BY last_seen_at DESC LIMIT 1;
    END IF;
  ELSE
    SELECT id INTO v_session FROM analytics_sessions
     WHERE visitor_id = v_visitor AND last_seen_at > now() - v_window
     ORDER BY last_seen_at DESC LIMIT 1;

    -- Allowed cookies mid-visit: carry the cookieless visit over to the new id.
    IF v_session IS NULL AND v_cvid IS NOT NULL THEN
      UPDATE analytics_sessions
         SET visitor_id = v_cvid, consented = true
       WHERE id = (SELECT id FROM analytics_sessions
                    WHERE visitor_id = v_hash AND last_seen_at > now() - v_window
                    ORDER BY last_seen_at DESC LIMIT 1)
      RETURNING id INTO v_session;
      IF v_session IS NOT NULL THEN
        UPDATE analytics_events SET visitor_id = v_cvid WHERE session_id = v_session;
      END IF;
    END IF;

    IF v_session IS NULL THEN
      INSERT INTO analytics_sessions (
        visitor_id, consented, entry_path, exit_path,
        referrer, referrer_host, source, channel,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        country, region, city, timezone, language,
        device, browser, os, screen_width
      ) VALUES (
        v_visitor, v_cvid IS NOT NULL, v_path, v_path,
        left(p->>'referrer', 300), left(p->>'referrer_host', 120),
        left(p->>'source', 80), coalesce(left(p->>'channel', 40), 'Direct'),
        left(p->>'utm_source', 120), left(p->>'utm_medium', 120), left(p->>'utm_campaign', 160),
        left(p->>'utm_term', 160), left(p->>'utm_content', 160),
        left(upper(p->>'country'), 2), left(p->>'region', 80), left(p->>'city', 80),
        left(p->>'timezone', 64), left(p->>'language', 35),
        left(p->>'device', 20), left(p->>'browser', 40), left(p->>'os', 40),
        CASE WHEN (p->>'screen_width') ~ '^[0-9]{1,5}$' THEN (p->>'screen_width')::integer END
      )
      RETURNING id INTO v_session;
    END IF;
  END IF;

  -- ── Record it ──
  IF v_type = 'pageview' THEN
    INSERT INTO analytics_events (id, session_id, visitor_id, name, path, props)
    VALUES (coalesce(v_pv, gen_random_uuid()), v_session, v_visitor, 'pageview', v_path, v_props)
    ON CONFLICT (id) DO NOTHING;
    IF FOUND THEN
      UPDATE analytics_sessions
         SET pageviews = pageviews + 1, exit_path = v_path, last_seen_at = now()
       WHERE id = v_session;
    END IF;
  ELSE
    INSERT INTO analytics_events (session_id, visitor_id, name, path, props)
    VALUES (v_session, v_visitor, v_name, v_path, v_props);
    IF v_session IS NOT NULL THEN
      -- A cookie-banner answer isn't engagement with the page: leave it out
      -- of the interaction count so it can't turn a bounce into a "visit".
      UPDATE analytics_sessions
         SET events = events + CASE WHEN v_name = 'Consent' THEN 0 ELSE 1 END,
             last_seen_at = CASE WHEN v_type = 'event' THEN now() ELSE last_seen_at END
       WHERE id = v_session;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'session', v_session);
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Dashboard. Everything the Analytics page shows for one date range, in one
--    round trip. p_filters narrows every number to matching visits, e.g.
--    {"source":"Google","country":"MT"}. Keys: channel, source, referrer,
--    campaign, utm_source, utm_medium, country, region, city, device, browser,
--    os, language, entry, exit, page.
--
--    The comparison period has the same length and starts at p_prev_from —
--    e.g. "today so far" vs "yesterday up to the same time". It defaults to
--    the stretch immediately before p_from.
--
--    Distinct-visitor counts are done in two steps — group by (thing, visitor),
--    then by thing — so Postgres can hash instead of sorting inside every
--    group. (Benchmark: ~0.4 s for 30 days and ~3 s for a full year at
--    ~330 visits a day.)
-- -----------------------------------------------------------------------------

-- One breakdown of the current period's visits (the _as scratch table built by
-- analytics_dashboard) by a column expression. Internal: the expressions are
-- fixed strings in analytics_dashboard, never caller input.
CREATE OR REPLACE FUNCTION public.analytics_breakdown(
  p_dim   text,
  p_extra text    DEFAULT NULL,
  p_where text    DEFAULT 'true',
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v jsonb;
BEGIN
  EXECUTE format($q$
    SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'name', name, 'extra', extra, 'visitors', visitors, 'visits', visits,
             'bounces', bounces, 'engaged_ms', engaged_ms, 'signups', signups, 'leads', leads))
             ORDER BY visitors DESC, visits DESC, name), '[]'::jsonb)
      FROM (
        SELECT name, extra, count(*) AS visitors, sum(visits) AS visits, sum(bounces) AS bounces,
               sum(engaged_ms) AS engaged_ms, sum(signups) AS signups, sum(leads) AS leads
          FROM (SELECT %1$s AS name, %2$s AS extra, vk,
                       count(*) AS visits,
                       count(*) FILTER (WHERE pageviews <= 1 AND events = 0) AS bounces,
                       sum(engaged_ms) AS engaged_ms, sum(signups) AS signups, sum(leads) AS leads
                  FROM _as WHERE cur AND (%3$s)
                 GROUP BY 1, 2, 3) per_visitor
         GROUP BY name, extra
         ORDER BY count(*) DESC, sum(visits) DESC
         LIMIT %4$s
      ) t
  $q$, p_dim, coalesce(p_extra, 'NULL::text'), p_where, p_limit) INTO v;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_dashboard(
  p_from    timestamptz,
  p_to      timestamptz,
  p_tz      text  DEFAULT 'UTC',
  p_bucket  text  DEFAULT 'day',
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_prev_from timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
-- Runs as its owner so the scratch temp tables below never depend on the
-- caller's TEMP privilege. Only service_role may execute it (section 6).
SECURITY DEFINER
SET search_path = public, pg_temp
-- Room for the in-memory hashes behind the distinct-visitor counts.
SET work_mem = '64MB'
AS $$
DECLARE
  v_tz       text := CASE WHEN EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_tz) THEN p_tz ELSE 'UTC' END;
  v_bucket   text := CASE WHEN p_bucket IN ('hour', 'day', 'week', 'month') THEN p_bucket ELSE 'day' END;
  v_prev     timestamptz := coalesce(p_prev_from, p_from - (p_to - p_from));
  v_prev_to  timestamptz := coalesce(p_prev_from, p_from - (p_to - p_from)) + (p_to - p_from);
  f          jsonb := coalesce(p_filters, '{}'::jsonb);
  v_filtered boolean := coalesce(p_filters, '{}'::jsonb) <> '{}'::jsonb;
  v_out      jsonb := '{}'::jsonb;
  v_part     jsonb;
BEGIN
  -- Scratch tables live for this transaction only (ON COMMIT DROP); clear any
  -- left by an earlier call in the same transaction.
  IF to_regclass('pg_temp._as') IS NOT NULL THEN DROP TABLE pg_temp._as; END IF;
  IF to_regclass('pg_temp._pv') IS NOT NULL THEN DROP TABLE pg_temp._pv; END IF;
  IF to_regclass('pg_temp._conv') IS NOT NULL THEN DROP TABLE pg_temp._conv; END IF;

  -- Visits in the current AND previous period that pass the filters.
  CREATE TEMP TABLE _as ON COMMIT DROP AS
  SELECT s.*,
         -- 64-bit key for distinct counts: far cheaper than comparing text ids.
         hashtextextended(s.visitor_id, 0) AS vk,
         (s.started_at >= p_from AND s.started_at < p_to) AS cur,
         coalesce(c.signups, 0) AS signups,
         coalesce(c.leads, 0)   AS leads
    FROM analytics_sessions s
    LEFT JOIN (
      SELECT session_id,
             count(*) FILTER (WHERE name = 'Signup') AS signups,
             count(*) FILTER (WHERE name = 'Lead')   AS leads
        FROM analytics_events
       WHERE name IN ('Signup', 'Lead') AND session_id IS NOT NULL
       GROUP BY session_id
    ) c ON c.session_id = s.id
   WHERE ((s.started_at >= p_from AND s.started_at < p_to) OR (s.started_at >= v_prev AND s.started_at < v_prev_to))
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
             WHERE e.name = 'pageview' AND e.path = f->>'page' AND e.created_at >= v_prev));
  ANALYZE _as;

  -- Page views belonging to this period's visits. (A visit's views all happen
  -- after it starts, so created_at >= p_from is a safe, index-friendly bound.)
  CREATE TEMP TABLE _pv ON COMMIT DROP AS
  SELECT e.path, s.vk, e.engaged_ms, e.scroll_pct
    FROM analytics_events e
    JOIN _as s ON s.id = e.session_id AND s.cur
   WHERE e.name = 'pageview' AND e.created_at >= p_from;

  -- Conversions in both periods. Unfiltered, this also counts conversions from
  -- visitors whose browsing was never tracked (beacon blocked).
  CREATE TEMP TABLE _conv ON COMMIT DROP AS
  SELECT e.*, hashtextextended(e.visitor_id, 0) AS vk, (e.created_at >= p_from) AS cur
    FROM analytics_events e
   WHERE e.name IN ('Signup', 'Lead')
     AND ((e.created_at >= p_from AND e.created_at < p_to) OR (e.created_at >= v_prev AND e.created_at < v_prev_to))
     AND (NOT v_filtered OR e.session_id IN (SELECT id FROM _as));

  -- ── Headline numbers, this period vs the one before ──
  SELECT jsonb_build_object(
    'current',  (SELECT jsonb_build_object(
                   'visitors', count(DISTINCT vk), 'visits', count(*),
                   'pageviews', coalesce(sum(pageviews), 0),
                   'bounces', count(*) FILTER (WHERE pageviews <= 1 AND events = 0),
                   'engaged_ms', coalesce(sum(engaged_ms), 0),
                   'signups', (SELECT count(*) FROM _conv WHERE cur AND name = 'Signup'),
                   'leads',   (SELECT count(*) FROM _conv WHERE cur AND name = 'Lead'))
                   FROM _as WHERE cur),
    'previous', (SELECT jsonb_build_object(
                   'visitors', count(DISTINCT vk), 'visits', count(*),
                   'pageviews', coalesce(sum(pageviews), 0),
                   'bounces', count(*) FILTER (WHERE pageviews <= 1 AND events = 0),
                   'engaged_ms', coalesce(sum(engaged_ms), 0),
                   'signups', (SELECT count(*) FROM _conv WHERE NOT cur AND name = 'Signup'),
                   'leads',   (SELECT count(*) FROM _conv WHERE NOT cur AND name = 'Lead'))
                   FROM _as WHERE NOT cur)
  ) INTO v_part;
  v_out := v_out || jsonb_build_object('kpis', v_part);

  -- ── Trend, with the comparison period's values zipped on by bucket position ──
  WITH b AS (
    SELECT t, n FROM generate_series(
             date_trunc(v_bucket, p_from AT TIME ZONE v_tz),
             date_trunc(v_bucket, (p_to - interval '1 microsecond') AT TIME ZONE v_tz),
             ('1 ' || v_bucket)::interval) WITH ORDINALITY AS g(t, n)
  ), pb AS (
    SELECT t, n FROM generate_series(
             date_trunc(v_bucket, v_prev AT TIME ZONE v_tz),
             date_trunc(v_bucket, (v_prev_to - interval '1 microsecond') AT TIME ZONE v_tz),
             ('1 ' || v_bucket)::interval) WITH ORDINALITY AS g(t, n)
  ), v AS (
    SELECT cur, t, count(*) AS visitors, sum(visits) AS visits, sum(pageviews) AS pageviews
      FROM (SELECT cur, date_trunc(v_bucket, started_at AT TIME ZONE v_tz) AS t, vk,
                   count(*) AS visits, sum(pageviews) AS pageviews
              FROM _as GROUP BY 1, 2, 3) x
     GROUP BY cur, t
  ), c AS (
    SELECT cur, date_trunc(v_bucket, created_at AT TIME ZONE v_tz) AS t,
           count(*) FILTER (WHERE name = 'Signup') AS signups,
           count(*) FILTER (WHERE name = 'Lead')   AS leads
      FROM _conv GROUP BY 1, 2
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           't', to_char(b.t, 'YYYY-MM-DD"T"HH24:MI:SS'),
           'visitors', coalesce(v.visitors, 0), 'visits', coalesce(v.visits, 0),
           'pageviews', coalesce(v.pageviews, 0),
           'signups', coalesce(c.signups, 0), 'leads', coalesce(c.leads, 0),
           'prev', CASE WHEN pb.t IS NULL THEN NULL ELSE jsonb_build_object(
             't', to_char(pb.t, 'YYYY-MM-DD"T"HH24:MI:SS'),
             'visitors', coalesce(pv.visitors, 0), 'visits', coalesce(pv.visits, 0),
             'pageviews', coalesce(pv.pageviews, 0),
             'signups', coalesce(pc.signups, 0), 'leads', coalesce(pc.leads, 0)) END
         ) ORDER BY b.t), '[]'::jsonb)
    INTO v_part
    FROM b
    LEFT JOIN v  ON v.cur AND v.t = b.t
    LEFT JOIN c  ON c.cur AND c.t = b.t
    LEFT JOIN pb ON pb.n = b.n
    LEFT JOIN v pv ON NOT pv.cur AND pv.t = pb.t
    LEFT JOIN c pc ON NOT pc.cur AND pc.t = pb.t;
  v_out := v_out || jsonb_build_object('series', v_part);

  -- ── Acquisition ──
  v_out := v_out || jsonb_build_object(
    'channels',  analytics_breakdown('channel'),
    'sources',   analytics_breakdown($e$coalesce(source, 'Direct')$e$, 'channel'),
    'referrers', analytics_breakdown('referrer', 'source', 'referrer IS NOT NULL'),
    'campaigns', analytics_breakdown($e$coalesce(utm_campaign, '(not set)')$e$,
                                     $e$concat_ws(' / ', utm_source, utm_medium)$e$,
                                     'utm_campaign IS NOT NULL OR utm_source IS NOT NULL'));

  -- ── Content ──
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'name', path, 'visitors', visitors, 'pageviews', pageviews,
           'avg_engaged_ms', CASE WHEN eng_n > 0 THEN round(eng_sum / eng_n) ELSE 0 END,
           'avg_scroll',     CASE WHEN sc_n  > 0 THEN round(sc_sum / sc_n)   ELSE 0 END)
           ORDER BY visitors DESC, pageviews DESC, path), '[]'::jsonb)
    INTO v_part
    FROM (SELECT path, count(*) AS visitors, sum(n) AS pageviews,
                 coalesce(sum(eng_sum), 0)::numeric AS eng_sum, sum(eng_n) AS eng_n,
                 coalesce(sum(sc_sum), 0)::numeric AS sc_sum, sum(sc_n) AS sc_n
            FROM (SELECT path, vk, count(*) AS n,
                         sum(engaged_ms) FILTER (WHERE engaged_ms > 0) AS eng_sum,
                         count(*) FILTER (WHERE engaged_ms > 0) AS eng_n,
                         sum(scroll_pct) FILTER (WHERE scroll_pct > 0) AS sc_sum,
                         count(*) FILTER (WHERE scroll_pct > 0) AS sc_n
                    FROM _pv GROUP BY path, vk) per_visitor
           GROUP BY path
           ORDER BY count(*) DESC, sum(n) DESC
           LIMIT 100) t;
  v_out := v_out || jsonb_build_object(
    'pages',       v_part,
    'entry_pages', analytics_breakdown('entry_path', NULL, 'entry_path IS NOT NULL'),
    'exit_pages',  analytics_breakdown('exit_path', NULL, 'exit_path IS NOT NULL'));

  -- ── Audience ──
  v_out := v_out || jsonb_build_object(
    'countries', analytics_breakdown($e$coalesce(country, '')$e$),
    'regions',   analytics_breakdown('region', 'country', 'region IS NOT NULL'),
    'cities',    analytics_breakdown('city', 'country', 'city IS NOT NULL'),
    'devices',   analytics_breakdown($e$coalesce(device, 'Unknown')$e$),
    'browsers',  analytics_breakdown($e$coalesce(browser, 'Unknown')$e$),
    'os',        analytics_breakdown($e$coalesce(os, 'Unknown')$e$),
    'languages', analytics_breakdown($e$coalesce(nullif(lower(split_part(language, '-', 1)), ''), 'unknown')$e$));

  -- ── Interactions (everything that isn't a page view or a banner answer) ──
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'label', label, 'visitors', visitors, 'count', n)
           ORDER BY n DESC, name), '[]'::jsonb)
    INTO v_part
    FROM (SELECT name, label, count(*) AS visitors, sum(n) AS n
            FROM (SELECT e.name, e.props->>'label' AS label, hashtextextended(e.visitor_id, 0) AS vk, count(*) AS n
                    FROM analytics_events e
                    LEFT JOIN _as s ON s.id = e.session_id AND s.cur
                   WHERE e.name NOT IN ('pageview', 'Consent')
                     AND e.created_at >= p_from AND e.created_at < p_to
                     AND (s.id IS NOT NULL OR (NOT v_filtered AND e.session_id IS NULL))
                   GROUP BY 1, 2, 3) per_visitor
           GROUP BY name, label
           ORDER BY sum(n) DESC
           LIMIT 150) t;
  v_out := v_out || jsonb_build_object('events', v_part);

  -- ── Path to signup (each step = unique visitors who did it) ──
  SELECT jsonb_build_array(
    jsonb_build_object('key', 'visited',   'visitors', (SELECT count(DISTINCT vk) FROM _as WHERE cur)),
    jsonb_build_object('key', 'pricing',   'visitors', (SELECT count(DISTINCT vk) FROM _pv WHERE path = '/pricing')),
    jsonb_build_object('key', 'started',   'visitors', (
      SELECT count(DISTINCT s.vk) FROM analytics_events e JOIN _as s ON s.id = e.session_id AND s.cur
       WHERE e.name IN ('Start trial click', 'Signup started') AND e.created_at >= p_from)),
    jsonb_build_object('key', 'signed_up', 'visitors', (SELECT count(DISTINCT vk) FROM _conv WHERE cur AND name = 'Signup'))
  ) INTO v_part;
  v_out := v_out || jsonb_build_object('funnel', v_part);

  -- ── When people visit (viewer's local time): weekday × hour ──
  SELECT coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'visitors', n)), '[]'::jsonb)
    INTO v_part
    FROM (SELECT dow, hr, count(*) AS n
            FROM (SELECT extract(isodow FROM started_at AT TIME ZONE v_tz)::int AS dow,
                         extract(hour FROM started_at AT TIME ZONE v_tz)::int AS hr, vk
                    FROM _as WHERE cur GROUP BY 1, 2, 3) x
           GROUP BY dow, hr) t;
  v_out := v_out || jsonb_build_object('heatmap', v_part);

  -- ── Returning visitors (only knowable for visitors who allowed cookies) ──
  SELECT jsonb_build_object(
    'consented_visitors', count(*),
    'returning', count(*) FILTER (WHERE EXISTS (
       SELECT 1 FROM analytics_sessions o
        WHERE o.visitor_id = x.visitor_id AND o.started_at < x.first_start)))
    INTO v_part
    FROM (SELECT visitor_id, min(started_at) AS first_start, count(*) AS visits
            FROM _as WHERE cur AND consented GROUP BY visitor_id) x;
  v_out := v_out || jsonb_build_object('loyalty', v_part);

  -- ── Cookie-banner answers ──
  SELECT jsonb_build_object(
    'granted', count(*) FILTER (WHERE props->>'choice' = 'granted'),
    'denied',  count(*) FILTER (WHERE props->>'choice' = 'denied'))
    INTO v_part
    FROM analytics_events
   WHERE name = 'Consent' AND created_at >= p_from AND created_at < p_to;
  v_out := v_out || jsonb_build_object('consent', v_part);

  -- ── Every signup / lead, with the visit that converted and the first visit ──
  SELECT coalesce(jsonb_agg(r ORDER BY at DESC), '[]'::jsonb) INTO v_part FROM (
    SELECT c.created_at AS at, jsonb_build_object(
             'at', c.created_at, 'type', c.name, 'props', c.props,
             'consented', left(c.visitor_id, 2) = 'c:', 'tracked', s.id IS NOT NULL,
             'channel', s.channel, 'source', s.source, 'referrer', s.referrer,
             'campaign', s.utm_campaign, 'entry', s.entry_path,
             'country', s.country, 'city', s.city, 'device', s.device, 'browser', s.browser,
             'first_at', ft.started_at, 'first_channel', ft.channel, 'first_source', ft.source,
             'first_campaign', ft.utm_campaign, 'first_entry', ft.entry_path,
             'visits_before', coalesce(vs.n, 0), 'pageviews_before', coalesce(vs.pv, 0)
           ) AS r
      FROM _conv c
      LEFT JOIN analytics_sessions s ON s.id = c.session_id
      LEFT JOIN LATERAL (
        SELECT o.started_at, o.channel, o.source, o.utm_campaign, o.entry_path
          FROM analytics_sessions o WHERE o.visitor_id = c.visitor_id
         ORDER BY o.started_at LIMIT 1) ft ON true
      LEFT JOIN LATERAL (
        SELECT count(*) AS n, sum(o.pageviews) AS pv
          FROM analytics_sessions o
         WHERE o.visitor_id = c.visitor_id AND o.started_at <= c.created_at) vs ON true
     WHERE c.cur
     ORDER BY c.created_at DESC LIMIT 200
  ) t;
  v_out := v_out || jsonb_build_object('conversions', v_part);

  -- Is there any data at all (drives the "waiting for the first visit" state)?
  v_out := v_out || jsonb_build_object(
    'has_data', EXISTS (SELECT 1 FROM analytics_sessions),
    'tz', v_tz, 'bucket', v_bucket);

  RETURN v_out;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Live view: who is on the site in the last 5 minutes.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_realtime()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH live AS (
    SELECT * FROM analytics_sessions WHERE last_seen_at > now() - interval '5 minutes'
  )
  SELECT jsonb_build_object(
    'visitors', (SELECT count(DISTINCT visitor_id) FROM live),
    'pages', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', n, 'visitors', c) ORDER BY c DESC, n), '[]'::jsonb)
                FROM (SELECT exit_path n, count(DISTINCT visitor_id) c FROM live GROUP BY 1 ORDER BY 2 DESC LIMIT 8) x),
    'sources', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', n, 'visitors', c) ORDER BY c DESC, n), '[]'::jsonb)
                FROM (SELECT coalesce(source, 'Direct') n, count(DISTINCT visitor_id) c FROM live GROUP BY 1 ORDER BY 2 DESC LIMIT 8) x),
    'countries', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', n, 'visitors', c) ORDER BY c DESC, n), '[]'::jsonb)
                FROM (SELECT coalesce(country, '') n, count(DISTINCT visitor_id) c FROM live GROUP BY 1 ORDER BY 2 DESC LIMIT 8) x),
    -- Page views per minute over the last 30 minutes, oldest first.
    'minutes', (SELECT jsonb_agg(coalesce(x.c, 0) ORDER BY m.i DESC)
                  FROM generate_series(29, 0, -1) AS m(i)
                  LEFT JOIN (SELECT floor(extract(epoch FROM now() - created_at) / 60)::int AS i, count(*) c
                               FROM analytics_events
                              WHERE name = 'pageview' AND created_at > now() - interval '30 minutes'
                              GROUP BY 1) x ON x.i = m.i)
  );
$$;

-- -----------------------------------------------------------------------------
-- 6. Server-only access
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.analytics_salt()                                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_track(jsonb)                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_dashboard(timestamptz, timestamptz, text, text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_realtime()                                FROM PUBLIC, anon, authenticated;
-- analytics_breakdown splices SQL expressions, so nobody gets to call it
-- directly — only analytics_dashboard (which runs as the owner) uses it.
REVOKE ALL ON FUNCTION public.analytics_breakdown(text, text, text, integer)       FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_salt()                                    TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_track(jsonb)                              TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_dashboard(timestamptz, timestamptz, text, text, jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_realtime()                                TO service_role;

SELECT 'Web analytics installed.' AS message;
