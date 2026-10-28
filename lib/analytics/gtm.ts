// =============================================================================
// Google Tag Manager — marketing site only, and only after "Allow".
// =============================================================================
// Rovora's own analytics (client.ts) counts every visit without cookies. The
// tags in our GTM container (Google Analytics, Google Ads…) do set cookies, so
// the container isn't even requested until the visitor clicks "Allow" on the
// cookie banner. Before that, Google receives nothing.
//
// Same exclusions as our own analytics: never in the signed-in app, in
// development, for bots, in the Rovora Driver app's WebView, or for admins who
// switched on "Don't count my visits" — except while Tag Assistant is
// previewing the container (?gtm_debug=…), so the owner can still test it.
// =============================================================================

import { isAppRoute } from '@/lib/routes';
import { getConsent, trackingEnabled } from './client';
import { GTM_ID } from './constants';

type ConsentState = 'granted' | 'denied';
type DataLayerWindow = Window & { dataLayer?: unknown[] };

let loaded = false;
let applied: ConsentState | null = null;

// gtag.js only reads commands pushed as an `arguments` object, not an array.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(..._command: unknown[]) {
  const w = window as DataLayerWindow;
  w.dataLayer = w.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  w.dataLayer.push(arguments);
}

/** Google Consent Mode v2: "Allow" covers analytics and ads measurement alike. */
function signals(state: ConsentState) {
  return {
    ad_storage: state,
    ad_user_data: state,
    ad_personalization: state,
    analytics_storage: state,
  };
}

/** Remove Google Analytics / Ads cookies after a "Decline" from Cookie settings. */
function clearGoogleCookies() {
  const names = document.cookie
    .split('; ')
    .map((c) => c.split('=')[0])
    .filter((n) => /^(_ga|_gid|_gat|_gcl_)/.test(n));
  if (!names.length) return;
  // Google sets them on the widest domain it can (".rovora.eu"), so try each level.
  const parts = window.location.hostname.split('.');
  const domains = [''];
  for (let i = 0; i < parts.length - 1; i++) domains.push(`; Domain=${parts.slice(i).join('.')}`);
  for (const n of names) for (const d of domains) document.cookie = `${n}=; Max-Age=0; Path=/${d}`;
}

/**
 * Bring Google's tags in line with the visitor's cookie answer and the current
 * page. Called on every route change and whenever the answer changes.
 */
export function syncGoogleTag(path: string) {
  if (typeof window === 'undefined') return;
  const consent = getConsent();
  const state: ConsentState = consent === 'granted' && !isAppRoute(path) ? 'granted' : 'denied';

  if (loaded) {
    // Already on the page: a later "Decline", or a client-side link into the
    // signed-in app, switches Google's cookies back off.
    if (state !== applied) {
      gtag('consent', 'update', signals(state));
      applied = state;
    }
    if (consent === 'denied') clearGoogleCookies();
    return;
  }

  if (state !== 'granted') return;
  if (!trackingEnabled({ honourOptOut: !/[?&]gtm_debug=/.test(window.location.search) })) return;

  loaded = true;
  applied = state;
  gtag('consent', 'default', signals(state));
  // Google's standard container snippet, minus the inline <script>.
  const w = window as DataLayerWindow;
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
  document.head.appendChild(script);
}
