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
//
// Signups and leads are NOT sent from here — the server records them itself.
// =============================================================================

import { isAppRoute } from '@/lib/routes';
import { CAMPAIGN_PARAMS, COLLECT_PATH, CONSENT_COOKIE, CONSENT_MAX_AGE, IGNORE_COOKIE } from './constants';

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

/** Whether this browser should send anything at all. */
export function trackingEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const dev = process.env.NEXT_PUBLIC_ANALYTICS_DEV === '1';
  if (process.env.NODE_ENV !== 'production' && !dev) return false;
  if (!dev && /^(localhost|127\.|0\.0\.0\.0|\[::1\])|\.local$/.test(window.location.hostname)) return false;
  // Automated browsers, the Rovora Driver app's WebView, and opted-out admins.
  if (navigator.webdriver) return false;
  if ((window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView) return false;
  if (readCookie(IGNORE_COOKIE) === '1') return false;
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
export function trackEvent(name: string, props: Props = {}) {
  if (!trackingEnabled()) return;
  const path = current?.path ?? window.location.pathname;
  if (!trackablePath(path)) return;
  send({ t: 'event', n: name, p: path, pr: props });
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
  if (!trackingEnabled()) return;
  const path = current?.path ?? window.location.pathname;
  if (!trackablePath(path)) return;
  // Must be a real fetch (not a beacon) so the Set-Cookie in the reply sticks.
  await send({ t: 'event', n: 'Consent', p: path, pr: { choice } }, { reliable: true });
}
