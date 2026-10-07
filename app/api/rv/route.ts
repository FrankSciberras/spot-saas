// =============================================================================
// POST /api/rv — the marketing site's analytics beacon.
// =============================================================================
// Receives page views, interactions and time-on-page updates from the browser
// tracker (components/analytics/SiteAnalytics.tsx), classifies the visit
// (source, channel, country, device) and hands it to analytics_track().
//
// Privacy: the IP address and user-agent are used only to derive today's
// cookieless visitor hash inside the database call and are never stored.
// A consented visitor id is read from the rv_vid cookie only when the visitor
// said "Allow" on the cookie banner; this route is also the one that sets or
// clears that cookie when they answer.
//
// Always answers 204 — a beacon has nobody to show an error to, and a
// consistent answer gives scripts probing the endpoint nothing to learn.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { classifyAcquisition, isBot, parseUserAgent } from '@/lib/analytics/classify';
import { resolveGeo } from '@/lib/analytics/geo';
import { clientIp, consentedVisitorId, isExcludedIp, siteHost } from '@/lib/analytics/server';
import {
  CAMPAIGN_PARAMS,
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  IGNORE_COOKIE,
  SERVER_ONLY_EVENTS,
  VISITOR_COOKIE,
  VISITOR_MAX_AGE,
} from '@/lib/analytics/constants';
import { isAppRoute } from '@/lib/routes';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EVENT_NAME_RE = /^[\p{L}\p{N} .:&'()/_-]{1,60}$/u;
const MAX_BODY = 4096;

/** What the tracker sends. Short keys keep each beacon tiny. */
interface Beacon {
  t: 'pageview' | 'event' | 'engagement';
  /** Path, no query string. */
  p: string;
  /** Page-view id (pageview / engagement). */
  pv?: string;
  /** Event name. */
  n?: string;
  /** Event props. */
  pr?: Record<string, unknown>;
  /** document.referrer (first page of a page load only). */
  r?: string;
  /** Campaign params from the landing URL. */
  q?: Record<string, unknown>;
  /** Engaged ms since the last update, and deepest scroll %. */
  e?: number;
  s?: number;
  /** Screen width, touch points, time zone, language. */
  w?: number;
  tp?: number;
  tz?: string;
  l?: string;
}

// ── A small per-IP rate limit. The app runs as one long-lived Node process
//    (Coolify/Docker), so an in-memory window is meaningful. ──
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
const hits = new Map<string, { start: number; n: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k);
  }
  const cur = hits.get(ip);
  if (!cur || now - cur.start > WINDOW_MS) {
    hits.set(ip, { start: now, n: 1 });
    return false;
  }
  cur.n += 1;
  return cur.n > MAX_PER_WINDOW;
}

const str = (v: unknown, n: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null;

/** Only flat string/number/boolean props, a handful of them, all short. */
function cleanProps(raw: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw).slice(0, 8)) {
    if (!/^[a-z_]{1,30}$/i.test(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 200);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

function cleanPath(raw: unknown): string | null {
  const p = str(raw, 300);
  if (!p || !p.startsWith('/') || p.startsWith('//')) return null;
  return p.split(/[?#]/)[0] || '/';
}

function noContent() {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (process.env.ANALYTICS_DISABLED === '1') return noContent();

  const h = request.headers;
  const host = siteHost(h);

  // Same-origin only: a page elsewhere can't pad our numbers via its visitors.
  const origin = h.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host.toLowerCase() !== host) return noContent();
    } catch {
      return noContent();
    }
  }
  if (h.get('sec-fetch-site') === 'cross-site') return noContent();

  const ua = h.get('user-agent') ?? '';
  const ip = clientIp(h);
  if (isBot(ua) || isExcludedIp(ip) || rateLimited(ip || 'unknown')) return noContent();
  if (request.cookies.get(IGNORE_COOKIE)?.value === '1') return noContent();

  let body: Beacon;
  try {
    const text = await request.text();
    if (!text || text.length > MAX_BODY) return noContent();
    body = JSON.parse(text);
  } catch {
    return noContent();
  }
  if (!body || typeof body !== 'object' || !['pageview', 'event', 'engagement'].includes(body.t)) {
    return noContent();
  }

  const path = cleanPath(body.p);
  // Marketing pages only — never the signed-in app or auth plumbing.
  if (!path || isAppRoute(path) || /^\/(api|auth)(\/|$)/.test(path)) return noContent();

  const pv = typeof body.pv === 'string' && UUID_RE.test(body.pv) ? body.pv : null;
  const props = cleanProps(body.pr);

  // ── The cookie-banner answer: record it, and set/clear the visitor cookie ──
  let consentChoice: 'granted' | 'denied' | null = null;
  let name: string | null = null;
  if (body.t === 'event') {
    name = str(body.n, 60);
    if (!name || !EVENT_NAME_RE.test(name) || SERVER_ONLY_EVENTS.has(name)) return noContent();
    if (name === 'Consent') {
      if (props.choice !== 'granted' && props.choice !== 'denied') return noContent();
      consentChoice = props.choice;
    }
  }

  const cookieVid = consentedVisitorId((n) => request.cookies.get(n)?.value);
  // A fresh "Allow" mints the id now, so this very event already carries it.
  const vid =
    consentChoice === 'granted' ? (cookieVid ?? crypto.randomUUID()) : consentChoice === 'denied' ? null : cookieVid;

  const payload: Record<string, unknown> = {
    type: body.t,
    ip,
    ua,
    host,
    vid,
    pv,
    path,
    name,
    props,
    engaged_ms: typeof body.e === 'number' ? Math.round(body.e) : 0,
    scroll_pct: typeof body.s === 'number' ? Math.round(body.s) : 0,
  };

  // Session attributes — only used if this hit starts a new visit.
  if (body.t !== 'engagement') {
    const params: Record<string, string> = {};
    if (body.q && typeof body.q === 'object') {
      for (const k of CAMPAIGN_PARAMS) {
        const v = str((body.q as Record<string, unknown>)[k], 200);
        if (v) params[k] = v;
      }
    }
    const acq = classifyAcquisition(str(body.r, 1000), params, host);
    const tz = str(body.tz, 64);
    const geo = resolveGeo(h, tz);
    const width = typeof body.w === 'number' && body.w > 0 ? Math.min(Math.round(body.w), 20000) : 0;
    const tech = parseUserAgent(ua, typeof body.tp === 'number' ? body.tp : 0, width);
    const language = str(body.l, 35) ?? h.get('accept-language')?.split(',')[0]?.split(';')[0]?.trim() ?? null;

    Object.assign(payload, {
      referrer: acq.referrer,
      referrer_host: acq.referrerHost,
      source: acq.source,
      channel: acq.channel,
      utm_source: acq.utm.source,
      utm_medium: acq.utm.medium,
      utm_campaign: acq.utm.campaign,
      utm_term: acq.utm.term,
      utm_content: acq.utm.content,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      timezone: tz,
      language,
      device: tech.device,
      browser: tech.browser,
      os: tech.os,
      screen_width: width || null,
    });
  }

  try {
    const { error } = await createAdminClient().rpc('analytics_track', { p: payload });
    if (error) console.error('analytics: beacon not recorded:', error.message);
  } catch (err) {
    console.error('analytics: beacon failed:', err);
  }

  const res = noContent();
  if (consentChoice) {
    // Server-set so Safari's 7-day cap on script-written cookies doesn't apply.
    const secure = request.nextUrl.protocol === 'https:' || h.get('x-forwarded-proto') === 'https';
    const base = { path: '/', sameSite: 'lax' as const, secure };
    res.cookies.set(CONSENT_COOKIE, consentChoice, { ...base, maxAge: CONSENT_MAX_AGE });
    if (consentChoice === 'granted' && vid) {
      res.cookies.set(VISITOR_COOKIE, vid, { ...base, httpOnly: true, maxAge: VISITOR_MAX_AGE });
    } else {
      res.cookies.set(VISITOR_COOKIE, '', { ...base, httpOnly: true, maxAge: 0 });
    }
  }
  return res;
}
