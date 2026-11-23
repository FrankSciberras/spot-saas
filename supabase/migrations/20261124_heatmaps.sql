-- =============================================================================
-- HEATMAPS — where visitors click and tap on the marketing website.
-- =============================================================================
-- Adds, on top of 20261007_web_analytics.sql (run that first):
--
--   analytics_clicks        one row per click / tap on a public page: where it
--                           landed (page coordinates AND which element, so it
--                           can be redrawn on any screen size), the screen it
--                           happened on, how long after the page opened, and
--                           whether it was a "rage" click (several fast clicks
--                           on one spot) or a "dead" click (nothing happened).
--   analytics_clicks_add()  ingest — called by /api/rv for beacons of type
--                           'clicks' (the browser sends them in small batches).
--   analytics_heatmap()     read — for Admin Console → Analytics → Heatmaps:
--                           every page with clicks, or every click on one page.
--
-- Privacy: no typed text is ever recorded — only the element's own label
-- (a button or link's text, already on the page), with anything that looks
-- like an email address or a long number masked by the browser before
-- sending. No IP address or user-agent is stored here; the click belongs to
-- the same cookieless visit as the page view it happened on.
--
-- Access: RLS on with NO policies, functions granted to service_role only.
-- Clicks are kept for 13 months. Safe to run more than once.
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics_clicks (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id   uuid        NOT NULL REFERENCES analytics_sessions(id) ON DELETE CASCADE,
  -- The page view it happened on (analytics_events.id where name = 'pageview').
  pageview_id  uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  path         text        NOT NULL,
  -- Screen: viewport width, and the page's full width / height at the time.
  vw           integer     NOT NULL,
  dw           integer     NOT NULL,
  dh           integer     NOT NULL,
  -- Where on the page (CSS pixels from the top-left of the document) …
  x            integer     NOT NULL,
  y            integer     NOT NULL,
  -- … and on which element: a short CSS path, plus the spot inside it
  -- (0–1000 across / down), so a click redraws in the right place even when
  -- the page is shown at another width.
  sel          text,
  rx           smallint,
  ry           smallint,
  tag          text,
  label        text,
  href         text,
  -- Milliseconds between the page opening and the click.
  ms           integer,
  rage         boolean     NOT NULL DEFAULT false,
  dead         boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_analytics_clicks_path_created ON analytics_clicks(path, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_clicks_created      ON analytics_clicks(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_clicks_session      ON analytics_clicks(session_id);

-- Page views of one page over a window (the heatmap's "how many visitors
-- clicked" denominator and scroll reach).
CREATE INDEX IF NOT EXISTS idx_analytics_events_pageview_path
  ON analytics_events(path, created_at) WHERE name = 'pageview';

ALTER TABLE analytics_clicks ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE analytics_clicks IS 'Marketing-site clicks/taps for heatmaps. Service role only. See migration 20261124_heatmaps.';

-- -----------------------------------------------------------------------------
-- Ingest. p: { ip, ua, host, vid, pv, path, clicks: [{ x, y, vw, dw, dh, sel,
-- rx, ry, tag, label, href, ms, ago, rage, dead }, …] } — already cleaned and
-- type-checked by /api/rv. `ago` is how many ms before sending the click
-- happened (clicks are batched), so created_at is the moment of the click.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_clicks_add(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_hash    text;
  v_cvid    text;
  v_pv      uuid;
  v_session uuid;
  v_have    integer;
  v_added   integer;
BEGIN
  IF jsonb_typeof(p->'clicks') <> 'array' OR jsonb_array_length(p->'clicks') = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no clicks');
  END IF;

  v_hash := 'h:' || left(encode(sha256(convert_to(
              analytics_salt() || '|' || coalesce(p->>'host', '') || '|' ||
              coalesce(p->>'ip', '') || '|' || coalesce(p->>'ua', ''), 'UTF8')), 'hex'), 32);
  IF coalesce(p->>'vid', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_cvid := 'c:' || (p->>'vid');
  END IF;

  -- The page view the clicks happened on — only if it is this visitor's own.
  IF coalesce(p->>'pv', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT e.id, e.session_id INTO v_pv, v_session
      FROM analytics_events e
     WHERE e.id = (p->>'pv')::uuid
       AND e.name = 'pageview'
       AND e.visitor_id IN (coalesce(v_cvid, v_hash), v_hash);
  END IF;
  -- Otherwise the visitor's open visit (same rule as analytics_note).
  IF v_session IS NULL THEN
    SELECT id INTO v_session
      FROM analytics_sessions
     WHERE visitor_id IN (coalesce(v_cvid, v_hash), v_hash)
       AND last_seen_at > now() - interval '3 hours'
     ORDER BY last_seen_at DESC
     LIMIT 1;
  END IF;
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no visit');
  END IF;

  -- A hard cap per visit keeps a stuck or scripted tab from filling the table.
  SELECT count(*) INTO v_have FROM analytics_clicks WHERE session_id = v_session;
  IF v_have >= 600 THEN
    RETURN jsonb_build_object('ok', true, 'capped', true);
  END IF;

  INSERT INTO analytics_clicks
    (session_id, pageview_id, created_at, path, vw, dw, dh, x, y, sel, rx, ry, tag, label, href, ms, rage, dead)
  SELECT v_session, v_pv,
         now() - make_interval(secs => LEAST(GREATEST(coalesce(c.ago, 0), 0), 900000) / 1000.0),
         left(p->>'path', 300),
         LEAST(GREATEST(c.vw, 1), 20000), LEAST(GREATEST(c.dw, 1), 20000), LEAST(GREATEST(c.dh, 1), 200000),
         LEAST(GREATEST(c.x, 0), 20000), LEAST(GREATEST(c.y, 0), 200000),
         left(c.sel, 300),
         LEAST(GREATEST(c.rx, 0), 1000)::smallint, LEAST(GREATEST(c.ry, 0), 1000)::smallint,
         left(c.tag, 20), left(c.label, 80), left(c.href, 200),
         LEAST(GREATEST(c.ms, 0), 86400000),
         coalesce(c.rage, false), coalesce(c.dead, false)
    FROM jsonb_to_recordset(p->'clicks') AS c(
           x integer, y integer, vw integer, dw integer, dh integer,
           sel text, rx integer, ry integer, tag text, label text, href text,
           ms integer, ago integer, rage boolean, dead boolean)
   WHERE c.x IS NOT NULL AND c.y IS NOT NULL AND c.vw IS NOT NULL AND c.dw IS NOT NULL AND c.dh IS NOT NULL
   LIMIT LEAST(40, 600 - v_have);
  GET DIAGNOSTICS v_added = ROW_COUNT;

  -- Retention, piggy-backed: now and then drop clicks older than 13 months.
  IF random() < 0.002 THEN
    DELETE FROM analytics_clicks WHERE created_at < now() - interval '13 months';
  END IF;

  RETURN jsonb_build_object('ok', true, 'added', v_added);
END;
$$;

-- -----------------------------------------------------------------------------
-- Read. Clicks that HAPPENED in [p_from, p_to) (so "the last 30 minutes" is a
-- live view), narrowed by the dashboard's visit filters (same keys as
-- analytics_extras: channel, source, campaign, utm_source, utm_medium,
-- country, region, city, device, browser, os).
--
--   p_path NULL → { pages: [...], totals: {...} } — every page with clicks.
--   p_path set  → every click on that page (newest 20 000), optionally only
--                 one screen size (p_layout: 'phone' < 601 px wide,
--                 'tablet' < 1024 px, 'desktop'), with the elements, visits
--                 and page-view numbers needed to draw and explain the map.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_heatmap(
  p_from    timestamptz,
  p_to      timestamptz,
  p_path    text    DEFAULT NULL,
  p_layout  text    DEFAULT NULL,
  p_filters jsonb   DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '64MB'
AS $$
DECLARE
  f       jsonb := coalesce(p_filters, '{}'::jsonb);
  v_out   jsonb;
  v_total integer;
  v_dev   text := CASE p_layout WHEN 'phone' THEN 'Mobile' WHEN 'tablet' THEN 'Tablet' WHEN 'desktop' THEN 'Desktop' END;
BEGIN
  IF to_regclass('pg_temp._hc') IS NOT NULL THEN DROP TABLE pg_temp._hc; END IF;

  CREATE TEMP TABLE _hc ON COMMIT DROP AS
  SELECT c.id, c.session_id, c.created_at, c.path, c.vw, c.dw, c.dh, c.x, c.y,
         coalesce(c.sel, '') AS sel, c.rx, c.ry, c.tag, c.label, c.href, c.ms, c.rage, c.dead,
         CASE WHEN c.vw < 601 THEN 'phone' WHEN c.vw < 1024 THEN 'tablet' ELSE 'desktop' END AS layout
    FROM analytics_clicks c
    JOIN analytics_sessions s ON s.id = c.session_id
   WHERE c.created_at >= p_from AND c.created_at < p_to
     AND (p_path IS NULL OR c.path = p_path)
     AND (f->>'channel'    IS NULL OR s.channel = f->>'channel')
     AND (f->>'source'     IS NULL OR coalesce(s.source, 'Direct') = f->>'source')
     AND (f->>'campaign'   IS NULL OR s.utm_campaign = f->>'campaign')
     AND (f->>'utm_source' IS NULL OR s.utm_source = f->>'utm_source')
     AND (f->>'utm_medium' IS NULL OR s.utm_medium = f->>'utm_medium')
     AND (f->>'country'    IS NULL OR coalesce(s.country, '') = f->>'country')
     AND (f->>'region'     IS NULL OR s.region = f->>'region')
     AND (f->>'city'       IS NULL OR s.city = f->>'city')
     AND (f->>'device'     IS NULL OR coalesce(s.device, 'Unknown') = f->>'device')
     AND (f->>'browser'    IS NULL OR coalesce(s.browser, 'Unknown') = f->>'browser')
     AND (f->>'os'         IS NULL OR coalesce(s.os, 'Unknown') = f->>'os');

  -- ── Every page with clicks ──
  IF p_path IS NULL THEN
    SELECT jsonb_build_object(
      'pages', coalesce((
        SELECT jsonb_agg(row_to_json(t) ORDER BY t.clicks DESC)
          FROM (
            WITH agg AS (
              SELECT h.path,
                     count(*)                                     AS clicks,
                     count(DISTINCT h.session_id)                 AS visits,
                     count(*) FILTER (WHERE h.rage)               AS rage,
                     count(*) FILTER (WHERE h.dead)               AS dead,
                     count(*) FILTER (WHERE h.layout = 'phone')   AS phone,
                     count(*) FILTER (WHERE h.layout = 'tablet')  AS tablet,
                     count(*) FILTER (WHERE h.layout = 'desktop') AS desktop,
                     max(h.created_at)                            AS last_at
                FROM _hc h
               GROUP BY h.path
               ORDER BY count(*) DESC
               LIMIT 150
            ), pv AS (
              -- Page views of those pages in the window (one pass, not one per page).
              SELECT e.path, count(*) AS views
                FROM analytics_events e
                JOIN analytics_sessions s ON s.id = e.session_id
               WHERE e.name = 'pageview'
                 AND e.created_at >= p_from AND e.created_at < p_to
                 AND e.path IN (SELECT path FROM agg)
                 AND (f->>'channel'  IS NULL OR s.channel = f->>'channel')
                 AND (f->>'source'   IS NULL OR coalesce(s.source, 'Direct') = f->>'source')
                 AND (f->>'campaign' IS NULL OR s.utm_campaign = f->>'campaign')
                 AND (f->>'country'  IS NULL OR coalesce(s.country, '') = f->>'country')
                 AND (f->>'device'   IS NULL OR coalesce(s.device, 'Unknown') = f->>'device')
               GROUP BY e.path
            )
            SELECT agg.*, coalesce(pv.views, 0) AS views
              FROM agg LEFT JOIN pv ON pv.path = agg.path
          ) t), '[]'::jsonb),
      'totals', (
        SELECT jsonb_build_object(
          'clicks',  count(*),
          'visits',  count(DISTINCT session_id),
          'pages',   count(DISTINCT path),
          'rage',    count(*) FILTER (WHERE rage),
          'dead',    count(*) FILTER (WHERE dead),
          'phone',   count(*) FILTER (WHERE layout = 'phone'),
          'tablet',  count(*) FILTER (WHERE layout = 'tablet'),
          'desktop', count(*) FILTER (WHERE layout = 'desktop'),
          'last_at', max(created_at))
          FROM _hc)
    ) INTO v_out;
    RETURN v_out;
  END IF;

  -- ── One page ──
  -- Clicks per screen size, before narrowing to one (for the switcher).
  SELECT jsonb_build_object(
           'phone',   count(*) FILTER (WHERE layout = 'phone'),
           'tablet',  count(*) FILTER (WHERE layout = 'tablet'),
           'desktop', count(*) FILTER (WHERE layout = 'desktop'))
    INTO v_out FROM _hc;
  v_out := jsonb_build_object('layouts', v_out);

  IF p_layout IS NOT NULL THEN
    DELETE FROM _hc WHERE layout <> p_layout;
  END IF;
  SELECT count(*) INTO v_total FROM _hc;
  -- Keep the newest 20 000 — plenty for a map, small enough to send.
  IF v_total > 20000 THEN
    DELETE FROM _hc WHERE id < (SELECT id FROM _hc ORDER BY id DESC OFFSET 19999 LIMIT 1);
  END IF;

  WITH els AS (
    SELECT sel,
           (row_number() OVER (ORDER BY count(*) DESC, sel) - 1)::integer AS ix,
           max(tag) AS tag,
           mode() WITHIN GROUP (ORDER BY label) AS label,
           mode() WITHIN GROUP (ORDER BY href)  AS href
      FROM _hc GROUP BY sel
  ), ses AS (
    SELECT h.session_id,
           (row_number() OVER (ORDER BY min(h.created_at)) - 1)::integer AS ix
      FROM _hc h GROUP BY h.session_id
  )
  SELECT v_out || jsonb_build_object(
    'total', v_total,
    'elements', coalesce((SELECT jsonb_agg(jsonb_build_object('s', sel, 't', tag, 'l', label, 'h', href) ORDER BY ix) FROM els), '[]'::jsonb),
    'visits', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'd', coalesce(s.device, 'Unknown'), 'c', s.country, 'src', coalesce(s.source, 'Direct'),
               'ch', s.channel, 'at', s.started_at, 'b', s.browser) ORDER BY ses.ix)
        FROM ses JOIN analytics_sessions s ON s.id = ses.session_id), '[]'::jsonb),
    -- [epoch ms, x, y, dw, dh, vw, element, rx, ry, flags (1 rage, 2 dead), ms since page opened, visit]
    'clicks', coalesce((
      SELECT jsonb_agg(jsonb_build_array(
               (extract(epoch FROM h.created_at) * 1000)::bigint, h.x, h.y, h.dw, h.dh, h.vw,
               els.ix, coalesce(h.rx, -1), coalesce(h.ry, -1),
               (CASE WHEN h.rage THEN 1 ELSE 0 END) + (CASE WHEN h.dead THEN 2 ELSE 0 END),
               coalesce(h.ms, -1), ses.ix) ORDER BY h.created_at)
        FROM _hc h
        JOIN els ON els.sel = h.sel
        JOIN ses ON ses.session_id = h.session_id), '[]'::jsonb)
  ) INTO v_out;

  -- Page views of this page in the same window — the denominator for "how
  -- many visitors clicked", plus reading time and how far down they got.
  SELECT v_out || jsonb_build_object('page', jsonb_build_object(
           'views',      count(*),
           'visits',     count(DISTINCT e.session_id),
           'engaged_ms', coalesce(round(avg(e.engaged_ms) FILTER (WHERE e.engaged_ms > 0)), 0),
           'scroll',     coalesce(round(avg(e.scroll_pct) FILTER (WHERE e.scroll_pct > 0)), 0),
           'measured',   count(*) FILTER (WHERE e.scroll_pct > 0),
           -- reach[k] = page views that scrolled to at least k×5 % of the page
           'reach',      (SELECT jsonb_agg(n ORDER BY k) FROM (
                            SELECT k, count(*) FILTER (WHERE e2.scroll_pct >= k * 5) AS n
                              FROM generate_series(0, 20) AS k
                              CROSS JOIN LATERAL (
                                SELECT e3.scroll_pct FROM analytics_events e3
                                  JOIN analytics_sessions s3 ON s3.id = e3.session_id
                                 WHERE e3.name = 'pageview' AND e3.path = p_path AND e3.scroll_pct > 0
                                   AND e3.created_at >= p_from AND e3.created_at < p_to
                                   AND (v_dev IS NULL OR coalesce(s3.device, 'Unknown') = v_dev)
                                   AND (f->>'channel'  IS NULL OR s3.channel = f->>'channel')
                                   AND (f->>'source'   IS NULL OR coalesce(s3.source, 'Direct') = f->>'source')
                                   AND (f->>'campaign' IS NULL OR s3.utm_campaign = f->>'campaign')
                                   AND (f->>'country'  IS NULL OR coalesce(s3.country, '') = f->>'country')
                                   AND (f->>'device'   IS NULL OR coalesce(s3.device, 'Unknown') = f->>'device')
                              ) e2
                             GROUP BY k) r)))
    INTO v_out
    FROM analytics_events e
    JOIN analytics_sessions s ON s.id = e.session_id
   WHERE e.name = 'pageview' AND e.path = p_path
     AND e.created_at >= p_from AND e.created_at < p_to
     AND (v_dev IS NULL OR coalesce(s.device, 'Unknown') = v_dev)
     AND (f->>'channel'  IS NULL OR s.channel = f->>'channel')
     AND (f->>'source'   IS NULL OR coalesce(s.source, 'Direct') = f->>'source')
     AND (f->>'campaign' IS NULL OR s.utm_campaign = f->>'campaign')
     AND (f->>'country'  IS NULL OR coalesce(s.country, '') = f->>'country')
     AND (f->>'device'   IS NULL OR coalesce(s.device, 'Unknown') = f->>'device');

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_clicks_add(jsonb)                                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_heatmap(timestamptz, timestamptz, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_clicks_add(jsonb)                                    TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_heatmap(timestamptz, timestamptz, text, text, jsonb) TO service_role;
