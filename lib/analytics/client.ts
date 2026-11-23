// =============================================================================
// Browser side of Rovora's web analytics (marketing site only).
// =============================================================================
// A few hundred bytes of beacon per page — no third-party script, nothing
// stored on the device unless the visitor clicks "Allow" on the cookie banner.
//
//   pageview    on every route change (path only; campaign params on landing)
//   engagement  visible time + deepest scroll, flushed when the page is hidden
//               or left, so "time on page" is real reading time, not tab time
//   event       interactions (trial CTA clicks, outbound links, chat opened…)
//   note        measurements, not actions: page speed, sections / screenshots
//               seen, a missing page — never counted as an interaction
//
// Signups and leads are NOT sent from here — the server records them itself.
// =============================================================================

import { isAppRoute } from '@/lib/routes';
import { CAMPAIGN_PARAMS, COLLECT_PATH, CONSENT_CHANGE_EVENT, CONSENT_COOKIE, CONSENT_MAX_AGE, IGNORE_COOKIE, NOTE_EVENTS } from './constants';
import { SIGNUP_ERROR_EVENT, SIGNUP_STEP_EVENT, signupErrorKind, type SignupStepId } from './signup-funnel';

type Props = Record<string, string | number | boolean>;

interface Page {
  id: string;
  path: string;
  /** When the page last became visible (ms), or null while hidden. */
  visibleSince: number | null;
  /** Visible time not yet reported. */
  pendingMs: number;
  maxScroll: number;
  reportedScroll: number;
  /** When the page view started (ms) — heatmap clicks report time since. */
  openedAt: number;
}

let current: Page | null = null;
let landed = false;

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

/** Global Privacy Control — a browser-level "do not sell/share" signal. */
export function hasPrivacySignal(): boolean {
  return typeof navigator !== 'undefined' && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

function trackablePath(path: string): boolean {
  return !isAppRoute(path) && !/^\/(api|auth)(\/|$)/.test(path);
}

/**
 * Whether this browser should send anything at all. `honourOptOut: false`
 * ignores only the admin "Don't count my visits" cookie (see gtm.ts).
 */
export function trackingEnabled({ honourOptOut = true }: { honourOptOut?: boolean } = {}): boolean {
  if (typeof window === 'undefined') return false;
  const dev = process.env.NEXT_PUBLIC_ANALYTICS_DEV === '1';
  if (process.env.NODE_ENV !== 'production' && !dev) return false;
  if (!dev && /^(localhost|127\.|0\.0\.0\.0|\[::1\])|\.local$/.test(window.location.hostname)) return false;
  // Automated browsers, the Rovora Driver app's WebView, and opted-out admins.
  if (navigator.webdriver) return false;
  if ((window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView) return false;
  if (honourOptOut && readCookie(IGNORE_COOKIE) === '1') return false;
  // Pages shown inside a frame — e.g. the admin heatmap viewer — never count.
  try {
    if (window.self !== window.top) return false;
  } catch {
    return false;
  }
  return true;
}

function uuid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  // Fallback for older Safari on plain http (randomUUID needs a secure context).
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function send(payload: Record<string, unknown>, opts: { reliable?: boolean } = {}): Promise<void> {
  const body = JSON.stringify(payload);
  // text/plain keeps it a "simple" request: no CORS preflight, beacon-friendly.
  try {
    if (!opts.reliable && navigator.sendBeacon) {
      if (navigator.sendBeacon(COLLECT_PATH, new Blob([body], { type: 'text/plain' }))) return Promise.resolve();
    }
  } catch {
    /* fall through to fetch */
  }
  return fetch(COLLECT_PATH, {
    method: 'POST',
    body,
    keepalive: true,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'text/plain' },
  }).then(
    () => undefined,
    () => undefined,
  );
}

/** Send a raw beacon (used by heatmap-capture.ts). */
export function sendBeacon(payload: Record<string, unknown>): void {
  void send(payload);
}

/** The page view in progress, if this page is tracked. */
export function currentPageView(): { id: string; path: string; openedAt: number } | null {
  return current ? { id: current.id, path: current.path, openedAt: current.openedAt } : null;
}

function scrollDepth(): number {
  const doc = document.documentElement;
  const full = Math.max(doc.scrollHeight, document.body?.scrollHeight ?? 0);
  if (full <= window.innerHeight) return 100;
  return Math.min(100, Math.round(((window.scrollY + window.innerHeight) / full) * 100));
}

function accrue() {
  if (current?.visibleSince != null) {
    current.pendingMs += Date.now() - current.visibleSince;
    current.visibleSince = document.visibilityState === 'visible' ? Date.now() : null;
  }
}

/** Report visible time / scroll gathered since the last report. */
export function flushEngagement() {
  if (!current || !trackingEnabled()) return;
  accrue();
  const ms = Math.min(current.pendingMs, 30 * 60_000);
  const scrollGrew = current.maxScroll > current.reportedScroll;
  if (ms < 1000 && !scrollGrew) return;
  send({ t: 'engagement', p: current.path, pv: current.id, e: ms, s: current.maxScroll });
  current.pendingMs = 0;
  current.reportedScroll = current.maxScroll;
}

/** Start a new page view (called on every route change). */
export function trackPageview(path: string) {
  if (!trackingEnabled()) return;
  if (current && current.path === path) return; // same page re-rendered
  flushEngagement();

  if (!trackablePath(path)) {
    current = null;
    return;
  }

  current = {
    id: uuid(),
    path,
    visibleSince: document.visibilityState === 'visible' ? Date.now() : null,
    pendingMs: 0,
    maxScroll: 0,
    reportedScroll: 0,
    openedAt: Date.now(),
  };
  // Content may not be laid out yet; measure the first screen a beat later.
  setTimeout(() => {
    if (current) current.maxScroll = Math.max(current.maxScroll, scrollDepth());
  }, 600);

  const payload: Record<string, unknown> = {
    t: 'pageview',
    p: path,
    pv: current.id,
    w: window.screen?.width || window.innerWidth,
    tp: navigator.maxTouchPoints || 0,
    l: navigator.language,
  };
  try {
    payload.tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* very old browser */
  }
  // Referrer and campaign tags describe how the visitor ARRIVED — only the
  // first page of a page load carries them; later in-app navigations don't.
  if (!landed) {
    landed = true;
    if (document.referrer) payload.r = document.referrer;
    const qs = new URLSearchParams(window.location.search);
    const q: Record<string, string> = {};
    for (const k of CAMPAIGN_PARAMS) {
      const v = qs.get(k);
      if (v) q[k] = v.slice(0, 200);
    }
    if (Object.keys(q).length) payload.q = q;
  }
  send(payload);
}

/** Record an interaction, e.g. trackEvent('Chat opened'). */
export function trackEvent(name: string, props: Props = {}, opts: { path?: string } = {}) {
  if (!trackingEnabled()) return;
  const path = opts.path ?? current?.path ?? window.location.pathname;
  if (!trackablePath(path)) return;
  send({ t: 'event', n: name, p: path, pr: props });
}

/**
 * Record something measured rather than done (see NOTE_EVENTS): page speed, a
 * section or screenshot coming into view, a missing page. Never counts as an
 * interaction, so it can't change the bounce rate.
 */
export function trackNote(name: string, props: Props = {}, opts: { path?: string } = {}) {
  if (!trackingEnabled()) return;
  const path = opts.path ?? current?.path ?? window.location.pathname;
  if (!trackablePath(path)) return;
  send({ t: 'note', n: name, p: path, pr: props });
}

/**
 * Report that this URL doesn't exist, and what led here: the page that linked
 * to it (inside the site), the other site, or nothing (typed / bookmarked).
 * Called by the 404 page as it mounts — before the page view of the missing URL
 * replaces `current` — and sent a moment later, once that page view has opened
 * the visit it belongs to.
 */
export function trackNotFound(path: string): void {
  if (!trackingEnabled()) return;
  let from = current && current.path !== path ? current.path : '';
  if (!from && document.referrer) {
    try {
      const r = new URL(document.referrer);
      from = r.host === window.location.host ? r.pathname : r.host.replace(/^www\./, '');
    } catch {
      /* unparseable referrer */
    }
  }
  setTimeout(() => trackNote(NOTE_EVENTS.notFound, { label: path.slice(0, 200), from: from.slice(0, 200) || '(direct)' }, { path }), 1200);
}

// ── Page speed (Core Web Vitals) for the page a visit LANDED on ──
// Only a full page load has meaningful load timings, so this measures the first
// page of each load and reports once, when that page is hidden or left. Values
// are rounded milliseconds (CLS is a unitless score ×1000, so it stays an int).
let vitalsInstalled = false;
let vitalsReport: (() => void) | null = null;
export function installVitals(): void {
  if (vitalsInstalled || typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;
  vitalsInstalled = true;

  const landingPath = window.location.pathname;
  let lcp = 0;
  let cls = 0;
  let inp = 0;
  let sent = false;
  const observers: PerformanceObserver[] = [];
  const watch = (type: string, cb: (entries: PerformanceEntry[]) => void, extra: Record<string, unknown> = {}) => {
    try {
      const po = new PerformanceObserver((list) => cb(list.getEntries()));
      po.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
      observers.push(po);
    } catch {
      /* this browser doesn't support that entry type */
    }
  };

  watch('largest-contentful-paint', (es) => {
    const last = es[es.length - 1];
    if (last) lcp = last.startTime;
  });
  watch('layout-shift', (es) => {
    for (const e of es as (PerformanceEntry & { value?: number; hadRecentInput?: boolean })[]) {
      if (!e.hadRecentInput && typeof e.value === 'number') cls += e.value;
    }
  });
  // Slowest response to a tap/click/key — with only a few interactions per
  // visit, that's what INP comes down to.
  watch('event', (es) => {
    for (const e of es as (PerformanceEntry & { interactionId?: number })[]) {
      if (e.interactionId && e.duration > inp) inp = e.duration;
    }
  }, { durationThreshold: 40 });

  const report = () => {
    if (sent) return;
    sent = true;
    for (const o of observers) o.disconnect();
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
    const ttfb = nav ? Math.max(0, nav.responseStart - nav.startTime) : 0;
    const load = nav && nav.loadEventEnd > 0 ? nav.loadEventEnd - nav.startTime : 0;
    if (!ttfb && !lcp && !fcp) return; // nothing measured (e.g. a restored back/forward page)
    const props: Props = { label: landingPath };
    if (ttfb) props.ttfb = Math.round(ttfb);
    if (fcp) props.fcp = Math.round(fcp);
    if (lcp) props.lcp = Math.round(lcp);
    if (load) props.load = Math.round(load);
    props.cls = Math.round(cls * 1000);
    if (inp) props.inp = Math.round(inp);
    trackNote(NOTE_EVENTS.speed, props, { path: landingPath });
  };
  // Report when the landing page is hidden/left, or when the visitor moves on
  // inside the site (the next page isn't a fresh load, so it isn't measured).
  const onHide = () => { if (document.visibilityState === 'hidden') report(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', report);
  vitalsReport = () => {
    if (window.location.pathname !== landingPath) report();
  };
}

/** Called on every route change: leaving the landing page reports its speed. */
export function noteRouteChange(): void {
  vitalsReport?.();
}

// ── Sections and screenshots seen ──
// A homepage section (section[id]) or a product screenshot (.shot) counts as
// seen once per page view, when at least a third of it is on screen.
let seenObserver: IntersectionObserver | null = null;
export function observeSeen(): () => void {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined' || !trackingEnabled()) return () => {};
  seenObserver?.disconnect();
  const seen = new Set<Element>();
  const path = window.location.pathname;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target)) continue;
        seen.add(entry.target);
        io.unobserve(entry.target);
        const el = entry.target as HTMLElement;
        if (el.matches('.shot')) {
          const where = el.querySelector('.shot-url b')?.textContent?.trim() || el.closest('section[id]')?.id || 'screenshot';
          trackNote(NOTE_EVENTS.screenshot, { label: `${path} · ${where}`.slice(0, 120) }, { path });
        } else if (el.id) {
          trackNote(NOTE_EVENTS.section, { label: `${path}#${el.id}`.slice(0, 120) }, { path });
        }
      }
    },
    { threshold: 0.33 },
  );
  seenObserver = io;
  // Skip copies hidden for this screen size (e.g. the accordion's inline mock).
  document.querySelectorAll('section[id], .shot').forEach((el) => {
    if ((el as HTMLElement).offsetParent !== null || (el as HTMLElement).getClientRects().length > 0) io.observe(el);
  });
  return () => io.disconnect();
}

/**
 * One step of the sign-up form / code screen (see lib/analytics/signup-funnel).
 * `via` says which door they used, so email, Google and chat can be compared.
 */
export function trackSignupStep(
  step: SignupStepId,
  via: 'Email' | 'Google' | 'Chat' | null = null,
  extra: { how?: 'link' | 'code'; path?: string } = {},
) {
  const props: Props = via ? { label: step, via } : { label: step };
  if (extra.how) props.how = extra.how;
  // The emailed link lands on /auth/confirm, which analytics never records —
  // that step is filed under the sign-up page it belongs to.
  trackEvent(SIGNUP_STEP_EVENT, props, extra.path ? { path: extra.path } : {});
}

/** A sign-up attempt that failed, sorted into a fixed kind — never the raw text. */
export function trackSignupError(message: string | null | undefined, via: 'Email' | 'Google' | 'Chat' | null = null) {
  const kind = signupErrorKind(message);
  trackEvent(SIGNUP_ERROR_EVENT, via ? { label: kind, via } : { label: kind });
}

// ── Page lifecycle wiring (installed once by <SiteAnalytics />) ──

let installed = false;
export function installLifecycle(): () => void {
  if (installed || typeof window === 'undefined') return () => {};
  installed = true;

  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (current) current.maxScroll = Math.max(current.maxScroll, scrollDepth());
    });
  };
  const onVisibility = () => {
    if (!current) return;
    if (document.visibilityState === 'hidden') {
      flushEngagement();
      if (current) current.visibleSince = null;
    } else if (current.visibleSince == null) {
      current.visibleSince = Date.now();
    }
  };
  const onPageHide = () => flushEngagement();

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    installed = false;
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
  };
}

// ── Consent ──

export type ConsentChoice = 'granted' | 'denied';

export function getConsent(): ConsentChoice | null {
  const v = readCookie(CONSENT_COOKIE);
  return v === 'granted' || v === 'denied' ? v : null;
}

/**
 * Save the cookie-banner answer. The server sets (or removes) the visitor id
 * cookie in reply; the choice cookie is also written here first so the banner
 * stays closed even if the request is blocked.
 */
export async function setConsent(choice: ConsentChoice): Promise<void> {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${choice}; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent<ConsentChoice>(CONSENT_CHANGE_EVENT, { detail: choice }));
  if (!trackingEnabled()) return;
  const path = current?.path ?? window.location.pathname;
  if (!trackablePath(path)) return;
  // Must be a real fetch (not a beacon) so the Set-Cookie in the reply sticks.
  await send({ t: 'event', n: 'Consent', p: path, pr: { choice } }, { reliable: true });
}
